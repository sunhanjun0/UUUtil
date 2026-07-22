/**
 * 终端 PTY 管理 —— 基于 node-pty，仅供用户手动操作。
 *
 * 安全说明：这是一个完整的交互式 shell，不对命令做任何过滤，
 * 因此严禁将该通道暴露给 AI 助手或任何远程内容驱动的调用方。
 */

import * as os from 'os';
import { spawnSync } from 'child_process';
import * as pty from 'node-pty';
import type { WebContents } from 'electron';
import { info as logInfo, warn as logWarn, getDatabase, autoSave } from '../core';

interface TerminalSession {
  pty: pty.IPty;
  webContents: WebContents;
  tmuxName?: string;
}

export interface CreateTerminalOptions {
  cols?: number;
  rows?: number;
  /** 恢复既有 tmux 会话时传入其 session 名；仅接受内部约定格式，非法值忽略。 */
  restoreTmuxName?: string;
}

export interface CreateTerminalResult {
  id: string;
  /** tmux 后端时为 session 名；降级为普通 shell 时为 null（不可持久化）。 */
  tmuxName: string | null;
}

export interface PersistedTerminalSession {
  tmuxName: string;
  title: string;
  sortOrder: number;
}

/** tmux session 名的合法格式：仅内部生成，防止命令/选项注入。 */
const TMUX_NAME_PATTERN = /^uuutil-[A-Za-z0-9-]+$/;

const sessions = new Map<string, TerminalSession>();

function makeTerminalId(): string {
  return `term-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolveShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe';
  return process.env.SHELL || '/bin/zsh';
}

/** 检测 tmux 是否可用（缓存结果）。tmux 只作为持久化后端，session 名由内部生成。 */
let tmuxAvailable: boolean | null = null;
function isTmuxAvailable(): boolean {
  if (tmuxAvailable !== null) return tmuxAvailable;

  // 如果已经在 tmux 环境中运行（比如在 Orca 内），不嵌套使用 tmux，避免冲突
  if (process.env.TMUX) {
    logInfo('terminal', 'tmux_skipped', { reason: 'already_in_tmux' });
    return tmuxAvailable = false;
  }

  try {
    const result = spawnSync('tmux', ['-V'], { encoding: 'utf8' });
    tmuxAvailable = result.status === 0;
    if (tmuxAvailable) {
      logInfo('terminal', 'tmux_detected', { version: (result.stdout || '').trim() });
    } else {
      logInfo('terminal', 'tmux_unavailable', { reason: 'nonzero_exit' });
    }
  } catch {
    tmuxAvailable = false;
    logInfo('terminal', 'tmux_unavailable', { reason: 'spawn_error' });
  }
  return tmuxAvailable;
}

/** 真正销毁一个 tmux session（用户主动关标签时调用）。session 名由内部生成，不接受外部注入。 */
function killTmuxSession(tmuxName: string): void {
  try {
    const result = spawnSync('tmux', ['kill-session', '-t', tmuxName], { encoding: 'utf8' });
    if (result.status !== 0) {
      logWarn('terminal', 'tmux_kill_session_failed', { tmuxName, stderr: (result.stderr || '').trim() });
    }
  } catch (error) {
    logWarn('terminal', 'tmux_kill_session_error', { tmuxName, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Claude Code 注入的会话标记（CLAUDECODE / CLAUDE_CODE_*）。
 * 若原样透传给子终端，里面再运行的 claude 会误判「已在会话中」而拒绝启动，需剔除。
 */
const CLAUDE_SESSION_ENV = /^CLAUDECODE$|^CLAUDE_CODE_/;

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue;
    if (CLAUDE_SESSION_ENV.test(key)) continue;
    env[key] = value;
  }
  env.TERM = 'xterm-256color';
  return env;
}

/**
 * 解析写入系统剪贴板的命令（作为 tmux copy-pipe 的目标）。缓存结果。
 * - macOS：pbcopy（系统自带）
 * - Windows：clip（系统自带）
 * - Linux/其他：Wayland 优先 wl-copy，X11 用 xclip/xsel；仅返回实际存在的命令。
 * 返回值作为单个 shell 命令字符串传给 tmux，由 tmux 用 /bin/sh 执行。
 */
let clipboardCommand: string | null | undefined;
function resolveClipboardCommand(): string | null {
  if (clipboardCommand !== undefined) return clipboardCommand;
  if (process.platform === 'darwin') {
    clipboardCommand = 'pbcopy';
  } else if (process.platform === 'win32') {
    clipboardCommand = 'clip';
  } else {
    // 候选命令名均为硬编码常量，无外部输入；仅挑选系统上实际存在的一个。
    const candidates = process.env.WAYLAND_DISPLAY
      ? ['wl-copy', 'xclip -selection clipboard', 'xsel --clipboard --input']
      : ['xclip -selection clipboard', 'xsel --clipboard --input', 'wl-copy'];
    clipboardCommand = candidates.find((cmd) => {
      try {
        return spawnSync('command', ['-v', cmd.split(' ')[0]], { encoding: 'utf8', shell: '/bin/sh' }).status === 0;
      } catch {
        return false;
      }
    }) ?? null;
  }
  logInfo('terminal', 'clipboard_resolved', { command: clipboardCommand });
  return clipboardCommand;
}

/** 创建一个 PTY 会话，输出通过 sender 推送到对应渲染进程，返回会话 id 与 tmux 名。 */
export function createTerminalSession(sender: WebContents, options?: CreateTerminalOptions): CreateTerminalResult {
  const cwd = os.homedir();
  const cols = options?.cols ?? 80;
  const rows = options?.rows ?? 24;
  const env = buildEnv();
  const id = makeTerminalId();

  // 恢复模式：仅当传入的 tmux 名符合内部约定格式时才采用，否则忽略（视为新建）。
  const restore = options?.restoreTmuxName && TMUX_NAME_PATTERN.test(options.restoreTmuxName)
    ? options.restoreTmuxName
    : undefined;

  // tmux 可用时以 tmux 为持久化后端；session 名仅内部生成（禁止外部注入）。
  // 否则降级回普通交互式 shell。
  const useTmux = isTmuxAvailable();
  let ptyProcess: pty.IPty;
  let tmuxName: string | null = null;
  let backend: string;
  if (useTmux) {
    // -A：session 存在则 attach（恢复），不存在则新建（幂等）。
    // `; set status off`：隐藏 tmux 状态栏，回收一行高度并弱化 tmux 存在感（幂等）。
    // `; set -g mouse on`：开启鼠标模式，让 tmux 接管滚轮滚动其历史缓冲（copy-mode）。
    //   否则 tmux 占用 alternate screen 时，xterm 会把滚轮转成方向键，误触发 shell 命令历史。
    tmuxName = restore ?? `uuutil-${id}`;
    const tmuxArgs = ['new-session', '-A', '-s', tmuxName, ';', 'set', 'status', 'off', ';', 'set', '-g', 'mouse', 'on'];
    // 鼠标模式接管拖拽后，浏览器原生框选失效。绑定 MouseDragEnd1Pane 到 copy-pipe，
    // 让框选松手即写入系统剪贴板（弥补无法用 xterm 原生选择复制的问题）。
    // 默认 copy-mode 表 + vi 表都绑，兼容用户任一 mode-keys 设置。
    const clipboardCmd = resolveClipboardCommand();
    if (clipboardCmd) {
      for (const table of ['copy-mode', 'copy-mode-vi']) {
        tmuxArgs.push(';', 'bind-key', '-T', table, 'MouseDragEnd1Pane', 'send-keys', '-X', 'copy-pipe-and-cancel', clipboardCmd);
      }
    }
    ptyProcess = pty.spawn('tmux', tmuxArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
    });
    backend = 'tmux';
  } else {
    const shell = resolveShell();
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
    });
    backend = shell;
  }

  sessions.set(id, { pty: ptyProcess, webContents: sender, tmuxName: tmuxName ?? undefined });
  logInfo('terminal', restore ? 'session_restored' : 'session_created', { id, backend, tmuxName, cwd, pid: ptyProcess.pid });

  ptyProcess.onData((data) => {
    if (!sender.isDestroyed()) sender.send('core:terminal:data', id, data);
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (!sender.isDestroyed()) sender.send('core:terminal:exit', id, exitCode, signal);
    sessions.delete(id);
    logInfo('terminal', 'session_exited', { id, exitCode, signal });
  });

  return { id, tmuxName };
}

/** 读取持久化的终端会话元数据（供渲染进程启动时恢复标签）。 */
export function listPersistedSessions(): PersistedTerminalSession[] {
  const db = getDatabase();
  const statement = db.prepare('SELECT tmux_name, title, sort_order FROM terminal_sessions ORDER BY sort_order ASC');
  const result: PersistedTerminalSession[] = [];
  try {
    while (statement.step()) {
      const row = statement.getAsObject();
      result.push({
        tmuxName: String(row.tmux_name),
        title: String(row.title),
        sortOrder: Number(row.sort_order),
      });
    }
  } finally {
    statement.free();
  }
  return result;
}

/**
 * 全量替换持久化的终端会话元数据（渲染进程为唯一真源）。
 * 只接受符合内部约定格式的 tmux 名，过滤非法项防止注入。
 */
export function savePersistedSessions(list: PersistedTerminalSession[]): { success: true } {
  const db = getDatabase();
  const valid = Array.isArray(list)
    ? list.filter((item) => item && typeof item.tmuxName === 'string' && TMUX_NAME_PATTERN.test(item.tmuxName))
    : [];
  db.run('DELETE FROM terminal_sessions');
  const now = Date.now();
  valid.forEach((item, index) => {
    const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim().slice(0, 200) : `终端 ${index + 1}`;
    const sortOrder = Number.isFinite(item.sortOrder) ? item.sortOrder : index;
    db.run('INSERT INTO terminal_sessions (tmux_name, title, sort_order, created_at) VALUES (?, ?, ?, ?)', [item.tmuxName, title, sortOrder, now]);
  });
  autoSave();
  logInfo('terminal', 'sessions_persisted', { count: valid.length });
  return { success: true };
}

/** 列出当前 tmux server 上属于本应用命名空间（uuutil-*）的 live session 名。 */
function listTmuxSessions(): Set<string> {
  const live = new Set<string>();
  try {
    const result = spawnSync('tmux', ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf8' });
    if (result.status === 0) {
      for (const line of (result.stdout || '').split('\n')) {
        const name = line.trim();
        if (name && TMUX_NAME_PATTERN.test(name)) live.add(name);
      }
    }
    // 非 0（如「no server running」）视为无 live session。
  } catch { /* 忽略：tmux 不可用时返回空集 */ }
  return live;
}

function deletePersistedSession(tmuxName: string): void {
  getDatabase().run('DELETE FROM terminal_sessions WHERE tmux_name = ?', [tmuxName]);
}

/**
 * 启动对账：对比 DB 元数据与实际 tmux live session，返回真正可恢复的会话。
 * - DB 有记录但 tmux 无对应 session → 删除元数据（避免 `-A` 恢复出空白 session）。
 * - tmux 有 uuutil-* 但 DB 无记录 → 清理该孤儿 session（防累积泄漏）。
 * - tmux 不可用 → 跳过对账（保留 DB，等 tmux 恢复），返回空表让渲染进程新建。
 */
export function reconcileSessions(): PersistedTerminalSession[] {
  if (!isTmuxAvailable()) {
    logInfo('terminal', 'reconcile_skipped', { reason: 'tmux_unavailable' });
    return [];
  }

  const persisted = listPersistedSessions();
  const live = listTmuxSessions();

  const alive = persisted.filter((p) => live.has(p.tmuxName));
  const dbOrphans = persisted.filter((p) => !live.has(p.tmuxName));
  if (dbOrphans.length > 0) {
    for (const orphan of dbOrphans) deletePersistedSession(orphan.tmuxName);
    autoSave();
    logInfo('terminal', 'orphan_cleaned', { type: 'db_without_tmux', count: dbOrphans.length });
  }

  const dbNames = new Set(persisted.map((p) => p.tmuxName));
  const tmuxOrphans = [...live].filter((name) => !dbNames.has(name));
  for (const name of tmuxOrphans) killTmuxSession(name);
  if (tmuxOrphans.length > 0) {
    logInfo('terminal', 'orphan_cleaned', { type: 'tmux_without_db', count: tmuxOrphans.length });
  }

  logInfo('terminal', 'reconciled', { alive: alive.length, dbOrphans: dbOrphans.length, tmuxOrphans: tmuxOrphans.length });
  return alive;
}

export function writeTerminal(id: string, data: string): void {
  sessions.get(id)?.pty.write(data);
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session) return;
  try {
    session.pty.resize(Math.max(1, cols), Math.max(1, rows));
  } catch (error) {
    logWarn('terminal', 'resize_failed', { id, error: error instanceof Error ? error.message : String(error) });
  }
}

export function disposeTerminal(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  // 用户主动关闭标签 = 明确销毁：先断开 pty 客户端，再真正 kill tmux session。
  const { tmuxName } = session;
  try {
    session.pty.kill();
  } catch { /* 进程可能已退出 */ }
  sessions.delete(id);
  if (tmuxName) killTmuxSession(tmuxName);
  logInfo('terminal', 'session_disposed', { id, tmuxName, killedSession: Boolean(tmuxName) });
}

/**
 * 应用退出时调用：只断开 pty 客户端（相当于 detach），
 * **不 kill tmux session**，让 tmux server 保留会话供下次恢复。
 */
export function disposeAllTerminals(): void {
  for (const [id, session] of sessions) {
    try {
      session.pty.kill();
    } catch { /* 忽略 */ }
    logInfo('terminal', 'session_detached', { id, tmuxName: session.tmuxName });
  }
  sessions.clear();
}

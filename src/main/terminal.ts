/**
 * 终端 PTY 管理 —— 基于 node-pty，仅供用户手动操作。
 *
 * 安全说明：这是一个完整的交互式 shell，不对命令做任何过滤，
 * 因此严禁将该通道暴露给 AI 助手或任何远程内容驱动的调用方。
 */

import * as os from 'os';
import * as pty from 'node-pty';
import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { info as logInfo, warn as logWarn } from '../core';

interface TerminalSession {
  pty: pty.IPty;
  webContents: WebContents;
}

interface CreateTerminalOptions {
  cols?: number;
  rows?: number;
}

const sessions = new Map<string, TerminalSession>();

function makeTerminalId(): string {
  return `term-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolveShell(): string {
  if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe';
  return process.env.SHELL || '/bin/zsh';
}

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env.TERM = 'xterm-256color';
  return env;
}

export function registerTerminalIpc(): void {
  ipcMain.handle('core:terminal:create', (event, options?: CreateTerminalOptions) => {
    const shell = resolveShell();
    const cwd = os.homedir();
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options?.cols ?? 80,
      rows: options?.rows ?? 24,
      cwd,
      env: buildEnv(),
    });

    const id = makeTerminalId();
    const sender = event.sender;
    sessions.set(id, { pty: ptyProcess, webContents: sender });
    logInfo('terminal', 'session_created', { id, shell, cwd, pid: ptyProcess.pid });

    ptyProcess.onData((data) => {
      if (!sender.isDestroyed()) sender.send('core:terminal:data', id, data);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      if (!sender.isDestroyed()) sender.send('core:terminal:exit', id, exitCode, signal);
      sessions.delete(id);
      logInfo('terminal', 'session_exited', { id, exitCode, signal });
    });

    return id;
  });

  ipcMain.on('core:terminal:input', (_event, id: string, data: string) => {
    sessions.get(id)?.pty.write(data);
  });

  ipcMain.on('core:terminal:resize', (_event, id: string, cols: number, rows: number) => {
    const session = sessions.get(id);
    if (!session) return;
    try {
      session.pty.resize(Math.max(1, cols), Math.max(1, rows));
    } catch (error) {
      logWarn('terminal', 'resize_failed', { id, error: error instanceof Error ? error.message : String(error) });
    }
  });

  ipcMain.on('core:terminal:dispose', (_event, id: string) => {
    const session = sessions.get(id);
    if (!session) return;
    try {
      session.pty.kill();
    } catch { /* 进程可能已退出 */ }
    sessions.delete(id);
    logInfo('terminal', 'session_disposed', { id });
  });
}

export function disposeAllTerminals(): void {
  for (const [, session] of sessions) {
    try {
      session.pty.kill();
    } catch { /* 忽略 */ }
  }
  sessions.clear();
}

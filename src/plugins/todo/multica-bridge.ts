/**
 * todo 插件 —— Multica 桥接层
 *
 * 主进程 spawn 本机 `multica` CLI（复用已认证凭据，不新增密钥管理），
 * 封装 todo × Multica 打通的四个能力：投影列表 / 详情 / 评论回写 / 建 issue。
 *
 * 约定：
 * - 全部调用超时 ≤15s；错误内化（返回 { ok:false, error }，永不抛出）；
 * - CLI 缺失 / 未认证 / 输出不可解析时静默降级，驾驶舱照常可用；
 * - 身份探测结论（2026-09 验证）：`multica user profile get --output json` 取当前成员 id，
 *   `issue list --assignee-id <member-uuid>` 过滤「分配给我」的 issue；
 * - 临时文件写 os.tmpdir() 下独立子目录，用后删除；CLI 侧需 --allow-external-file 放行（MUL-4252）。
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { info, warn } from '../../core/logger';
import {
  buildMulticaExternalRef,
  parseMulticaExternalRef,
} from '../../shared/todo-multica';
import type {
  CreateMulticaIssueInput,
  MulticaBridgeApi,
  MulticaBridgeResult,
  MulticaIssueSummary,
} from '../../shared/types';

const SCOPE = 'todo:multica';
const CLI_COMMAND = 'multica';
const CLI_TIMEOUT_MS = 15000;
/** 回写评论的统一标注（定稿决策：Mika 凭据代发，内容标注代驾驶舱回写）。 */
export const MULTICA_REWRITE_TAG = '——代驾驶舱回写';

// external_ref 组装/解析已上提到 shared/todo-multica.ts（渲染层共用），此处转出口保持既有 import 路径
export { buildMulticaExternalRef, parseMulticaExternalRef };

interface CliRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

/** spawn multica CLI 并收集输出；ENOENT / 超时 / 非零退出全部内化为 ok:false，永不抛出。 */
function runCli(args: string[]): Promise<CliRunResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (result: CliRunResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const meta = { cmd: args.slice(0, 3).join(' '), durationMs, ok: result.ok, error: result.error };
      if (result.ok) {
        info(SCOPE, 'cli_call_completed', meta);
      } else {
        warn(SCOPE, 'cli_call_failed', meta);
      }
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(CLI_COMMAND, args, { env: process.env });
    } catch (err) {
      finish({ ok: false, stdout, stderr, error: `multica CLI 启动失败: ${(err as Error).message}` });
      return;
    }

    timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ ok: false, stdout, stderr, error: `multica CLI 调用超时（>${CLI_TIMEOUT_MS}ms）` });
    }, CLI_TIMEOUT_MS);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      // ENOENT = CLI 未安装 / 未登录环境，静默降级
      finish({ ok: false, stdout, stderr, error: `multica CLI 不可用: ${err.message}` });
    });
    child.on('close', (code) => {
      if (code === 0) {
        finish({ ok: true, stdout, stderr });
      } else {
        finish({ ok: false, stdout, stderr, error: (stderr.trim() || `退出码 ${code}`).slice(0, 300) });
      }
    });
  });
}

/** 跑一条 --output json 命令并解析 stdout；解析失败同样内化。 */
async function runJson<T>(args: string[]): Promise<MulticaBridgeResult<T>> {
  const r = await runCli(args);
  if (!r.ok) return { ok: false, error: r.error ?? 'multica CLI 调用失败' };
  try {
    return { ok: true, data: JSON.parse(r.stdout) as T };
  } catch {
    return { ok: false, error: 'multica CLI 输出不是合法 JSON' };
  }
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function toNullStr(v: unknown): string | null {
  const s = toStr(v).trim();
  return s ? s : null;
}

/** CLI issue JSON → 摘要；缺 id 视为不可识别返回 null。projectTitle 由调用方按 projectId 回填。 */
function mapIssue(raw: unknown): MulticaIssueSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = toStr(o.id);
  if (!id) return null;
  return {
    id,
    identifier: toStr(o.identifier),
    title: toStr(o.title),
    status: toStr(o.status),
    priority: toStr(o.priority),
    projectId: toNullStr(o.project_id),
    projectTitle: null,
    dueAt: toNullStr(o.due_date),
    description: toNullStr(o.description),
    updatedAt: toStr(o.updated_at),
  };
}

/** 进程内缓存当前成员 id：profile 不随调用变化，省去每次投影两次 spawn。 */
let cachedMemberId: string | null = null;

async function resolveMemberId(): Promise<MulticaBridgeResult<string>> {
  if (cachedMemberId) return { ok: true, data: cachedMemberId };
  const r = await runJson<{ id?: unknown }>(['user', 'profile', 'get', '--output', 'json']);
  if (!r.ok) return r;
  const id = toStr((r.data as Record<string, unknown> | null)?.id).trim();
  if (!id) return { ok: false, error: '无法识别当前 Multica 用户身份' };
  cachedMemberId = id;
  return { ok: true, data: id };
}

/** 项目 id → 标题缓存：项目名录变动极少，60s TTL 避免每次投影多拉一次 CLI。 */
const PROJECT_CACHE_TTL_MS = 60_000;
let projectCache: { at: number; map: Map<string, string> } | null = null;

/** 拉取项目名录；失败静默降级（沿用旧缓存或空表，项目列仅作展示，不阻塞投影）。 */
async function resolveProjectTitles(): Promise<Map<string, string>> {
  if (projectCache && Date.now() - projectCache.at < PROJECT_CACHE_TTL_MS) return projectCache.map;
  const r = await runJson<unknown>(['project', 'list', '--output', 'json']);
  if (!r.ok) {
    warn(SCOPE, 'project_list_failed', { error: r.error });
    return projectCache?.map ?? new Map();
  }
  const map = new Map<string, string>();
  const arr = Array.isArray(r.data) ? (r.data as unknown[]) : [];
  for (const p of arr) {
    if (!p || typeof p !== 'object') continue;
    const id = toStr((p as Record<string, unknown>).id);
    const title = toStr((p as Record<string, unknown>).title);
    if (id && title) map.set(id, title);
  }
  projectCache = { at: Date.now(), map };
  return map;
}

async function listAssignedIssues(): Promise<MulticaBridgeResult<MulticaIssueSummary[]>> {
  const who = await resolveMemberId();
  if (!who.ok) return who;
  const [r, projects] = await Promise.all([
    runJson<{ issues?: unknown }>([
      'issue', 'list', '--assignee-id', who.data, '--status', 'todo,in_progress', '--output', 'json',
    ]),
    resolveProjectTitles(),
  ]);
  if (!r.ok) return r;
  const raw = Array.isArray((r.data as Record<string, unknown> | null)?.issues)
    ? ((r.data as Record<string, unknown>).issues as unknown[])
    : [];
  const issues = raw
    .map(mapIssue)
    .filter((i): i is MulticaIssueSummary => i !== null)
    .map((i) => ({ ...i, projectTitle: i.projectId ? projects.get(i.projectId) ?? null : null }));
  return { ok: true, data: issues };
}

async function getIssue(id: string): Promise<MulticaBridgeResult<MulticaIssueSummary>> {
  const issueId = toStr(id).trim();
  if (!issueId) return { ok: false, error: 'issue id 必填' };
  const r = await runJson<unknown>(['issue', 'get', issueId, '--output', 'json']);
  if (!r.ok) return r;
  const issue = mapIssue(r.data);
  if (!issue) return { ok: false, error: 'multica 返回的 issue 结构不可识别' };
  return { ok: true, data: issue };
}

/** 在 os.tmpdir() 下建独立子目录写临时文件；调用方 finally 里清理整个子目录。 */
function writeTempFile(filename: string, content: string): { file: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uuutil-multica-'));
  const file = path.join(dir, filename);
  fs.writeFileSync(file, content, 'utf8');
  return {
    file,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch { /* 清理失败不阻塞主流程 */ }
    },
  };
}

async function addComment(issueId: string, body: string): Promise<MulticaBridgeResult<null>> {
  const id = toStr(issueId).trim();
  if (!id) return { ok: false, error: 'issue id 必填' };
  const text = toStr(body).trim();
  if (!text) return { ok: false, error: '评论正文必填' };
  const content = text.endsWith(MULTICA_REWRITE_TAG) ? text : `${text}\n\n${MULTICA_REWRITE_TAG}`;

  let tmp: { file: string; cleanup: () => void };
  try {
    tmp = writeTempFile('comment.md', content);
  } catch (err) {
    return { ok: false, error: `评论临时文件写入失败: ${(err as Error).message}` };
  }
  try {
    const r = await runCli(['issue', 'comment', 'add', id, '--content-file', tmp.file, '--allow-external-file']);
    if (!r.ok) return { ok: false, error: r.error ?? '评论写入失败' };
    return { ok: true, data: null };
  } finally {
    tmp.cleanup();
  }
}

async function createIssue(input: CreateMulticaIssueInput): Promise<MulticaBridgeResult<MulticaIssueSummary>> {
  const title = toStr(input?.title).trim();
  if (!title) return { ok: false, error: 'title 必填' };
  const description = toStr(input?.description).trim();
  const project = toStr(input?.project).trim();

  const args = ['issue', 'create', '--title', title, '--output', 'json'];
  let tmp: { file: string; cleanup: () => void } | null = null;
  try {
    if (description) {
      tmp = writeTempFile('description.md', description);
      args.push('--description-file', tmp.file, '--allow-external-file');
    }
    if (project) args.push('--project', project);
    const r = await runJson<unknown>(args);
    if (!r.ok) return r;
    const issue = mapIssue(r.data);
    if (!issue) return { ok: false, error: 'multica 返回的 issue 结构不可识别' };
    return { ok: true, data: issue };
  } catch (err) {
    return { ok: false, error: `创建 issue 失败: ${(err as Error).message}` };
  } finally {
    tmp?.cleanup();
  }
}

export const multicaBridge: MulticaBridgeApi = {
  listAssignedIssues,
  getIssue,
  addComment,
  createIssue,
};

/** 缓存的 Multica Web app 地址（null = 已探测但不可解析）。 */
let cachedAppUrl: string | null | undefined;

/**
 * 解析 Multica Web app 地址（「打开 issue」跳系统浏览器的落点）：
 * 只读 ~/.multica/config.json 的 app_url 字段（缺省回退 server_url），
 * 文件内含凭据 token——绝不记录内容、绝不外传；不可解析时返回 null（打开入口静默禁用）。
 */
export function resolveMulticaAppUrl(): string | null {
  if (cachedAppUrl !== undefined) return cachedAppUrl;
  let url: string | null = null;
  try {
    const file = path.join(os.homedir(), '.multica', 'config.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const candidate = toNullStr(raw.app_url) ?? toNullStr(raw.server_url);
    if (candidate && /^https?:\/\//.test(candidate)) url = candidate.replace(/\/+$/, '');
  } catch {
    // 配置文件缺失/不可解析：静默降级
  }
  cachedAppUrl = url;
  return url;
}

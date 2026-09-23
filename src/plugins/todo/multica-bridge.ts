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

const EXTERNAL_REF_PREFIX = 'multica:';

/** 组装 external_ref：multica:<issue-uuid>:<identifier>（identifier 可缺省）。 */
export function buildMulticaExternalRef(issueId: string, identifier?: string): string {
  const base = `${EXTERNAL_REF_PREFIX}${issueId}`;
  return identifier ? `${base}:${identifier}` : base;
}

/** 解析 external_ref；非 multica ref 或缺 issue id 返回 null。 */
export function parseMulticaExternalRef(ref: string): { issueId: string; identifier: string | null } | null {
  if (typeof ref !== 'string' || !ref.startsWith(EXTERNAL_REF_PREFIX)) return null;
  const rest = ref.slice(EXTERNAL_REF_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return rest ? { issueId: rest, identifier: null } : null;
  const issueId = rest.slice(0, sep);
  return issueId ? { issueId, identifier: rest.slice(sep + 1) || null } : null;
}

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

/** CLI issue JSON → 摘要；缺 id 视为不可识别返回 null。 */
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
    dueAt: toNullStr(o.due_date),
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

async function listAssignedIssues(): Promise<MulticaBridgeResult<MulticaIssueSummary[]>> {
  const who = await resolveMemberId();
  if (!who.ok) return who;
  const r = await runJson<{ issues?: unknown }>([
    'issue', 'list', '--assignee-id', who.data, '--status', 'todo,in_progress', '--output', 'json',
  ]);
  if (!r.ok) return r;
  const raw = Array.isArray((r.data as Record<string, unknown> | null)?.issues)
    ? ((r.data as Record<string, unknown>).issues as unknown[])
    : [];
  const issues = raw
    .map(mapIssue)
    .filter((i): i is MulticaIssueSummary => i !== null);
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

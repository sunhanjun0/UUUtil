/**
 * knowledge-base ↔ OpenViking 集成
 *
 * 设计原则：本地 sql.js 仍是权威存储，OpenViking 作为语义检索与 Agent 上下文层。
 * - 写操作（新建/更新/删除笔记）后台写通到 `{rootUri}/notes/<noteId>.md`（fire-and-forget）
 * - 搜索在 OpenViking 可达时走语义 find（按 uri 中的 noteId 映射回本地笔记重排），
 *   不可达时自动回落本地 LIKE 搜索
 * - 所有 OpenViking 调用失败静默降级并记日志，绝不阻塞本地功能
 *
 * 服务端由用户自行安装运行（pip install openviking && openviking-server），
 * 连接配置存于 kb_ov_config 表（baseUrl / apiKey / rootUri / enabled）。
 */

import { OpenVikingClient } from '@openviking/sdk';
import { getDatabase } from '../../core/db';
import { info as logInfo, warn as logWarn } from '../../core/logger';
import type { KnowledgeNote } from '../../shared/types';

export interface OvConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  rootUri: string;
}

const DEFAULT_CONFIG: OvConfig = {
  enabled: true,
  baseUrl: 'http://127.0.0.1:1933',
  apiKey: '',
  rootUri: 'viking://resources/uuutil-kb',
};

const HEALTH_TTL_MS = 30_000;
const NOTE_ID_IN_URI = /([0-9a-fA-F-]{36})\.md$/;

let client: OpenVikingClient | null = null;
let healthCache: { ok: boolean; at: number } | null = null;

export function ensureOvConfigTable(): void {
  const db = getDatabase();
  db.run(`CREATE TABLE IF NOT EXISTS kb_ov_config (key TEXT PRIMARY KEY, value TEXT)`);
}

export function getOvConfig(): OvConfig {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT key, value FROM kb_ov_config`);
    const rows: Record<string, string> = {};
    try {
      while (stmt.step()) {
        const row = stmt.get();
        rows[String(row[0])] = String(row[1]);
      }
    } finally {
      stmt.free();
    }
    return {
      enabled: rows.enabled !== '0',
      baseUrl: rows.baseUrl || DEFAULT_CONFIG.baseUrl,
      apiKey: rows.apiKey ?? DEFAULT_CONFIG.apiKey,
      rootUri: rows.rootUri || DEFAULT_CONFIG.rootUri,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function setOvConfigValue(key: keyof OvConfig, value: string): void {
  const db = getDatabase();
  db.run(`INSERT INTO kb_ov_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
}

/** 配置变更后重建客户端与健康缓存 */
export function resetOvClient(): void {
  client = null;
  healthCache = null;
}

function getClient(): OpenVikingClient {
  if (!client) {
    const cfg = getOvConfig();
    client = new OpenVikingClient({
      baseUrl: cfg.baseUrl,
      ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
    });
  }
  return client;
}

export async function isOvAvailable(): Promise<boolean> {
  const cfg = getOvConfig();
  if (!cfg.enabled) return false;
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.ok;
  let ok = false;
  try {
    ok = await getClient().health();
  } catch {
    ok = false;
  }
  healthCache = { ok, at: Date.now() };
  return ok;
}

function noteUri(rootUri: string, noteId: string): string {
  return `${rootUri}/notes/${noteId}.md`;
}

function noteMarkdown(note: KnowledgeNote, categoryName: string | null, tagNames: string[]): string {
  const meta = [
    `id: ${note.id}`,
    categoryName ? `category: ${categoryName}` : null,
    tagNames.length > 0 ? `tags: [${tagNames.join(', ')}]` : null,
    `created_at: ${note.createdAt}`,
    `updated_at: ${note.updatedAt}`,
  ].filter(Boolean).join('\n');
  return `---\n${meta}\n---\n\n# ${note.title}\n\n${note.content}\n`;
}

export interface NoteMetaResolver {
  categoryName(categoryId: string | null): string | null;
  tagNames(tagIds: string[]): string[];
}

/** 写通单条笔记到 OpenViking；任何失败只记日志不抛出 */
export async function syncNoteUpsert(note: KnowledgeNote, resolver: NoteMetaResolver): Promise<boolean> {
  if (!(await isOvAvailable())) return false;
  const cfg = getOvConfig();
  try {
    try {
      await getClient().mkdir(`${cfg.rootUri}/notes`, 'UUUtil 知识库笔记');
    } catch { /* 目录已存在 */ }
    const markdown = noteMarkdown(note, resolver.categoryName(note.categoryId), resolver.tagNames(note.tagIds));
    // upsert：先 create（新建要求文件不存在），已存在则 replace（服务端 mode 语义见 OpenViking 文档）
    const uri = noteUri(cfg.rootUri, note.id);
    try {
      await getClient().write(uri, markdown, { mode: 'create' });
    } catch (err) {
      if (String(err).includes('ALREADY_EXISTS') || String(err).includes('already exists')) {
        await getClient().write(uri, markdown, { mode: 'replace' });
      } else {
        throw err;
      }
    }
    return true;
  } catch (err) {
    healthCache = { ok: false, at: Date.now() };
    logWarn('knowledge-base', 'ov_sync_upsert_failed', { noteId: note.id, error: String(err) });
    return false;
  }
}

/** 删除 OpenViking 中的笔记；NOT_FOUND 视为成功 */
export async function syncNoteDelete(noteId: string): Promise<boolean> {
  if (!(await isOvAvailable())) return false;
  const cfg = getOvConfig();
  try {
    await getClient().remove(noteUri(cfg.rootUri, noteId));
    return true;
  } catch (err) {
    if (String(err).includes('NOT_FOUND')) return true;
    logWarn('knowledge-base', 'ov_sync_delete_failed', { noteId, error: String(err) });
    return false;
  }
}

/**
 * 语义搜索：返回按相关度排序的 noteId 数组；OpenViking 不可达或失败时返回 null（调用方回落本地 LIKE）
 */
export async function semanticSearchIds(keyword: string, limit = 50): Promise<string[] | null> {
  if (!(await isOvAvailable())) return null;
  const cfg = getOvConfig();
  try {
    const result = await getClient().find(keyword, { targetUri: `${cfg.rootUri}/notes`, limit });
    const resources = (result.resources ?? []) as Array<{ uri?: unknown }>;
    const ids = resources
      .map((item) => NOTE_ID_IN_URI.exec(String(item?.uri ?? ''))?.[1])
      .filter((id): id is string => Boolean(id));
    return ids;
  } catch (err) {
    healthCache = { ok: false, at: Date.now() };
    logWarn('knowledge-base', 'ov_semantic_search_failed', { error: String(err) });
    return null;
  }
}

/** OpenViking 共享库检索命中项（account 内各 agent 的 memories/resources） */
export interface OvLibraryHit {
  uri: string;
  contextType: string;
  score: number;
  title: string;
  abstract: string;
}

// OpenViking 自动生成的目录 sidecar（.abstract.md / .overview.md），不是真实内容
const SIDECAR_PATTERN = /\.abstract\.md$|\.overview\.md$/;

function abstractTitle(abstract: string, uri: string): string {
  // 标题优先取摘要的首个可读行（uuid 文件名对人没有意义）
  const line = abstract
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '' && !l.startsWith('#') && !l.startsWith('---') && !/^\*\*/.test(l));
  if (line) return line.length > 60 ? `${line.slice(0, 60)}…` : line;
  const name = uri.split('/').filter(Boolean).pop() ?? uri;
  return name.replace(/\.md$/, '');
}

function normalizeHits(items: unknown[], contextType: string, excludePrefixes: string[]): OvLibraryHit[] {
  return items.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const uri = String(item.uri ?? '');
    return {
      uri,
      contextType: String(item.context_type ?? contextType),
      score: typeof item.score === 'number' ? item.score : 0,
      title: '',
      abstract: String(item.abstract ?? item.overview ?? ''),
    };
  })
    .filter((hit) => hit.uri !== '')
    // 剔除系统生成的目录摘要文件
    .filter((hit) => !SIDECAR_PATTERN.test(hit.uri))
    // 剔除本地笔记的同步副本（本地结果区已展示，避免重复）
    .filter((hit) => !excludePrefixes.some((prefix) => hit.uri.startsWith(prefix)))
    .map((hit) => ({ ...hit, title: abstractTitle(hit.abstract, hit.uri) }));
}

/**
 * 跨整个 account 的语义检索（共享库：各 agent 写入 resources/user 的内容）。
 * 不可达或失败返回 null（调用方只展示本地结果）。
 */
export async function searchOvLibrary(keyword: string, limit = 15): Promise<OvLibraryHit[] | null> {
  if (!(await isOvAvailable())) return null;
  const cfg = getOvConfig();
  try {
    const result = await getClient().find(keyword, { limit: limit + 10 }); // 多取一些，过滤 sidecar 后再截断
    const excludePrefixes = [`${cfg.rootUri}/`];
    const hits = [
      ...normalizeHits((result.resources ?? []) as unknown[], 'resource', excludePrefixes),
      ...normalizeHits((result.memories ?? []) as unknown[], 'memory', excludePrefixes),
    ];
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch (err) {
    healthCache = { ok: false, at: Date.now() };
    logWarn('knowledge-base', 'ov_library_search_failed', { error: String(err) });
    return null;
  }
}

/** 读取共享库某条内容的正文（剥离 frontmatter 展示层）；不可达/失败返回 null */
export async function readOvContent(uri: string): Promise<string | null> {
  if (!(await isOvAvailable())) return null;
  try {
    const content = await getClient().read(uri);
    return content.replace(/^---\n[\s\S]*?\n---\n\n?/, '');
  } catch (err) {
    logWarn('knowledge-base', 'ov_read_failed', { uri, error: String(err) });
    return null;
  }
}

/** 全量同步：启动或手动触发时把本地笔记全部写通到 OpenViking */
export async function syncAllNotes(notes: KnowledgeNote[], resolver: NoteMetaResolver): Promise<{ available: boolean; synced: number }> {
  if (!(await isOvAvailable())) {
    logInfo('knowledge-base', 'ov_sync_all_skipped_unavailable');
    return { available: false, synced: 0 };
  }
  let synced = 0;
  for (const note of notes) {
    if (await syncNoteUpsert(note, resolver)) synced += 1;
  }
  logInfo('knowledge-base', 'ov_sync_all_done', { total: notes.length, synced });
  return { available: true, synced };
}

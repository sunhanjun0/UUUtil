/**
 * clipboard 插件 —— 对外 API
 *
 * 铁律：这是 clipboard 插件对外暴露的唯一合法访问入口。
 * 其他地方（内核 / IPC / CLI）只能通过本文件访问插件能力，禁止 import 内部实现。
 *
 * 数据模型：plugin_clipboard_items 表，支持四类内容：
 *   - text     纯文本
 *   - richtext 带格式的 HTML（content 存纯文本供搜索/预览，HTML 落 meta.html）
 *   - image    图片（PNG 落盘到 userData/attachments/clipboard/，DB 只存文件名 + 缩略图 + 尺寸元数据）
 *   - file     单文件路径引用（不复制内容；macOS public.file-url）
 * 附加元数据统一 JSON 序列化进 meta_json 列。
 * 排序口径：pinned DESC, last_used_at DESC —— 置顶优先，其余按最近使用时间。
 */

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { URL, pathToFileURL } from 'url';
import { app, clipboard, nativeImage } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, autoSave } from '../../core/db';
import type { NativeImage } from 'electron';
import type {
  ClipboardApi,
  ClipboardItem,
  ClipboardItemMeta,
  ClipboardKind,
  ListClipboardOptions,
  RecordClipboardResult,
} from '../../shared/types';

/** 历史上限：非置顶条目最多保留多少条，超出按 last_used_at 淘汰最旧（四类混算）。 */
const MAX_ITEMS = 200;

/** 单条文本内容最大记录长度（字符），超长截断，避免巨型内容撑爆数据库与 UI。 */
const MAX_CONTENT_LENGTH = 20_000;

/** 富文本 HTML 最大长度（字符），超长截断。普通网页选区远低于此。 */
const MAX_HTML_LENGTH = 200_000;

/** 单张图片最大字节数（PNG 编码后），超限静默跳过，避免巨型图片撑爆磁盘。 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * 敏感内容过滤开关与规则（可选能力）。
 * 仅拦截高置信度的机密特征，宁缺毋滥，避免误删用户正常复制的内容。
 */
const SENSITIVE_FILTER_ENABLED = true;
const SENSITIVE_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM 私钥
  /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/i, // password=xxx 形式的凭据
  /\b(?:api[_-]?key|secret|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i, // api_key / token = 长串
];

// 注意：content_hash 不在此列 —— 它只用于去重查询，不需要回传给调用方。
// 保持列顺序与 mapRow 索引严格对齐，避免错位（曾经因混入 content_hash 导致 kind/pinned/length 整体错位）。
const SELECT_COLS =
  'id, content, kind, length, pinned, copy_count, created_at, last_used_at, meta_json';

/**
 * 轮询器与 copyToClipboard 共享的「最近一次已知剪贴板签名」(kind:hash)。
 * 用户从面板点「复制回剪贴板」时，这里会被更新，轮询器读到相同签名就不会重复记录。
 */
let lastSig: string | null = null;

export function getLastSig(): string | null {
  return lastSig;
}

export function setLastSig(sig: string | null): void {
  lastSig = sig;
}

/** 测试注入：覆盖落盘目录，避免碰真实 userData。生产代码不调用。 */
let clipboardDirOverride: string | null = null;
export function _setClipboardDirForTest(dir: string | null): void {
  clipboardDirOverride = dir;
}

function getClipboardDir(): string {
  const dir = clipboardDirOverride
    ? path.join(clipboardDirOverride, 'attachments', 'clipboard')
    : path.join(app.getPath('userData'), 'attachments', 'clipboard');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 初始化剪贴板历史表；由插件 activate 时在 core:ready 之后调用一次。 */
export function ensureClipboardTable(): void {
  const db = getDatabase();
  db.run(`
    CREATE TABLE IF NOT EXISTS plugin_clipboard_items (
      id           TEXT PRIMARY KEY,
      content      TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      kind         TEXT NOT NULL DEFAULT 'text',
      length       INTEGER NOT NULL,
      pinned       INTEGER NOT NULL DEFAULT 0,
      copy_count   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      meta_json    TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_clipboard_last_used ON plugin_clipboard_items (last_used_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON plugin_clipboard_items (content_hash)`);
  // 老库兼容：阶段 1 建的表没有 meta_json，补上；sql.js 无 IF NOT EXISTS 语法，靠 try
  try { db.run(`ALTER TABLE plugin_clipboard_items ADD COLUMN meta_json TEXT`); } catch { /* 已存在 */ }
  autoSave();
}

function selectRows(sql: string, params: unknown[] = []): unknown[][] {
  const db = getDatabase();
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: unknown[][] = [];
    while (stmt.step()) rows.push(stmt.get());
    return rows;
  } finally {
    stmt.free();
  }
}

function mapRow(row: unknown[]): ClipboardItem {
  // row 索引与 SELECT_COLS 严格对应：0 id, 1 content, 2 kind, 3 length, 4 pinned,
  // 5 copy_count, 6 created_at, 7 last_used_at, 8 meta_json
  const metaRaw = row[8];
  let meta: ClipboardItemMeta | undefined;
  if (typeof metaRaw === 'string' && metaRaw) {
    try { meta = JSON.parse(metaRaw) as ClipboardItemMeta; } catch { /* 损坏的 meta 忽略 */ }
  }
  return {
    id: String(row[0]),
    content: String(row[1]),
    kind: (row[2] as ClipboardItem['kind']) ?? 'text',
    length: Number(row[3]) || 0,
    pinned: Number(row[4]) === 1,
    copyCount: Number(row[5]) || 0,
    createdAt: String(row[6]),
    lastUsedAt: String(row[7]),
    meta,
  };
}

function contentHash(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

// ===== 剪贴板检测（读 + 签名）=====
// 集中在 api.ts：copyToClipboard 写回后用同一套逻辑读实际剪贴板状态来设 lastSig，
// 保证下一拍轮询读到的签名与基线一致，避免「回写即重复记录」（富文本/图片往返字节不一致）。

/** macOS 文件剪贴板格式。 */
const FILE_URL_FORMAT = 'public.file-url';

/** 图片剪贴板格式集合（macOS 主要是 public.tiff，跨平台兼容 png/jpeg/bmp）。 */
const IMAGE_FORMATS = new Set([
  'public.tiff', 'public.png', 'public.jpeg', 'image/png', 'image/jpeg', 'image/bmp', 'public.bmp',
]);

/** 检测结果：kind + 去重签名 + 回放/记录所需载荷。 */
export type ClipboardDetection =
  | { kind: 'file'; sig: string; filePath: string }
  | { kind: 'image'; sig: string; image: NativeImage }
  | { kind: 'richtext'; sig: string; text: string; html: string }
  | { kind: 'text'; sig: string; text: string }
  | { kind: 'empty'; sig: '' };

function sha(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function readFileUrl(): string | null {
  try {
    const buf = clipboard.readBuffer(FILE_URL_FORMAT);
    if (!buf || buf.length === 0) return null;
    const raw = buf.toString('utf8').replace(/\0+$/g, '').trim();
    if (!raw) return null;
    const u = new URL(raw);
    let p = decodeURIComponent(u.pathname);
    if (process.platform === 'win32') p = p.replace(/^\//, '');
    return p || null;
  } catch {
    return null;
  }
}

function hasImageFormat(formats: string[]): boolean {
  return formats.some((f) => IMAGE_FORMATS.has(f));
}

/**
 * 识别当前剪贴板形态。优先级 files > image > richtext > text。
 * 文本存在时跳过图片检测，省掉无谓的 readImage/toPNG；无文本才探测图片。
 */
export function detectClipboard(): ClipboardDetection {
  const formats = clipboard.availableFormats();

  if (formats.includes(FILE_URL_FORMAT)) {
    const filePath = readFileUrl();
    if (filePath) return { kind: 'file', sig: `file:${sha(filePath)}`, filePath };
    // file-url 读取失败则按文本兜底
  }

  const text = clipboard.readText();
  if (!text) {
    if (hasImageFormat(formats)) {
      const img = clipboard.readImage();
      if (img && !img.isEmpty()) {
        const png = img.toPNG();
        if (png && png.length > 0) return { kind: 'image', sig: `image:${sha(png)}`, image: img };
      }
    }
    return { kind: 'empty', sig: '' };
  }

  const html = clipboard.readHTML();
  if (html && html.trim()) {
    return { kind: 'richtext', sig: `richtext:${sha(`${text}\x00${html}`)}`, text, html };
  }
  return { kind: 'text', sig: `text:${sha(text)}`, text };
}

function isSensitive(content: string): boolean {
  if (!SENSITIVE_FILTER_ENABLED) return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(content));
}

function findByHash(hash: string): ClipboardItem | null {
  const rows = selectRows(
    `SELECT ${SELECT_COLS} FROM plugin_clipboard_items WHERE content_hash = ? LIMIT 1`,
    [hash],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/**
 * 公共去重 + 落库骨架：命中已有 hash 则刷新 last_used_at，否则插入新行。
 * 四类 record 共用，避免逻辑漂移。
 */
function upsertOrRefresh(
  hash: string,
  kind: ClipboardKind,
  content: string,
  length: number,
  meta: ClipboardItemMeta | undefined,
): RecordClipboardResult {
  const now = new Date().toISOString();
  const db = getDatabase();
  const metaJson = meta ? JSON.stringify(meta) : null;

  const existing = findByHash(hash);
  if (existing) {
    db.run(`UPDATE plugin_clipboard_items SET last_used_at = ? WHERE id = ?`, [now, existing.id]);
    autoSave();
    return { item: { ...existing, lastUsedAt: now }, deduped: true };
  }

  const id = `clip_${uuidv4()}`;
  db.run(
    `INSERT INTO plugin_clipboard_items
     (id, content, content_hash, kind, length, pinned, copy_count, created_at, last_used_at, meta_json)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
    [id, content, hash, kind, length, now, now, metaJson],
  );
  enforceLimit();
  autoSave();

  return {
    item: {
      id,
      content,
      kind,
      length,
      pinned: false,
      copyCount: 0,
      createdAt: now,
      lastUsedAt: now,
      meta,
    },
    deduped: false,
  };
}

/** 删除一条图片历史项的落盘文件（原图 + 缩略图）。非图片项无操作。 */
function deleteImageFiles(meta: ClipboardItemMeta | undefined): void {
  if (!meta?.image) return;
  const dir = getClipboardDir();
  for (const name of [meta.image.filename, meta.image.thumbFilename]) {
    if (!name) continue;
    const p = path.join(dir, name);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* 忽略单文件删除失败 */ }
  }
}

/** 淘汰超出上限的旧条目（仅清理非置顶，含其图片落盘文件清理）。 */
function enforceLimit(): void {
  const db = getDatabase();
  const countStmt = db.prepare(`SELECT COUNT(*) FROM plugin_clipboard_items WHERE pinned = 0`);
  let count = 0;
  try {
    if (countStmt.step()) count = Number(countStmt.get()[0]) || 0;
  } finally {
    countStmt.free();
  }
  if (count <= MAX_ITEMS) return;

  // 选出要淘汰的行（last_used_at 最旧的若干条），先清其图片文件再删行
  const toDelete = count - MAX_ITEMS;
  const over = selectRows(
    `SELECT id, meta_json FROM plugin_clipboard_items
     WHERE pinned = 0
     ORDER BY last_used_at ASC
     LIMIT ?`,
    [toDelete],
  );
  const ids: string[] = [];
  for (const row of over) {
    ids.push(String(row[0]));
    const metaRaw = row[1];
    if (typeof metaRaw === 'string' && metaRaw) {
      try { deleteImageFiles(JSON.parse(metaRaw)); } catch { /* 忽略 */ }
    }
  }
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM plugin_clipboard_items WHERE id IN (${placeholders})`, ids);
  }
}

export const api: ClipboardApi = {
  record(content: string): RecordClipboardResult | null {
    if (typeof content !== 'string') return null;
    const trimmed = content.replace(/\r\n/g, '\n');
    if (!trimmed.trim()) return null; // 空白内容不记录
    if (isSensitive(trimmed)) return null; // 命中敏感规则，静默跳过
    const stored = trimmed.length > MAX_CONTENT_LENGTH ? trimmed.slice(0, MAX_CONTENT_LENGTH) : trimmed;
    const hash = contentHash(stored);
    return upsertOrRefresh(hash, 'text', stored, stored.length, undefined);
  },

  recordRichText(plain: string, html: string): RecordClipboardResult | null {
    if (typeof plain !== 'string' || typeof html !== 'string') return null;
    const trimmed = plain.replace(/\r\n/g, '\n');
    if (!trimmed.trim() || !html.trim()) return null; // 纯文本空或无 html 不当富文本
    if (isSensitive(trimmed)) return null;
    const storedPlain = trimmed.length > MAX_CONTENT_LENGTH ? trimmed.slice(0, MAX_CONTENT_LENGTH) : trimmed;
    const storedHtml = html.length > MAX_HTML_LENGTH ? html.slice(0, MAX_HTML_LENGTH) : html;
    const hash = contentHash(`${storedPlain}\x00${storedHtml}`);
    return upsertOrRefresh(hash, 'richtext', storedPlain, storedPlain.length, { html: storedHtml });
  },

  recordImage(image: NativeImage): RecordClipboardResult | null {
    if (!image || image.isEmpty()) return null;
    const png = image.toPNG();
    if (!png || png.length === 0) return null;
    if (png.length > MAX_IMAGE_BYTES) return null; // 超限静默跳过
    const { width, height } = image.getSize();
    const id = `clip_${uuidv4()}`;
    const filename = `${id}-full.png`;
    const thumbFilename = `${id}-thumb.png`;
    const dir = getClipboardDir();
    fs.writeFileSync(path.join(dir, filename), png);
    // 缩略图：只给宽度，Electron 自动保持宽高比，控制体积供列表懒加载
    try {
      fs.writeFileSync(path.join(dir, thumbFilename), image.resize({ width: 200 }).toPNG());
    } catch { /* 缩略图失败不阻塞主路径，原图仍在 */ }

    const hash = contentHash(png);
    const meta: ClipboardItemMeta = {
      image: { filename, thumbFilename, width: width || 0, height: height || 0, sizeBytes: png.length, mime: 'image/png' },
    };
    return upsertOrRefresh(hash, 'image', '', png.length, meta);
  },

  recordFile(filePath: string): RecordClipboardResult | null {
    if (typeof filePath !== 'string' || !filePath) return null;
    if (!fs.existsSync(filePath)) return null; // 路径无效（文件已删/移动）静默跳过
    let stat: fs.Stats;
    try { stat = fs.statSync(filePath); } catch { return null; }
    const name = path.basename(filePath);
    const isDir = stat.isDirectory();
    const sizeBytes = stat.size || 0;
    const hash = contentHash(filePath);
    const meta: ClipboardItemMeta = { file: { path: filePath, name, sizeBytes, isDir } };
    return upsertOrRefresh(hash, 'file', name, 1, meta);
  },

  list(options?: ListClipboardOptions): ClipboardItem[] {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (options?.pinnedOnly) clauses.push('pinned = 1');
    if (options?.kind) clauses.push('kind = ?'), params.push(options.kind);
    if (options?.keyword && options.keyword.trim()) {
      // 转义 LIKE 通配符（% _ \），避免关键词内的这些字符被当成模式匹配
      const escaped = options.keyword.trim().replace(/[%_\\]/g, '\\$&');
      clauses.push(`content LIKE ? ESCAPE '\\'`);
      params.push(`%${escaped}%`);
    }
    let sql = `SELECT ${SELECT_COLS} FROM plugin_clipboard_items`;
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ` ORDER BY pinned DESC, last_used_at DESC LIMIT ?`;
    params.push(limit);
    return selectRows(sql, params).map(mapRow);
  },

  get(id: string): ClipboardItem | null {
    if (typeof id !== 'string' || !id) return null;
    const rows = selectRows(`SELECT ${SELECT_COLS} FROM plugin_clipboard_items WHERE id = ?`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  },

  copyToClipboard(id: string): ClipboardItem {
    const existing = this.get(id);
    if (!existing) throw new Error(`剪贴板记录不存在: ${id}`);
    const meta = existing.meta;
    switch (existing.kind) {
      case 'richtext':
        // 同时写 text + html：贴到富文本编辑器保留格式，贴到纯文本框得纯文本
        clipboard.write({ text: existing.content, html: meta?.html ?? existing.content });
        break;
      case 'image': {
        const file = meta?.image;
        if (file) {
          const full = path.join(getClipboardDir(), file.filename);
          if (fs.existsSync(full)) {
            const img = nativeImage.createFromPath(full);
            if (!img.isEmpty()) { clipboard.writeImage(img); break; }
          }
        }
        // 原图丢失则回退写空，避免把上次剪贴板内容当本次结果
        clipboard.clear();
        break;
      }
      case 'file': {
        const file = meta?.file;
        if (file && fs.existsSync(file.path)) {
          // macOS：写入 public.file-url（file:// URL + null 终止符），Finder ⌘V 可粘贴该文件
          const url = pathToFileURL(file.path).href;
          clipboard.writeBuffer('public.file-url', Buffer.from(`${url}\0`, 'utf8'));
        } else {
          clipboard.clear();
        }
        break;
      }
      default:
        clipboard.writeText(existing.content);
    }
    // 关键：用同一套检测逻辑读「实际」剪贴板状态设基线，而不是按存储内容算预期签名。
    // 富文本/图片经 macOS 剪贴板往返后字节可能变化，预期签名对不上会导致回写被当成新复制重复记录。
    setLastSig(detectClipboard().sig);

    const now = new Date().toISOString();
    const db = getDatabase();
    db.run(
      `UPDATE plugin_clipboard_items SET copy_count = copy_count + 1, last_used_at = ? WHERE id = ?`,
      [now, id],
    );
    autoSave();
    return { ...existing, copyCount: existing.copyCount + 1, lastUsedAt: now };
  },

  readThumbnail(id: string): string | null {
    const item = this.get(id);
    if (!item || item.kind !== 'image') return null;
    const file = item.meta?.image;
    if (!file) return null;
    const thumb = path.join(getClipboardDir(), file.thumbFilename);
    if (!fs.existsSync(thumb)) return null;
    try {
      const img = nativeImage.createFromPath(thumb);
      return img.isEmpty() ? null : img.toDataURL();
    } catch {
      return null;
    }
  },

  togglePin(id: string): ClipboardItem {
    const existing = this.get(id);
    if (!existing) throw new Error(`剪贴板记录不存在: ${id}`);
    const db = getDatabase();
    db.run(`UPDATE plugin_clipboard_items SET pinned = ? WHERE id = ?`, [existing.pinned ? 0 : 1, id]);
    autoSave();
    return { ...existing, pinned: !existing.pinned };
  },

  remove(id: string): void {
    if (typeof id !== 'string' || !id) throw new Error('id 必填');
    const existing = this.get(id);
    if (existing) deleteImageFiles(existing.meta);
    const db = getDatabase();
    db.run(`DELETE FROM plugin_clipboard_items WHERE id = ?`, [id]);
    autoSave();
  },

  clear(): number {
    const db = getDatabase();
    const before = this.count();
    // 先清掉所有待删图片项的落盘文件，再删行
    const rows = selectRows(
      `SELECT id, meta_json FROM plugin_clipboard_items WHERE pinned = 0 AND kind = 'image'`,
    );
    for (const row of rows) {
      const metaRaw = row[1];
      if (typeof metaRaw === 'string' && metaRaw) {
        try { deleteImageFiles(JSON.parse(metaRaw)); } catch { /* 忽略 */ }
      }
    }
    db.run(`DELETE FROM plugin_clipboard_items WHERE pinned = 0`);
    autoSave();
    const after = this.count();
    return before - after;
  },

  count(): number {
    const rows = selectRows(`SELECT COUNT(*) FROM plugin_clipboard_items`);
    const row = rows[0];
    if (!row) return 0;
    const n = Number(row[0]);
    return Number.isFinite(n) ? n : 0;
  },
};

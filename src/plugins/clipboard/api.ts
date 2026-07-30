/**
 * clipboard 插件 —— 对外 API
 *
 * 铁律：这是 clipboard 插件对外暴露的唯一合法访问入口。
 * 其他地方（内核 / IPC / CLI）只能通过本文件访问插件能力，禁止 import 内部实现。
 *
 * 数据模型：plugin_clipboard_items 表，文本历史为主，后续可扩展图片（kind 字段预留）。
 * 排序口径：pinned DESC, last_used_at DESC —— 置顶优先，其余按最近使用时间。
 */

import { createHash } from 'crypto';
import { clipboard } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, autoSave } from '../../core/db';
import type {
  ClipboardApi,
  ClipboardItem,
  ListClipboardOptions,
  RecordClipboardResult,
} from '../../shared/types';

/** 历史上限：非置顶条目最多保留多少条，超出按 last_used_at 淘汰最旧。 */
const MAX_ITEMS = 200;

/** 单条内容最大记录长度（字符），超长截断，避免巨型内容撑爆数据库与 UI。 */
const MAX_CONTENT_LENGTH = 20_000;

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

const SELECT_COLS =
  'id, content, kind, length, pinned, copy_count, created_at, last_used_at';

/**
 * 轮询器与 copyToClipboard 共享的「最近一次已知剪贴板文本」。
 * 用户从面板点「复制回剪贴板」时，这里会被更新，轮询器读到相同文本就不会重复记录。
 */
let lastSeenText: string | null = null;

export function getLastSeenText(): string | null {
  return lastSeenText;
}

export function setLastSeenText(text: string | null): void {
  lastSeenText = text;
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
      last_used_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_clipboard_last_used ON plugin_clipboard_items (last_used_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON plugin_clipboard_items (content_hash)`);
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
  return {
    id: String(row[0]),
    content: String(row[1]),
    kind: (row[2] as ClipboardItem['kind']) ?? 'text',
    length: Number(row[3]) || 0,
    pinned: Number(row[4]) === 1,
    copyCount: Number(row[5]) || 0,
    createdAt: String(row[6]),
    lastUsedAt: String(row[7]),
  };
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
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

/** 淘汰超出上限的旧条目（仅清理非置顶）。 */
function enforceLimit(): void {
  const db = getDatabase();
  // 预检：非置顶条目未达上限时直接跳过，避免每次 INSERT 都做全表排序子查询
  const countStmt = db.prepare(`SELECT COUNT(*) FROM plugin_clipboard_items WHERE pinned = 0`);
  let count = 0;
  try {
    if (countStmt.step()) count = Number(countStmt.get()[0]) || 0;
  } finally {
    countStmt.free();
  }
  if (count <= MAX_ITEMS) return;

  db.run(
    `DELETE FROM plugin_clipboard_items
     WHERE pinned = 0 AND id NOT IN (
       SELECT id FROM plugin_clipboard_items
       WHERE pinned = 0
       ORDER BY last_used_at DESC
       LIMIT ?
     )`,
    [MAX_ITEMS],
  );
}

export const api: ClipboardApi = {
  record(content: string): RecordClipboardResult | null {
    if (typeof content !== 'string') return null;
    const trimmed = content.replace(/\r\n/g, '\n');
    if (!trimmed.trim()) return null; // 空白内容不记录
    if (isSensitive(trimmed)) return null; // 命中敏感规则，静默跳过

    const stored = trimmed.length > MAX_CONTENT_LENGTH ? trimmed.slice(0, MAX_CONTENT_LENGTH) : trimmed;
    const hash = contentHash(stored);
    const now = new Date().toISOString();
    const db = getDatabase();

    // 去重：相同内容已存在则刷新 last_used_at，使其回到列表顶部
    const existing = findByHash(hash);
    if (existing) {
      db.run(
        `UPDATE plugin_clipboard_items SET last_used_at = ? WHERE id = ?`,
        [now, existing.id],
      );
      autoSave();
      return { item: { ...existing, lastUsedAt: now }, deduped: true };
    }

    const id = `clip_${uuidv4()}`;
    db.run(
      `INSERT INTO plugin_clipboard_items
       (id, content, content_hash, kind, length, pinned, copy_count, created_at, last_used_at)
       VALUES (?, ?, ?, 'text', ?, 0, 0, ?, ?)`,
      [id, stored, hash, stored.length, now, now],
    );
    enforceLimit();
    autoSave();

    return {
      item: {
        id,
        content: stored,
        kind: 'text',
        length: stored.length,
        pinned: false,
        copyCount: 0,
        createdAt: now,
        lastUsedAt: now,
      },
      deduped: false,
    };
  },

  list(options?: ListClipboardOptions): ClipboardItem[] {
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (options?.pinnedOnly) clauses.push('pinned = 1');
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
    const rows = selectRows(
      `SELECT ${SELECT_COLS} FROM plugin_clipboard_items WHERE id = ?`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  },

  copyToClipboard(id: string): ClipboardItem {
    const existing = this.get(id);
    if (!existing) throw new Error(`剪贴板记录不存在: ${id}`);
    // 写回系统剪贴板；同步更新 lastSeenText，避免轮询器把这次写回当成新复制重复记录
    clipboard.writeText(existing.content);
    lastSeenText = existing.content;

    const now = new Date().toISOString();
    const db = getDatabase();
    db.run(
      `UPDATE plugin_clipboard_items SET copy_count = copy_count + 1, last_used_at = ? WHERE id = ?`,
      [now, id],
    );
    autoSave();
    return { ...existing, copyCount: existing.copyCount + 1, lastUsedAt: now };
  },

  togglePin(id: string): ClipboardItem {
    const existing = this.get(id);
    if (!existing) throw new Error(`剪贴板记录不存在: ${id}`);
    const db = getDatabase();
    db.run(
      `UPDATE plugin_clipboard_items SET pinned = ? WHERE id = ?`,
      [existing.pinned ? 0 : 1, id],
    );
    autoSave();
    return { ...existing, pinned: !existing.pinned };
  },

  remove(id: string): void {
    if (typeof id !== 'string' || !id) throw new Error('id 必填');
    const db = getDatabase();
    db.run(`DELETE FROM plugin_clipboard_items WHERE id = ?`, [id]);
    autoSave();
  },

  clear(): number {
    const db = getDatabase();
    const before = this.count();
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

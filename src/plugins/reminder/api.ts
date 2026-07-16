/**
 * reminder 插件 —— 对外 API
 *
 * 铁律：这是 reminder 插件对外暴露的唯一合法访问入口。
 * 阶段 1：只提供 create / list / get，字段全部就位；
 *          status 只会写入 active，done/dismissed 由后续阶段的命令驱动。
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, autoSave } from '../../core/db';
import type {
  CreateReminderInput,
  ListRemindersOptions,
  Reminder,
  ReminderApi,
  ReminderSeverity,
  ReminderStatus,
  ReminderType,
} from '../../shared/types';

const VALID_TYPES: ReminderType[] = ['info', 'action'];
const VALID_SEVERITIES: ReminderSeverity[] = ['info', 'warning', 'error'];
const VALID_STATUSES: ReminderStatus[] = ['active', 'done', 'dismissed'];

/** 初始化提醒表；由插件 activate 时在 core:ready 之后调用一次。 */
export function ensureRemindersTable(): void {
  const db = getDatabase();
  db.run(`
    CREATE TABLE IF NOT EXISTS plugin_reminder_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      key TEXT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      done_at TEXT,
      metadata_json TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reminder_status_created ON plugin_reminder_items (status, created_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reminder_source_key ON plugin_reminder_items (source, key)`);
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

function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function mapRow(row: unknown[]): Reminder {
  return {
    id: String(row[0]),
    source: String(row[1]),
    key: row[2] === null || row[2] === undefined ? null : String(row[2]),
    type: row[3] as ReminderType,
    severity: row[4] as ReminderSeverity,
    title: String(row[5]),
    body: row[6] === null || row[6] === undefined ? null : String(row[6]),
    status: row[7] as ReminderStatus,
    createdAt: String(row[8]),
    updatedAt: String(row[9]),
    doneAt: row[10] === null || row[10] === undefined ? null : String(row[10]),
    metadata: parseMetadata(row[11]),
  };
}

export const api: ReminderApi = {
  create(input: CreateReminderInput): Reminder {
    if (!input || typeof input.source !== 'string' || !input.source.trim()) {
      throw new Error('source 必填');
    }
    if (typeof input.title !== 'string' || !input.title.trim()) {
      throw new Error('title 必填');
    }
    const type: ReminderType = input.type && VALID_TYPES.includes(input.type) ? input.type : 'info';
    const severity: ReminderSeverity =
      input.severity && VALID_SEVERITIES.includes(input.severity) ? input.severity : 'info';

    const id = `rem_${uuidv4()}`;
    const now = new Date().toISOString();
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    const db = getDatabase();
    db.run(
      `INSERT INTO plugin_reminder_items
       (id, source, key, type, severity, title, body, status, created_at, updated_at, done_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, ?)`,
      [
        id,
        input.source.trim(),
        input.key ? input.key.trim() : null,
        type,
        severity,
        input.title.trim(),
        input.body ? input.body : null,
        now,
        now,
        metadataJson,
      ],
    );
    autoSave();

    return {
      id,
      source: input.source.trim(),
      key: input.key ? input.key.trim() : null,
      type,
      severity,
      title: input.title.trim(),
      body: input.body ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      doneAt: null,
      metadata: input.metadata ?? null,
    };
  },

  list(options?: ListRemindersOptions): Reminder[] {
    const status: ReminderStatus =
      options?.status && VALID_STATUSES.includes(options.status) ? options.status : 'active';
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 200);
    const rows = selectRows(
      `SELECT id, source, key, type, severity, title, body, status, created_at, updated_at, done_at, metadata_json
       FROM plugin_reminder_items
       WHERE status = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [status, limit],
    );
    return rows.map(mapRow);
  },

  get(id: string): Reminder | null {
    if (typeof id !== 'string' || !id) return null;
    const rows = selectRows(
      `SELECT id, source, key, type, severity, title, body, status, created_at, updated_at, done_at, metadata_json
       FROM plugin_reminder_items WHERE id = ?`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  },
};

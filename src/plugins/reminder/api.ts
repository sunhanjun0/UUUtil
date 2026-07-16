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
  CreateReminderResult,
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
  create(input: CreateReminderInput): CreateReminderResult {
    if (!input || typeof input.source !== 'string' || !input.source.trim()) {
      throw new Error('source 必填');
    }
    if (typeof input.title !== 'string' || !input.title.trim()) {
      throw new Error('title 必填');
    }
    const source = input.source.trim();
    const key = input.key ? input.key.trim() : null;
    const type: ReminderType = input.type && VALID_TYPES.includes(input.type) ? input.type : 'info';
    const severity: ReminderSeverity =
      input.severity && VALID_SEVERITIES.includes(input.severity) ? input.severity : 'info';
    const title = input.title.trim();
    const body = input.body ?? null;
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    const now = new Date().toISOString();

    // 去重：同 source+key 存在 active 记录时，更新而不是新增
    if (key) {
      const existingRows = selectRows(
        `SELECT id, source, key, type, severity, title, body, status, created_at, updated_at, done_at, metadata_json
         FROM plugin_reminder_items
         WHERE source = ? AND key = ? AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`,
        [source, key],
      );
      if (existingRows.length > 0) {
        const existing = mapRow(existingRows[0]);
        const db = getDatabase();
        db.run(
          `UPDATE plugin_reminder_items
             SET type = ?, severity = ?, title = ?, body = ?, metadata_json = ?, updated_at = ?
           WHERE id = ?`,
          [type, severity, title, body, metadataJson, now, existing.id],
        );
        autoSave();
        return {
          reminder: {
            ...existing,
            type,
            severity,
            title,
            body,
            metadata: input.metadata ?? null,
            updatedAt: now,
          },
          deduped: true,
        };
      }
    }

    const id = `rem_${uuidv4()}`;
    const db = getDatabase();
    db.run(
      `INSERT INTO plugin_reminder_items
       (id, source, key, type, severity, title, body, status, created_at, updated_at, done_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, ?)`,
      [id, source, key, type, severity, title, body, now, now, metadataJson],
    );
    autoSave();

    return {
      reminder: {
        id,
        source,
        key,
        type,
        severity,
        title,
        body,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        doneAt: null,
        metadata: input.metadata ?? null,
      },
      deduped: false,
    };
  },

  countActiveActions(): number {
    const rows = selectRows(
      `SELECT COUNT(*) FROM plugin_reminder_items WHERE type = 'action' AND status = 'active'`,
    );
    const row = rows[0];
    if (!row) return 0;
    const n = Number(row[0]);
    return Number.isFinite(n) ? n : 0;
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

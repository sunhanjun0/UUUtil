/**
 * reminder 插件 —— 对外 API
 *
 * 铁律：这是 reminder 插件对外暴露的唯一合法访问入口。
 * 阶段 3：新增 ask / respond / dismiss。ask 会写入 actions_json，
 *          respond/dismiss 写入 response_json 并翻转 status。
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, autoSave } from '../../core/db';
import type {
  AskReminderInput,
  CreateReminderInput,
  CreateReminderResult,
  ListRemindersOptions,
  Reminder,
  ReminderAction,
  ReminderApi,
  ReminderResponse,
  ReminderSeverity,
  ReminderStatus,
  ReminderType,
  RespondReminderInput,
} from '../../shared/types';

const VALID_TYPES: ReminderType[] = ['info', 'action'];
const VALID_SEVERITIES: ReminderSeverity[] = ['info', 'warning', 'error'];
const VALID_STATUSES: ReminderStatus[] = ['active', 'done', 'dismissed'];

const SELECT_COLS = "id, source, key, type, severity, title, body, status, created_at, updated_at, done_at, metadata_json, actions_json, response_json, agent_id, topic, stage, priority, project, history_json";

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
      metadata_json TEXT,
      actions_json TEXT,
      response_json TEXT,
      agent_id TEXT,
      topic TEXT,
      stage TEXT,
      priority TEXT,
      project TEXT,
      history_json TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reminder_status_created ON plugin_reminder_items (status, created_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reminder_source_key ON plugin_reminder_items (source, key)`);
  // 老库兼容：阶段 1 建的表没有 actions_json / response_json，补上；sql.js 无 IF NOT EXISTS 语法，靠 try
  try { db.run(`ALTER TABLE plugin_reminder_items ADD COLUMN actions_json TEXT`); } catch { /* 已存在 */ }
  try { db.run(`ALTER TABLE plugin_reminder_items ADD COLUMN response_json TEXT`); } catch { /* 已存在 */ }
  try { db.run(`ALTER TABLE plugin_reminder_items ADD COLUMN agent_id TEXT`); } catch { /* 已存在 */ }
  try { db.run(`ALTER TABLE plugin_reminder_items ADD COLUMN topic TEXT`); } catch { /* 已存在 */ }
  try { db.run(`ALTER TABLE plugin_reminder_items ADD COLUMN stage TEXT`); } catch { /* 已存在 */ }
  try { db.run(`ALTER TABLE plugin_reminder_items ADD COLUMN priority TEXT`); } catch { /* 已存在 */ }
  try { db.run(`ALTER TABLE plugin_reminder_items ADD COLUMN project TEXT`); } catch { /* 已存在 */ }
  try { db.run(`ALTER TABLE plugin_reminder_items ADD COLUMN history_json TEXT`); } catch { /* 已存在 */ }
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

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
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

function parseActions(raw: unknown): ReminderAction[] | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((a) => a && typeof a === 'object' && typeof (a as any).id === 'string' && typeof (a as any).label === 'string')
      .map((a: any) => ({
        id: String(a.id),
        label: String(a.label),
        style: a.style === 'primary' || a.style === 'danger' ? a.style : undefined,
        requiresReason: a.requiresReason === true ? true : undefined,
      }));
  } catch {
    return null;
  }
}

function parseResponse(raw: unknown): ReminderResponse | null {
  const obj = parseJsonObject(raw);
  if (!obj) return null;
  if (typeof obj.actionId !== 'string' || typeof obj.respondedAt !== 'string') return null;
  return {
    actionId: obj.actionId,
    reason: typeof obj.reason === 'string' ? obj.reason : undefined,
    respondedAt: obj.respondedAt,
  };
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
    metadata: parseJsonObject(row[11]),
    actions: parseActions(row[12]),
    response: parseResponse(row[13]),
    agentId: row[14] === null || row[14] === undefined ? null : String(row[14]),
    topic: row[15] === null || row[15] === undefined ? null : String(row[15]),
    stage: row[16] === null || row[16] === undefined ? null : (row[16] as any),
    priority: row[17] === null || row[17] === undefined ? null : (row[17] as any),
    project: row[18] === null || row[18] === undefined ? null : String(row[18]),
    history: parseJsonObject(row[19]) ? (parseJsonObject(row[19]) as any).history : null,
  };
}

function normalizeActions(actions: unknown): ReminderAction[] {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new Error('actions 至少要有 1 条');
  }
  if (actions.length > 5) {
    throw new Error('actions 最多 5 条');
  }
  const seen = new Set<string>();
  const normalized: ReminderAction[] = [];
  for (const raw of actions) {
    if (!raw || typeof raw !== 'object') throw new Error('actions 元素必须是对象');
    const a = raw as Record<string, unknown>;
    const id = typeof a.id === 'string' ? a.id.trim() : '';
    const label = typeof a.label === 'string' ? a.label.trim() : '';
    if (!id) throw new Error('action.id 必填');
    if (!label) throw new Error('action.label 必填');
    if (seen.has(id)) throw new Error(`action.id 重复: ${id}`);
    seen.add(id);
    const style = a.style === 'primary' || a.style === 'danger' ? (a.style as 'primary' | 'danger') : undefined;
    const requiresReason = a.requiresReason === true ? true : undefined;
    const entry: ReminderAction = { id, label };
    if (style) entry.style = style;
    if (requiresReason) entry.requiresReason = true;
    normalized.push(entry);
  }
  return normalized;
}

function findActiveByKey(source: string, key: string): Reminder | null {
  const rows = selectRows(
    `SELECT ${SELECT_COLS}
     FROM plugin_reminder_items
     WHERE source = ? AND key = ? AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [source, key],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
}

/** 按 topic 查询最新一条提醒（不限状态）；无则返回 null。 */
function findLatestByTopic(topic: string): Reminder | null {
  const rows = selectRows(
    `SELECT ${SELECT_COLS}
     FROM plugin_reminder_items
     WHERE topic = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [topic],
  );
  return rows.length > 0 ? mapRow(rows[0]) : null;
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

    if (key) {
      const existing = findActiveByKey(source, key);
      if (existing) {
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
       (id, source, key, type, severity, title, body, status, created_at, updated_at, done_at, metadata_json, actions_json, response_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, ?, NULL, NULL)`,
      [id, source, key, type, severity, title, body, now, now, metadataJson],
    );
    autoSave();

    return {
      reminder: {
        id,
        source,
        key,
        agentId: null, topic: null, stage: null, priority: null, project: null, history: null,
        type,
        severity,
        title,
        body,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        doneAt: null,
        metadata: input.metadata ?? null,
        actions: null,
        response: null,
      },
      deduped: false,
    };
  },

  createAsk(input: AskReminderInput): { reminder: Reminder; deduped: boolean; supersededId: string | null } {
    if (!input || typeof input.source !== 'string' || !input.source.trim()) {
      throw new Error('source 必填');
    }
    if (typeof input.title !== 'string' || !input.title.trim()) {
      throw new Error('title 必填');
    }
    const actions = normalizeActions(input.actions);
    const source = input.source.trim();
    const key = input.key ? input.key.trim() : null;
    const severity: ReminderSeverity =
      input.severity && VALID_SEVERITIES.includes(input.severity) ? input.severity : 'info';
    const title = input.title.trim();
    const body = input.body ?? null;
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    const actionsJson = JSON.stringify(actions);
    const now = new Date().toISOString();
    const db = getDatabase();

    if (key) {
      const existing = findActiveByKey(source, key);
      if (existing) {
        db.run(
          `UPDATE plugin_reminder_items
             SET severity = ?, title = ?, body = ?, metadata_json = ?, actions_json = ?, updated_at = ?, type = 'action'
           WHERE id = ?`,
          [severity, title, body, metadataJson, actionsJson, now, existing.id],
        );
        autoSave();
        return {
          reminder: {
            ...existing,
            type: 'action',
            severity,
            title,
            body,
            metadata: input.metadata ?? null,
            actions,
            updatedAt: now,
          },
          deduped: true,
          // 同 key 命中：上一位等待者会被 superseded
          supersededId: existing.id,
        };
      }
    }

    const id = `rem_${uuidv4()}`;
    db.run(
      `INSERT INTO plugin_reminder_items
       (id, source, key, type, severity, title, body, status, created_at, updated_at, done_at, metadata_json, actions_json, response_json)
       VALUES (?, ?, ?, 'action', ?, ?, ?, 'active', ?, ?, NULL, ?, ?, NULL)`,
      [id, source, key, severity, title, body, now, now, metadataJson, actionsJson],
    );
    autoSave();

    return {
      reminder: {
        id,
        source,
        key,
        agentId: null, topic: null, stage: null, priority: null, project: null, history: null,
        type: 'action',
        severity,
        title,
        body,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        doneAt: null,
        metadata: input.metadata ?? null,
        actions,
        response: null,
      },
      deduped: false,
      supersededId: null,
    };
  },

  respond(input: RespondReminderInput): Reminder {
    if (!input || typeof input.id !== 'string' || !input.id) {
      throw new Error('id 必填');
    }
    if (typeof input.actionId !== 'string' || !input.actionId) {
      throw new Error('actionId 必填');
    }
    const existing = this.get(input.id);
    if (!existing) throw new Error(`提醒不存在: ${input.id}`);
    if (existing.status !== 'active') throw new Error(`提醒已处于 ${existing.status} 状态，无法响应`);
    const action = (existing.actions ?? []).find((a) => a.id === input.actionId);
    if (!action) throw new Error(`未定义的 actionId: ${input.actionId}`);
    if (action.requiresReason && (!input.reason || !input.reason.trim())) {
      throw new Error(`按钮 ${action.id} 需要 reason`);
    }
    const now = new Date().toISOString();
    const response: ReminderResponse = {
      actionId: action.id,
      respondedAt: now,
    };
    if (input.reason && input.reason.trim()) response.reason = input.reason.trim();

    const db = getDatabase();
    db.run(
      `UPDATE plugin_reminder_items
         SET status = 'done', response_json = ?, done_at = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(response), now, now, input.id],
    );
    autoSave();
    return {
      ...existing,
      status: 'done',
      response,
      doneAt: now,
      updatedAt: now,
    };
  },

  dismiss(id: string): Reminder {
    if (typeof id !== 'string' || !id) throw new Error('id 必填');
    const existing = this.get(id);
    if (!existing) throw new Error(`提醒不存在: ${id}`);
    if (existing.status !== 'active') throw new Error(`提醒已处于 ${existing.status} 状态`);
    const now = new Date().toISOString();
    const db = getDatabase();
    db.run(
      `UPDATE plugin_reminder_items
         SET status = 'dismissed', done_at = ?, updated_at = ?
       WHERE id = ?`,
      [now, now, id],
    );
    autoSave();
    return {
      ...existing,
      status: 'dismissed',
      doneAt: now,
      updatedAt: now,
    };
  },

  list(options?: ListRemindersOptions): Reminder[] {
    const hasStatus = options?.status && VALID_STATUSES.includes(options.status);
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 200);
    let sql = `SELECT ${SELECT_COLS}
       FROM plugin_reminder_items`;
    const params: unknown[] = [];
    if (hasStatus) {
      sql += ` WHERE status = ?`;
      params.push(options!.status);
    }
    sql += ` ORDER BY created_at DESC
       LIMIT ?`;
    params.push(limit);
    const rows = selectRows(sql, params);
    return rows.map(mapRow);
  },

  get(id: string): Reminder | null {
    if (typeof id !== 'string' || !id) return null;
    const rows = selectRows(
      `SELECT ${SELECT_COLS}
       FROM plugin_reminder_items WHERE id = ?`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
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

  // Agent 专属模式内部状态：topic -> waiter
  _agentWaiters: new Map<string, { resolve: (r: any | null) => void; timer: any }>(),

  agentUpdate(input: any) {
    const now = new Date().toISOString();
    const existing = findLatestByTopic(input.topic);

    let history: any[] = [];
    if (existing && existing.history) {
      history = [...existing.history];
    }
    if (existing) {
      // 旧版本记入历史，全量覆盖 body
      history.unshift({
        stage: existing.stage || 'info',
        body: existing.body || '',
        updatedAt: existing.updatedAt,
        metadata: existing.metadata,
      });
    }

    const actionsJson = input.actions ? JSON.stringify(input.actions) : null;
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;
    // SQL bind 不接受 undefined，全部显式转 null
    const safeInput = {
      agentId: input.agentId ? String(input.agentId) : null,
      topic: input.topic ? String(input.topic) : null,
      stage: input.stage ? String(input.stage) : null,
      priority: input.priority ? String(input.priority) : null,
      project: input.project ? String(input.project) : null,
      title: String(input.title),
      body: input.body ? String(input.body) : null,
    };
    const db = getDatabase();

    if (existing) {
      db.run(
        `UPDATE plugin_reminder_items
           SET stage = ?, priority = ?, project = ?, title = ?, body = ?, actions_json = ?, metadata_json = ?, updated_at = ?, history_json = ?
         WHERE id = ?`,
        [
          input.stage, input.priority, input.project || null,
          input.title, input.body, actionsJson, metadataJson, now,
          JSON.stringify({ history }),
          existing.id,
        ],
      );
      autoSave();

      const waiter = this._agentWaiters.get(input.topic);
      if (waiter) {
        const updated = findLatestByTopic(input.topic);
        if (updated && updated.response) {
          clearTimeout(waiter.timer);
          this._agentWaiters.delete(input.topic);
          waiter.resolve(updated);
        }
      }
      return findLatestByTopic(input.topic)!;
    }

    const id = `rem_${uuidv4()}`;
    db.run(
      `INSERT INTO plugin_reminder_items
       (id, source, key, type, severity, title, body, status, created_at, updated_at, done_at, metadata_json, actions_json, response_json, agent_id, topic, stage, priority, project, history_json)
       VALUES (?, ?, ?, 'action', ?, ?, ?, 'active', ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.agentId || null, input.topic || null,
        input.priority === 'high' ? 'warning' : 'info',
        input.title || '', input.body || '',
        now, now,
        metadataJson || null, actionsJson || null,
        input.agentId || null, input.topic || null, input.stage || null, input.priority || null, input.project || null,
        JSON.stringify({ history: history || [] }),
      ],
    );
    autoSave();
    return findLatestByTopic(input.topic)!;
  },

  agentQuery(topic: string): any | null {
    return findLatestByTopic(topic);
  },

  agentClose(topic: string, result: 'done' | 'cancelled' | 'superseded'): any {
    const existing = findLatestByTopic(topic);
    if (!existing) throw new Error(`topic 不存在: ${topic}`);
    const now = new Date().toISOString();
    const db = getDatabase();
    const closeStage = result === 'done' ? 'done' : 'stale';
    db.run(
      `UPDATE plugin_reminder_items SET status = 'done', stage = ?, updated_at = ?, done_at = ? WHERE id = ?`,
      [closeStage, now, now, existing.id],
    );
    autoSave();

    const waiter = this._agentWaiters.get(topic);
    if (waiter) {
      clearTimeout(waiter.timer);
      this._agentWaiters.delete(topic);
      waiter.resolve(findLatestByTopic(topic));
    }
    return findLatestByTopic(topic)!;
  },

  _setAgentWaiter(topic: string, resolveFn: any, timeoutMs: number): void {
    const existing = this._agentWaiters.get(topic);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      const w = this._agentWaiters.get(topic);
      if (w && w.timer === timer) {
        this._agentWaiters.delete(topic);
        resolveFn(null);
      }
    }, timeoutMs);

    this._agentWaiters.set(topic, { resolve: resolveFn, timer });
  },
};

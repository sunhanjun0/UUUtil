/**
 * todo 插件 —— 对外 API（数据层）
 *
 * 铁律：这是 todo 插件对外暴露的唯一合法访问入口。
 * Stage 1：todos / todo_lists 两表 + CRUD + done/reopen + 视图过滤 + 清单计数，
 *          不注册 CLI 命令、不含 UI。错误在插件内部抛出，由上层（CLI / IPC 边界）
 *          包装为 { success, error }，不传播到核心层。
 * Stage 5：listDue（到期巡查数据源）+ parseDueAtMs（date-only 按本地零点解析）。
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, autoSave } from '../../core/db';
import type {
  CreateTodoInput,
  CreateTodoListInput,
  ListTodosOptions,
  Todo,
  TodoApi,
  TodoList,
  TodoStatus,
  TodoSubtask,
  UpdateTodoInput,
  UpdateTodoListInput,
} from '../../shared/types';

const VALID_STATUSES: TodoStatus[] = ['todo', 'doing', 'done', 'cancelled'];
/** 未完成（计入清单 openCount、默认出现在各视图）的状态。 */
const OPEN_STATUSES: TodoStatus[] = ['todo', 'doing'];

const SELECT_COLS =
  'id, title, note, status, priority, due_at, list_id, tags, subtasks, sort_order, completed_at, created_at, updated_at';

/** 初始化事项与清单表；由插件 activate 时在 core:ready 之后调用（幂等）。 */
export function ensureTodoTables(): void {
  const db = getDatabase();
  db.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done','cancelled')),
      priority INTEGER NOT NULL DEFAULT 0,
      due_at TEXT,
      list_id TEXT,
      tags TEXT,
      subtasks TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS todo_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_todos_status_due ON todos (status, due_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_todos_list ON todos (list_id)`);
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

function toNullableString(raw: unknown): string | null {
  return raw === null || raw === undefined ? null : String(raw);
}

function parseStringArray(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === '') return [];
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    return [];
  }
}

function parseSubtasks(raw: unknown): TodoSubtask[] {
  if (raw === null || raw === undefined || raw === '') return [];
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s === 'object' && typeof (s as any).title === 'string')
      .map((s: any) => ({
        id: typeof s.id === 'string' && s.id ? s.id : `sub_${uuidv4()}`,
        title: String(s.title),
        done: s.done === true,
      }));
  } catch {
    return [];
  }
}

function mapRow(row: unknown[]): Todo {
  return {
    id: String(row[0]),
    title: String(row[1]),
    note: toNullableString(row[2]),
    status: row[3] as TodoStatus,
    priority: Number(row[4]) || 0,
    dueAt: toNullableString(row[5]),
    listId: toNullableString(row[6]),
    tags: parseStringArray(row[7]),
    subtasks: parseSubtasks(row[8]),
    sortOrder: Number(row[9]) || 0,
    completedAt: toNullableString(row[10]),
    createdAt: String(row[11]),
    updatedAt: String(row[12]),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 本地当天日期（YYYY-MM-DD），作为 today 视图的默认基准日。 */
function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clampPriority(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), 3);
}

/** dueAt 归一化：undefined/null/空串 → null；其余必须可解析为日期，原样存储（date() 兼容日期与日期时间）。 */
function normalizeDueAt(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (Number.isNaN(new Date(s).getTime())) {
    throw new Error(`dueAt 格式非法: ${s}`);
  }
  return s;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * dueAt 解析为 epoch 毫秒：date-only（YYYY-MM-DD）按本地零点计
 * （与面板「DUE 今天」语义一致，避免 `new Date('YYYY-MM-DD')` 的 UTC 零点偏差）；
 * 其余交给 Date 解析。非法输入返回 null。
 */
export function parseDueAtMs(dueAt: string): number | null {
  const s = dueAt.trim();
  const m = DATE_ONLY_RE.exec(s);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  }
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const tag = t.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function normalizeSubtasks(raw: unknown): TodoSubtask[] {
  if (!Array.isArray(raw)) return [];
  const subtasks: TodoSubtask[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const title = typeof (s as any).title === 'string' ? (s as any).title.trim() : '';
    if (!title) continue;
    const id = typeof (s as any).id === 'string' && (s as any).id ? (s as any).id : `sub_${uuidv4()}`;
    subtasks.push({ id, title, done: (s as any).done === true });
  }
  return subtasks;
}

function assertListExists(listId: string): void {
  const rows = selectRows('SELECT COUNT(*) FROM todo_lists WHERE id = ?', [listId]);
  if (!Number(rows[0]?.[0])) throw new Error(`清单不存在: ${listId}`);
}

/** 新事项 / 移入清单时追加到末尾：目标清单（含收集箱）内 sort_order 最大值 + 1。 */
function nextSortOrder(listId: string | null): number {
  const rows = listId === null
    ? selectRows('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todos WHERE list_id IS NULL')
    : selectRows('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todos WHERE list_id = ?', [listId]);
  return Number(rows[0]?.[0]) || 0;
}

/**
 * 状态流转的统一出口（update 的 status 字段与 done/reopen 都走这里）：
 * 进入 done 写 completedAt；离开 done 清空；其余流转只改 status。
 */
function applyStatusTransition(todo: Todo, status: TodoStatus, now: string): void {
  if (!VALID_STATUSES.includes(status)) throw new Error(`非法状态: ${status}`);
  if (status === todo.status) return;
  if (status === 'done') {
    todo.completedAt = now;
  } else if (todo.status === 'done') {
    todo.completedAt = null;
  }
  todo.status = status;
}

function persistTodo(todo: Todo): void {
  const db = getDatabase();
  db.run(
    `UPDATE todos
        SET title = ?, note = ?, status = ?, priority = ?, due_at = ?, list_id = ?,
            tags = ?, subtasks = ?, sort_order = ?, completed_at = ?, updated_at = ?
      WHERE id = ?`,
    [
      todo.title, todo.note, todo.status, todo.priority, todo.dueAt, todo.listId,
      JSON.stringify(todo.tags), JSON.stringify(todo.subtasks), todo.sortOrder, todo.completedAt,
      todo.updatedAt, todo.id,
    ],
  );
  autoSave();
}

export const api: TodoApi = {
  create(input: CreateTodoInput): Todo {
    const title = typeof input?.title === 'string' ? input.title.trim() : '';
    if (!title) throw new Error('title 必填');
    const listId = input.listId ? String(input.listId) : null;
    if (listId) assertListExists(listId);

    const id = `todo_${uuidv4()}`;
    const now = nowIso();
    const db = getDatabase();
    db.run(
      `INSERT INTO todos
       (id, title, note, status, priority, due_at, list_id, tags, subtasks, sort_order, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        id,
        title,
        input.note ? String(input.note) : null,
        clampPriority(input.priority),
        normalizeDueAt(input.dueAt),
        listId,
        JSON.stringify(normalizeTags(input.tags)),
        JSON.stringify(normalizeSubtasks(input.subtasks)),
        nextSortOrder(listId),
        now,
        now,
      ],
    );
    autoSave();
    return this.get(id)!;
  },

  get(id: string): Todo | null {
    if (typeof id !== 'string' || !id) return null;
    const rows = selectRows(`SELECT ${SELECT_COLS} FROM todos WHERE id = ?`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  },

  update(id: string, patch: UpdateTodoInput): Todo {
    const existing = this.get(id);
    if (!existing) throw new Error(`事项不存在: ${id}`);
    if (!patch || typeof patch !== 'object') throw new Error('patch 必填');

    const next: Todo = { ...existing };
    if (patch.title !== undefined) {
      const title = String(patch.title).trim();
      if (!title) throw new Error('title 不能为空');
      next.title = title;
    }
    if (patch.note !== undefined) {
      next.note = patch.note === null ? null : String(patch.note);
    }
    if (patch.priority !== undefined) {
      next.priority = clampPriority(patch.priority);
    }
    if (patch.dueAt !== undefined) {
      next.dueAt = normalizeDueAt(patch.dueAt);
    }
    if (patch.tags !== undefined) {
      next.tags = normalizeTags(patch.tags);
    }
    if (patch.subtasks !== undefined) {
      next.subtasks = normalizeSubtasks(patch.subtasks);
    }
    if (patch.listId !== undefined) {
      const listId = patch.listId === null ? null : String(patch.listId);
      if (listId) assertListExists(listId);
      if (listId !== existing.listId) {
        next.listId = listId;
        // 跨清单移动追加到新清单末尾；同 patch 显式给 sortOrder 时以显式值为准
        next.sortOrder = nextSortOrder(listId);
      }
    }
    if (patch.sortOrder !== undefined) {
      const n = Number(patch.sortOrder);
      if (!Number.isFinite(n)) throw new Error('sortOrder 必须是数字');
      next.sortOrder = Math.trunc(n);
    }
    if (patch.status !== undefined) {
      applyStatusTransition(next, patch.status, nowIso());
    }
    next.updatedAt = nowIso();
    persistTodo(next);
    return this.get(id)!;
  },

  remove(id: string): void {
    const existing = this.get(id);
    if (!existing) throw new Error(`事项不存在: ${id}`);
    const db = getDatabase();
    db.run('DELETE FROM todos WHERE id = ?', [id]);
    autoSave();
  },

  done(id: string): Todo {
    const existing = this.get(id);
    if (!existing) throw new Error(`事项不存在: ${id}`);
    if (!OPEN_STATUSES.includes(existing.status)) {
      throw new Error(`事项已是 ${existing.status} 状态，无法完成`);
    }
    const now = nowIso();
    const next: Todo = { ...existing, status: 'done', completedAt: now, updatedAt: now };
    persistTodo(next);
    return this.get(id)!;
  },

  reopen(id: string): Todo {
    const existing = this.get(id);
    if (!existing) throw new Error(`事项不存在: ${id}`);
    if (existing.status !== 'done' && existing.status !== 'cancelled') {
      throw new Error(`事项处于 ${existing.status} 状态，无法重开`);
    }
    const now = nowIso();
    const next: Todo = { ...existing, status: 'todo', completedAt: null, updatedAt: now };
    persistTodo(next);
    return this.get(id)!;
  },

  list(options?: ListTodosOptions): Todo[] {
    const view = options?.view;
    const where: string[] = [];
    const params: unknown[] = [];

    // 状态口径：done 视图只看 done；其余视图默认只看未完成，includeDone 放开全部状态
    if (view === 'done') {
      where.push(`status = 'done'`);
    } else if (!options?.includeDone) {
      where.push(`status IN ('todo','doing')`);
    }

    if (view === 'inbox') {
      where.push('list_id IS NULL');
    }
    if (view === 'today') {
      // 基准日默认本地今天；due_at 不晚于基准日（含逾期）
      const date = options?.date ? normalizeDueAt(options.date) : localToday();
      where.push(`due_at IS NOT NULL AND date(due_at) <= date(?)`);
      params.push(date);
    } else if (options?.date) {
      // 非 today 视图的 date：按 due_at 当日精确匹配
      where.push(`due_at IS NOT NULL AND date(due_at) = date(?)`);
      params.push(normalizeDueAt(options.date));
    }
    if (options?.listId) {
      where.push('list_id = ?');
      params.push(String(options.listId));
    }

    let orderBy = 'sort_order ASC, created_at ASC';
    if (view === 'done') {
      orderBy = 'completed_at DESC';
    } else if (view === 'today') {
      orderBy = 'date(due_at) ASC, priority DESC, sort_order ASC, created_at ASC';
    }

    const sql = `SELECT ${SELECT_COLS} FROM todos${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${orderBy}`;
    return selectRows(sql, params).map(mapRow);
  },

  listDue(now: Date): Todo[] {
    const rows = selectRows(
      `SELECT ${SELECT_COLS} FROM todos
       WHERE status IN ('todo','doing') AND due_at IS NOT NULL
       ORDER BY due_at ASC, priority DESC, sort_order ASC, created_at ASC`,
    );
    const nowMs = now.getTime();
    return rows
      .map(mapRow)
      .filter((t) => {
        const dueMs = t.dueAt ? parseDueAtMs(t.dueAt) : null;
        return dueMs !== null && dueMs <= nowMs;
      });
  },

  createList(input: CreateTodoListInput): TodoList {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) throw new Error('name 必填');
    const id = `list_${uuidv4()}`;
    const now = nowIso();
    const rows = selectRows('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todo_lists');
    const sortOrder = Number(rows[0]?.[0]) || 0;
    const db = getDatabase();
    db.run(
      `INSERT INTO todo_lists (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, name, input.color ? String(input.color) : null, sortOrder, now],
    );
    autoSave();
    return { id, name, color: input.color ? String(input.color) : null, sortOrder, createdAt: now };
  },

  updateList(id: string, patch: UpdateTodoListInput): TodoList {
    const rows = selectRows('SELECT id, name, color, sort_order, created_at FROM todo_lists WHERE id = ?', [id]);
    if (!rows.length) throw new Error(`清单不存在: ${id}`);
    if (!patch || typeof patch !== 'object') throw new Error('patch 必填');

    const current = rows[0];
    let name = String(current[1]);
    let color = toNullableString(current[2]);
    let sortOrder = Number(current[3]) || 0;
    if (patch.name !== undefined) {
      const n = String(patch.name).trim();
      if (!n) throw new Error('name 不能为空');
      name = n;
    }
    if (patch.color !== undefined) {
      color = patch.color === null ? null : String(patch.color);
    }
    if (patch.sortOrder !== undefined) {
      const n = Number(patch.sortOrder);
      if (!Number.isFinite(n)) throw new Error('sortOrder 必须是数字');
      sortOrder = Math.trunc(n);
    }
    const db = getDatabase();
    db.run('UPDATE todo_lists SET name = ?, color = ?, sort_order = ? WHERE id = ?', [name, color, sortOrder, id]);
    autoSave();
    return { id, name, color, sortOrder, createdAt: String(current[4]) };
  },

  removeList(id: string): void {
    const rows = selectRows('SELECT COUNT(*) FROM todo_lists WHERE id = ?', [id]);
    if (!Number(rows[0]?.[0])) throw new Error(`清单不存在: ${id}`);
    const db = getDatabase();
    // 清单内事项移回收集箱，不产生孤儿数据
    db.run('UPDATE todos SET list_id = NULL, updated_at = ? WHERE list_id = ?', [nowIso(), id]);
    db.run('DELETE FROM todo_lists WHERE id = ?', [id]);
    autoSave();
  },

  listLists(): TodoList[] {
    const rows = selectRows(`
      SELECT l.id, l.name, l.color, l.sort_order, l.created_at,
             (SELECT COUNT(*) FROM todos t WHERE t.list_id = l.id AND t.status IN ('todo','doing')) AS open_count
        FROM todo_lists l
       ORDER BY l.sort_order ASC, l.created_at ASC
    `);
    return rows.map((row) => ({
      id: String(row[0]),
      name: String(row[1]),
      color: toNullableString(row[2]),
      sortOrder: Number(row[3]) || 0,
      createdAt: String(row[4]),
      openCount: Number(row[5]) || 0,
    }));
  },
};

/**
 * external_ref 迁移与链接方法单元测试（Multica 打通 Stage 1）
 *
 * 与 api.test.ts 同款 mock：core/db 换成内存 sql.js，不落盘。
 * 覆盖场景：
 *  1. 迁移幂等：旧库（无 external_ref 列）升级后可读写、旧数据保留、重复迁移不报错
 *  2. linkExternal / unlinkExternal / getByExternalRef：绑定、解绑、精确查询、防一 ref 多挂
 *  3. list / get 返回值携带 externalRef
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  current: null as any,
  autoSave: vi.fn(),
}));

vi.mock('../../../core/db', () => ({
  getDatabase: () => {
    if (!dbMock.current) throw new Error('测试数据库未初始化');
    return dbMock.current;
  },
  autoSave: dbMock.autoSave,
}));

import initSqlJs from 'sql.js';
import { api, ensureTodoTables, buildMulticaExternalRef } from '../api';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  dbMock.current = db;
  dbMock.autoSave.mockClear();
  ensureTodoTables();
});

/** 当前 todos 表的列名。 */
function todoColumns(): string[] {
  const stmt = dbMock.current.prepare('PRAGMA table_info(todos)');
  const cols: string[] = [];
  while (stmt.step()) cols.push(String(stmt.get()[1]));
  stmt.free();
  return cols;
}

/** 按 Multica 打通前的旧 schema 建 todos 表（无 external_ref 列）。 */
function createLegacyTodosTable(): void {
  dbMock.current.run(`
    CREATE TABLE todos (
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
}

describe('external_ref 迁移', () => {
  it('旧库（无 external_ref 列）升级：补列、旧数据保留、可读写', () => {
    // 重建旧 schema 库并写入一条旧数据
    dbMock.current = new SQL.Database();
    createLegacyTodosTable();
    expect(todoColumns()).not.toContain('external_ref');
    dbMock.current.run(
      `INSERT INTO todos (id, title, status, priority, sort_order, created_at, updated_at)
       VALUES ('todo_legacy', '旧事项', 'todo', 1, 0, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`,
    );

    ensureTodoTables();

    expect(todoColumns()).toContain('external_ref');
    const legacy = api.get('todo_legacy')!;
    expect(legacy.title).toBe('旧事项');
    expect(legacy.priority).toBe(1);
    expect(legacy.externalRef).toBeNull();

    // 升级后新读写字段正常工作
    const ref = buildMulticaExternalRef('01a0cd72-4996-7ce4-ace3-89bc96799907', 'HANJ-89');
    const linked = api.linkExternal('todo_legacy', ref);
    expect(linked.externalRef).toBe(ref);
    expect(api.getByExternalRef(ref)!.id).toBe('todo_legacy');
  });

  it('迁移幂等：重复 ensureTodoTables 不报错，新库本就有列时跳过 ALTER', () => {
    expect(todoColumns()).toContain('external_ref');
    expect(() => ensureTodoTables()).not.toThrow();
    expect(() => ensureTodoTables()).not.toThrow();
    // 已有数据不受重复迁移影响
    const todo = api.create({ title: 't' });
    api.linkExternal(todo.id, 'multica:abc:HANJ-1');
    ensureTodoTables();
    expect(api.get(todo.id)!.externalRef).toBe('multica:abc:HANJ-1');
  });

  it('迁移在旧库重复执行同样幂等', () => {
    dbMock.current = new SQL.Database();
    createLegacyTodosTable();
    ensureTodoTables();
    expect(() => ensureTodoTables()).not.toThrow();
    expect(todoColumns()).toContain('external_ref');
  });
});

describe('linkExternal / unlinkExternal / getByExternalRef', () => {
  const REF = 'multica:01a0cd72-4996-7ce4-ace3-89bc96799907:HANJ-89';

  it('linkExternal 绑定后 get / list 均携带 externalRef', () => {
    const todo = api.create({ title: '拉入的事项' });
    expect(todo.externalRef).toBeNull();

    const linked = api.linkExternal(todo.id, REF);
    expect(linked.externalRef).toBe(REF);
    expect(api.get(todo.id)!.externalRef).toBe(REF);
    expect(api.list().find((t) => t.id === todo.id)!.externalRef).toBe(REF);
    expect(dbMock.autoSave).toHaveBeenCalled();
  });

  it('getByExternalRef 精确查询：命中返回事项，未命中 / 空 ref 返回 null', () => {
    const todo = api.create({ title: 't' });
    api.linkExternal(todo.id, REF);

    expect(api.getByExternalRef(REF)!.id).toBe(todo.id);
    expect(api.getByExternalRef('multica:other:HANJ-2')).toBeNull();
    expect(api.getByExternalRef('')).toBeNull();
    expect(api.getByExternalRef('  ')).toBeNull();
  });

  it('同一 ref 不能挂到第二条事项；重复链接同一事项幂等', () => {
    const a = api.create({ title: 'a' });
    const b = api.create({ title: 'b' });
    api.linkExternal(a.id, REF);

    expect(() => api.linkExternal(b.id, REF)).toThrow('已链接到其他事项');
    expect(() => api.linkExternal(a.id, REF)).not.toThrow();
    expect(api.get(a.id)!.externalRef).toBe(REF);
  });

  it('unlinkExternal 解绑后可重新链接到其他事项', () => {
    const a = api.create({ title: 'a' });
    const b = api.create({ title: 'b' });
    api.linkExternal(a.id, REF);

    const unlinked = api.unlinkExternal(a.id);
    expect(unlinked.externalRef).toBeNull();
    expect(api.getByExternalRef(REF)).toBeNull();

    api.linkExternal(b.id, REF);
    expect(api.getByExternalRef(REF)!.id).toBe(b.id);
  });

  it('对不存在的事项 link / unlink 抛错；空 ref 抛错', () => {
    expect(() => api.linkExternal('todo_ghost', REF)).toThrow('不存在');
    expect(() => api.unlinkExternal('todo_ghost')).toThrow('不存在');
    const todo = api.create({ title: 't' });
    expect(() => api.linkExternal(todo.id, '  ')).toThrow('必填');
  });

  it('update 不动 externalRef；persistTodo 不丢列', () => {
    const todo = api.create({ title: 't' });
    api.linkExternal(todo.id, REF);

    const updated = api.update(todo.id, { title: '改名', priority: 2 });
    expect(updated.externalRef).toBe(REF);
    expect(api.done(todo.id).externalRef).toBe(REF);
  });
});

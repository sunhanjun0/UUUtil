/**
 * todo api 单元测试（Stage 1）
 *
 * 用 vi.mock 把 core/db 替换为内存 sql.js 实例，不落盘、不碰真实 .data/assistant.db。
 * 覆盖场景：
 *  1. 建表幂等：重复调用 ensureTodoTables 不报错，写后 autoSave 被调用
 *  2. CRUD：create 默认值 / 全字段、get / update（含跨清单移动）/ remove
 *  3. done / reopen 状态流转：completedAt 写入与清空、非法流转报错、cancelled 可重开
 *  4. 视图过滤：today（含逾期、基准日）/ inbox / all / done / date / listId / includeDone
 *  5. 清单：create / update / remove（事项回收集箱）/ listLists 未完成计数
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// 用 vi.hoisted 持有可变的内存数据库引用，供被 mock 的 getDatabase() 读取。
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
import { api, ensureTodoTables } from '../api';

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

/** 本地日期 → YYYY-MM-DD（与 api 内 localToday 同口径）。 */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysFromNow(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return localDateStr(d);
}

describe('建表', () => {
  it('ensureTodoTables 幂等：重复调用不报错，两表可用', () => {
    expect(() => ensureTodoTables()).not.toThrow();
    expect(() => ensureTodoTables()).not.toThrow();

    const todo = api.create({ title: '幂等验证' });
    expect(todo.id).toMatch(/^todo_/);
    const list = api.createList({ name: '清单A' });
    expect(list.id).toMatch(/^list_/);
  });

  it('写操作后调用 autoSave 持久化', () => {
    api.create({ title: '触发落盘' });
    expect(dbMock.autoSave).toHaveBeenCalled();
  });
});

describe('CRUD', () => {
  it('create 只传 title：走全部默认值', () => {
    const todo = api.create({ title: '买牛奶' });

    expect(todo.title).toBe('买牛奶');
    expect(todo.status).toBe('todo');
    expect(todo.priority).toBe(0);
    expect(todo.note).toBeNull();
    expect(todo.dueAt).toBeNull();
    expect(todo.listId).toBeNull();
    expect(todo.tags).toEqual([]);
    expect(todo.subtasks).toEqual([]);
    expect(todo.completedAt).toBeNull();
    expect(todo.createdAt).toBe(todo.updatedAt);

    const fetched = api.get(todo.id)!;
    expect(fetched).toEqual(todo);
  });

  it('create 全字段：note / priority / dueAt / listId / tags / subtasks 持久化', () => {
    const list = api.createList({ name: '工作' });
    const todo = api.create({
      title: '写周报',
      note: '别忘了带上数据截图',
      priority: 3,
      dueAt: '2026-09-20',
      listId: list.id,
      tags: ['工作', '周报'],
      subtasks: [{ id: 's1', title: '收集数据', done: true }, { id: 's2', title: '成稿', done: false }],
    });

    expect(todo.note).toBe('别忘了带上数据截图');
    expect(todo.priority).toBe(3);
    expect(todo.dueAt).toBe('2026-09-20');
    expect(todo.listId).toBe(list.id);
    expect(todo.tags).toEqual(['工作', '周报']);
    expect(todo.subtasks).toEqual([
      { id: 's1', title: '收集数据', done: true },
      { id: 's2', title: '成稿', done: false },
    ]);
  });

  it('create 缺 title / 空 title 抛错；priority 越界收敛到 0-3', () => {
    expect(() => api.create({} as any)).toThrow('title');
    expect(() => api.create({ title: '  ' })).toThrow('title');
    expect(api.create({ title: 'a', priority: 99 }).priority).toBe(3);
    expect(api.create({ title: 'b', priority: -2 }).priority).toBe(0);
  });

  it('create 指定不存在的清单抛错；dueAt 非法抛错', () => {
    expect(() => api.create({ title: 't', listId: 'list_ghost' })).toThrow('清单不存在');
    expect(() => api.create({ title: 't', dueAt: 'not-a-date' })).toThrow('dueAt');
  });

  it('同清单内 sort_order 依次追加；不同清单各自计数', () => {
    const list = api.createList({ name: 'L' });
    const a = api.create({ title: 'a' });
    const b = api.create({ title: 'b' });
    const c = api.create({ title: 'c', listId: list.id });
    const d = api.create({ title: 'd', listId: list.id });

    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
    expect(c.sortOrder).toBe(0);
    expect(d.sortOrder).toBe(1);
  });

  it('update 局部字段；note/dueAt 传 null 清空', () => {
    const todo = api.create({ title: '初稿', note: 'n', priority: 1, dueAt: '2026-09-16' });
    const updated = api.update(todo.id, { title: '终稿', priority: 2, note: null, dueAt: null });

    expect(updated.title).toBe('终稿');
    expect(updated.priority).toBe(2);
    expect(updated.note).toBeNull();
    expect(updated.dueAt).toBeNull();
    // 未提及的字段保持原样
    expect(updated.status).toBe('todo');
    expect(updated.createdAt).toBe(todo.createdAt);
  });

  it('update 空 title 抛错；不存在的 id 抛错', () => {
    const todo = api.create({ title: 't' });
    expect(() => api.update(todo.id, { title: ' ' })).toThrow('title');
    expect(() => api.update('todo_ghost', { title: 'x' })).toThrow('不存在');
  });

  it('update 跨清单移动：追加到新清单末尾；显式 sortOrder 优先', () => {
    const listA = api.createList({ name: 'A' });
    const listB = api.createList({ name: 'B' });
    api.create({ title: '占位1', listId: listB.id });
    const moving = api.create({ title: '迁徙', listId: listA.id });
    expect(moving.sortOrder).toBe(0);

    const moved = api.update(moving.id, { listId: listB.id });
    expect(moved.listId).toBe(listB.id);
    expect(moved.sortOrder).toBe(1); // B 清单已有 1 条，追加到末尾

    const explicit = api.update(moved.id, { listId: listA.id, sortOrder: 7 });
    expect(explicit.listId).toBe(listA.id);
    expect(explicit.sortOrder).toBe(7);
  });

  it('update listId 传 null 移回收集箱', () => {
    const list = api.createList({ name: 'L' });
    const todo = api.create({ title: 't', listId: list.id });
    const updated = api.update(todo.id, { listId: null });
    expect(updated.listId).toBeNull();
  });

  it('update status 字段：doing / cancelled 直改；经 update 进 done 写 completedAt，离开清空', () => {
    const todo = api.create({ title: 't' });
    expect(api.update(todo.id, { status: 'doing' }).status).toBe('doing');

    const done = api.update(todo.id, { status: 'done' });
    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();

    const cancelled = api.update(todo.id, { status: 'cancelled' });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.completedAt).toBeNull();

    expect(() => api.update(todo.id, { status: 'ghost' as any })).toThrow('非法状态');
  });

  it('remove 删除后可 get 到 null；删除不存在的 id 抛错', () => {
    const todo = api.create({ title: 't' });
    api.remove(todo.id);
    expect(api.get(todo.id)).toBeNull();
    expect(() => api.remove(todo.id)).toThrow('不存在');
  });
});

describe('done / reopen', () => {
  it('done：todo → done，写入 completedAt 并持久化', () => {
    const todo = api.create({ title: 't' });
    const done = api.done(todo.id);

    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
    expect(api.get(todo.id)!.status).toBe('done');
  });

  it('doing 也可 done；已 done / cancelled 再 done 抛错', () => {
    const doing = api.update(api.create({ title: 'a' }).id, { status: 'doing' });
    expect(api.done(doing.id).status).toBe('done');

    const todo = api.create({ title: 'b' });
    api.done(todo.id);
    expect(() => api.done(todo.id)).toThrow('done');

    const cancelled = api.update(api.create({ title: 'c' }).id, { status: 'cancelled' });
    expect(() => api.done(cancelled.id)).toThrow('cancelled');
  });

  it('reopen：done → todo，清空 completedAt', () => {
    const todo = api.create({ title: 't' });
    api.done(todo.id);
    const reopened = api.reopen(todo.id);

    expect(reopened.status).toBe('todo');
    expect(reopened.completedAt).toBeNull();
    expect(api.get(todo.id)!.status).toBe('todo');
  });

  it('cancelled 也可 reopen；todo / doing 上 reopen 抛错', () => {
    const cancelled = api.update(api.create({ title: 'a' }).id, { status: 'cancelled' });
    expect(api.reopen(cancelled.id).status).toBe('todo');

    const todo = api.create({ title: 'b' });
    expect(() => api.reopen(todo.id)).toThrow('todo');
    api.update(todo.id, { status: 'doing' });
    expect(() => api.reopen(todo.id)).toThrow('doing');
  });

  it('对不存在的 id done / reopen 抛错', () => {
    expect(() => api.done('todo_ghost')).toThrow('不存在');
    expect(() => api.reopen('todo_ghost')).toThrow('不存在');
  });
});

describe('视图过滤', () => {
  it('today（默认基准日 = 本地今天）：含逾期与今日到期，排除未来、无到期与已完成', () => {
    const overdue = api.create({ title: '已逾期', dueAt: daysFromNow(-2) });
    const dueToday = api.create({ title: '今日到期', dueAt: daysFromNow(0) });
    api.create({ title: '明天到期', dueAt: daysFromNow(1) });
    api.create({ title: '无到期' });
    const doneToday = api.create({ title: '今日已完成', dueAt: daysFromNow(0) });
    api.done(doneToday.id);

    const ids = api.list({ view: 'today' }).map((t) => t.id);
    expect(ids).toContain(overdue.id);
    expect(ids).toContain(dueToday.id);
    expect(ids).toHaveLength(2);

    // includeDone 放开状态口径
    const withDone = api.list({ view: 'today', includeDone: true }).map((t) => t.id);
    expect(withDone).toContain(doneToday.id);
  });

  it('today 指定基准日：due_at 不晚于该日', () => {
    api.create({ title: '9-10', dueAt: '2026-09-10' });
    api.create({ title: '9-20', dueAt: '2026-09-20' });
    api.create({ title: '9-30', dueAt: '2026-09-30' });

    const titles = api.list({ view: 'today', date: '2026-09-20' }).map((t) => t.title);
    expect(titles).toEqual(['9-10', '9-20']); // 按 due_at 升序
  });

  it('inbox：只含收集箱事项', () => {
    const list = api.createList({ name: 'L' });
    const inboxItem = api.create({ title: '收集箱' });
    api.create({ title: '清单内', listId: list.id });

    const items = api.list({ view: 'inbox' });
    expect(items.map((t) => t.id)).toEqual([inboxItem.id]);
  });

  it('all：默认排除 done/cancelled；includeDone 全量', () => {
    api.create({ title: '待办' });
    const done = api.create({ title: '已完成' });
    api.done(done.id);
    const cancelled = api.create({ title: '已取消' });
    api.update(cancelled.id, { status: 'cancelled' });

    expect(api.list({ view: 'all' }).map((t) => t.title)).toEqual(['待办']);
    expect(api.list({ view: 'all', includeDone: true })).toHaveLength(3);
  });

  it('done 视图：只含已完成，按 completedAt 倒序', () => {
    const first = api.create({ title: '先完成' });
    const second = api.create({ title: '后完成' });
    api.create({ title: '未完成' });
    api.done(first.id);
    api.done(second.id);

    const items = api.list({ view: 'done' });
    expect(items).toHaveLength(2);
    expect(items.every((t) => t.status === 'done')).toBe(true);
  });

  it('date（非 today 视图）：按 due_at 当日精确匹配', () => {
    api.create({ title: '当日', dueAt: '2026-09-16T10:00:00' });
    api.create({ title: '次日', dueAt: '2026-09-17' });

    const items = api.list({ date: '2026-09-16' });
    expect(items.map((t) => t.title)).toEqual(['当日']);
  });

  it('listId：按清单过滤，可与 view 组合', () => {
    const listA = api.createList({ name: 'A' });
    const listB = api.createList({ name: 'B' });
    const inA = api.create({ title: 'A内', listId: listA.id });
    api.create({ title: 'B内', listId: listB.id });
    api.create({ title: '收集箱' });

    expect(api.list({ listId: listA.id }).map((t) => t.id)).toEqual([inA.id]);
    expect(api.list({ view: 'all', listId: listB.id }).map((t) => t.title)).toEqual(['B内']);
  });

  it('默认排序：sort_order 升序（追加序）', () => {
    api.create({ title: '一' });
    api.create({ title: '二' });
    api.create({ title: '三' });

    expect(api.list().map((t) => t.title)).toEqual(['一', '二', '三']);
  });
});

describe('清单', () => {
  it('createList：name 必填，sort_order 依次追加', () => {
    expect(() => api.createList({ name: ' ' })).toThrow('name');

    const a = api.createList({ name: '工作', color: '#fbbf24' });
    const b = api.createList({ name: '生活' });
    expect(a.color).toBe('#fbbf24');
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);
    expect(b.color).toBeNull();
  });

  it('updateList：改名 / 改色 / 调序；color 传 null 清空', () => {
    const list = api.createList({ name: '旧名', color: '#fff' });
    const updated = api.updateList(list.id, { name: '新名', color: null, sortOrder: 5 });

    expect(updated.name).toBe('新名');
    expect(updated.color).toBeNull();
    expect(updated.sortOrder).toBe(5);
    expect(updated.createdAt).toBe(list.createdAt);

    expect(() => api.updateList(list.id, { name: ' ' })).toThrow('name');
    expect(() => api.updateList('list_ghost', { name: 'x' })).toThrow('不存在');
  });

  it('listLists：按 sort_order 排序，带各清单未完成计数（todo+doing，不含 done/cancelled）', () => {
    const listA = api.createList({ name: 'A' });
    const listB = api.createList({ name: 'B' });

    api.create({ title: 'A-待办', listId: listA.id });
    api.create({ title: 'A-进行中', listId: listA.id });
    const doneInA = api.create({ title: 'A-已完成', listId: listA.id });
    api.done(doneInA.id);
    const cancelledInA = api.create({ title: 'A-已取消', listId: listA.id });
    api.update(cancelledInA.id, { status: 'cancelled' });
    api.create({ title: 'B-待办', listId: listB.id });
    api.create({ title: '收集箱事项' }); // 不计入任何清单

    const lists = api.listLists();
    expect(lists.map((l) => l.name)).toEqual(['A', 'B']);
    expect(lists[0].openCount).toBe(2);
    expect(lists[1].openCount).toBe(1);
  });

  it('removeList：清单内事项移回收集箱，清单删除', () => {
    const list = api.createList({ name: 'L' });
    const todo = api.create({ title: 't', listId: list.id });

    api.removeList(list.id);

    expect(api.get(todo.id)!.listId).toBeNull();
    expect(api.listLists()).toHaveLength(0);
    expect(() => api.removeList(list.id)).toThrow('不存在');
  });
});

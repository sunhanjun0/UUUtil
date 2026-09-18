/**
 * todo 到期巡查（due-scanner）单元测试（Stage 5）
 *
 * core/db 用内存 sql.js 替换；core/event-bus 用 vi.fn 桩替换
 * （真实 bus 经 core/logger 依赖 electron，node 测试环境不可导入）。
 * 覆盖场景：
 *  1. 过滤：未来截止 / done / cancelled / 无 dueAt 的事项不进入到期集；
 *     date-only 截止按本地零点判定（今天到期可提醒、昨天即逾期）
 *  2. 组装：已逾期 vs 今日到期的 title 前缀与 body 文案、severity 映射（P3 提一档）
 *  3. 发射：scanDueTodos 经 bus 广播 todo:due-scan 全量快照
 *  4. 定时器：startDueScanner 首扫（tick 后）+ 周期巡查 + todo:changed 即时核对，
 *     stopDueScanner 后不再扫描并解除监听
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// 用 vi.hoisted 持有可变的内存数据库引用，供被 mock 的 getDatabase() 读取。
const dbMock = vi.hoisted(() => ({
  current: null as any,
  autoSave: vi.fn(),
}));

const busMock = vi.hoisted(() => ({
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('../../../core/db', () => ({
  getDatabase: () => {
    if (!dbMock.current) throw new Error('测试数据库未初始化');
    return dbMock.current;
  },
  autoSave: dbMock.autoSave,
}));

vi.mock('../../../core/event-bus', () => ({
  bus: busMock,
}));

import initSqlJs from 'sql.js';
import { api, ensureTodoTables } from '../api';
import {
  isOverdue,
  scanDueTodos,
  severityFor,
  startDueScanner,
  stopDueScanner,
  toDueReminderItem,
} from '../due-scanner';
import type { TodoDueScanPayload } from '../../../shared/types';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

/** 固定的本地「现在」：2026-09-18 12:00（周五），所有用例以此为准。 */
const NOW = new Date(2026, 8, 18, 12, 0, 0);

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  dbMock.current = db;
  dbMock.autoSave.mockClear();
  busMock.on.mockClear();
  busMock.off.mockClear();
  busMock.emit.mockClear();
  ensureTodoTables();
});

afterEach(() => {
  stopDueScanner();
  vi.useRealTimers();
});

/** 取 bus.emit 最后一次 todo:due-scan 的载荷。 */
function lastScanPayload(): TodoDueScanPayload {
  const calls = busMock.emit.mock.calls.filter((c) => c[0] === 'todo:due-scan');
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as TodoDueScanPayload;
}

describe('severityFor / isOverdue 映射', () => {
  it('已逾期 → warning，高优 P3 提一档为 error；今日到期 → info，高优 → warning', () => {
    expect(severityFor(0, true)).toBe('warning');
    expect(severityFor(2, true)).toBe('warning');
    expect(severityFor(3, true)).toBe('error');
    expect(severityFor(0, false)).toBe('info');
    expect(severityFor(2, false)).toBe('info');
    expect(severityFor(3, false)).toBe('warning');
  });

  it('截止日早于本地今天为逾期；今天（含已过时刻）不算逾期', () => {
    expect(isOverdue('2026-09-17T23:59:00', NOW)).toBe(true);
    expect(isOverdue('2026-09-17', NOW)).toBe(true);
    expect(isOverdue('2026-09-18T08:00:00', NOW)).toBe(false);
    expect(isOverdue('2026-09-18', NOW)).toBe(false);
    expect(isOverdue('2026-09-19', NOW)).toBe(false);
  });
});

describe('toDueReminderItem 组装', () => {
  it('已逾期事项：标题前缀「已逾期：」，正文含本地截止时间', () => {
    const todo = api.create({ title: '写周报', dueAt: '2026-09-17T10:00:00', priority: 3 });
    const item = toDueReminderItem(todo, NOW)!;
    expect(item.title).toBe('已逾期：写周报');
    expect(item.body).toBe('截止 2026-09-17 10:00 · P3');
    expect(item.severity).toBe('error');
    expect(item.overdue).toBe(true);
    expect(item.id).toBe(todo.id);
    expect(item.dueAt).toBe('2026-09-17T10:00:00');
  });

  it('今日到期事项：标题前缀「今日到期：」，date-only 截止原样展示', () => {
    const todo = api.create({ title: '还书', dueAt: '2026-09-18' });
    const item = toDueReminderItem(todo, NOW)!;
    expect(item.title).toBe('今日到期：还书');
    expect(item.body).toBe('截止 2026-09-18');
    expect(item.severity).toBe('info');
    expect(item.overdue).toBe(false);
  });

  it('dueAt 为空返回 null', () => {
    const todo = api.create({ title: '无截止' });
    expect(toDueReminderItem(todo, NOW)).toBeNull();
  });
});

describe('scanDueTodos 过滤与发射', () => {
  it('只包含已到期且未完成的事项，并广播全量快照', () => {
    const overdue = api.create({ title: '昨天到期', dueAt: '2026-09-17T10:00:00' });
    const todayEarly = api.create({ title: '今早到期', dueAt: '2026-09-18T08:00:00', priority: 3 });
    const dateOnlyToday = api.create({ title: '今天到期', dueAt: '2026-09-18' });
    api.create({ title: '明天到期', dueAt: '2026-09-19T09:00:00' });
    api.create({ title: '明天（date-only）', dueAt: '2026-09-19' });
    api.create({ title: '无截止' });
    const done = api.create({ title: '已完成', dueAt: '2026-09-17' });
    api.done(done.id);
    const cancelled = api.create({ title: '已取消', dueAt: '2026-09-17' });
    api.update(cancelled.id, { status: 'cancelled' });

    const items = scanDueTodos(NOW);
    const ids = items.map((i) => i.id).sort();
    expect(ids).toEqual([overdue.id, todayEarly.id, dateOnlyToday.id].sort());

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(overdue.id)!.overdue).toBe(true);
    expect(byId.get(overdue.id)!.severity).toBe('warning');
    expect(byId.get(todayEarly.id)!.overdue).toBe(false);
    expect(byId.get(todayEarly.id)!.severity).toBe('warning');
    expect(byId.get(dateOnlyToday.id)!.severity).toBe('info');

    const payload = lastScanPayload();
    expect(payload.scannedAt).toBe(NOW.toISOString());
    expect(payload.items.map((i) => i.id).sort()).toEqual(ids);
  });

  it('到期集为空时也广播空快照（供 reminder 反向核对清场）', () => {
    api.create({ title: '明天到期', dueAt: '2026-09-19' });
    const items = scanDueTodos(NOW);
    expect(items).toEqual([]);
    expect(lastScanPayload().items).toEqual([]);
  });

  it('今天较晚时刻的截止到点后才进入到期集', () => {
    const todo = api.create({ title: '傍晚到期', dueAt: '2026-09-18T18:00:00' });
    expect(scanDueTodos(NOW).map((i) => i.id)).toEqual([]);
    const evening = new Date(2026, 8, 18, 18, 0, 0);
    const items = scanDueTodos(evening);
    expect(items.map((i) => i.id)).toEqual([todo.id]);
    expect(items[0].overdue).toBe(false);
  });
});

describe('startDueScanner / stopDueScanner', () => {
  it('首扫在 tick 后执行，之后按周期巡查', () => {
    vi.useFakeTimers({ now: NOW });
    api.create({ title: '昨天到期', dueAt: '2026-09-17T10:00:00' });

    startDueScanner(1000);
    expect(busMock.emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1); // 首扫（setTimeout 0）
    expect(busMock.emit.mock.calls.filter((c) => c[0] === 'todo:due-scan')).toHaveLength(1);

    vi.advanceTimersByTime(1000); // 第一次周期
    expect(busMock.emit.mock.calls.filter((c) => c[0] === 'todo:due-scan')).toHaveLength(2);
    vi.advanceTimersByTime(2000); // 第二、三次周期
    expect(busMock.emit.mock.calls.filter((c) => c[0] === 'todo:due-scan')).toHaveLength(4);

    expect(lastScanPayload().items).toHaveLength(1);
  });

  it('todo:changed 触发即时核对，stop 后解除监听且不再扫描', () => {
    vi.useFakeTimers({ now: NOW });
    startDueScanner(60_000);
    vi.advanceTimersByTime(1);
    busMock.emit.mockClear();

    const onCall = busMock.on.mock.calls.find((c) => c[0] === 'todo:changed');
    expect(onCall).toBeTruthy();
    const handler = onCall![1] as () => void;

    handler(); // 模拟面板/CLI 变更
    expect(busMock.emit.mock.calls.filter((c) => c[0] === 'todo:due-scan')).toHaveLength(1);

    stopDueScanner();
    expect(busMock.off).toHaveBeenCalledWith('todo:changed', handler);

    busMock.emit.mockClear();
    vi.advanceTimersByTime(180_000); // 间隔定时器已清除，不再周期扫描
    expect(busMock.emit).not.toHaveBeenCalled();
  });

  it('重复 start 幂等：只保留一套定时器', () => {
    vi.useFakeTimers({ now: NOW });
    startDueScanner(1000);
    startDueScanner(1000);
    vi.advanceTimersByTime(1);
    const firstScanCount = busMock.emit.mock.calls.filter((c) => c[0] === 'todo:due-scan').length;
    expect(firstScanCount).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(busMock.emit.mock.calls.filter((c) => c[0] === 'todo:due-scan')).toHaveLength(2);
  });
});

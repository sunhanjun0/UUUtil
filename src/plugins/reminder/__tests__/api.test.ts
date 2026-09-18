/**
 * reminder api 集成测试（P0 / P2）
 *
 * 用 vi.mock 把 core/db 替换为内存 sql.js 实例，不落盘、不碰真实 .data/assistant.db。
 * 覆盖场景：
 *  1. agent waiter：_setAgentWaiter → agentUpdate 唤醒 / agentClose 唤醒 / 超时返回 null
 *  2. createAsk 去重：同 source+key 去重、supersede 旧记录、不同 key / 无 key / 非 active 不去重
 *  3. respond / dismiss 状态流转：active → done / dismissed，以及非法流转报错
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

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
import { api, ensureRemindersTable } from '../api';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  dbMock.current = db;
  dbMock.autoSave.mockClear();
  api._agentWaiters.clear();
  ensureRemindersTable();
});

afterEach(() => {
  // 清理可能残留的 agent waiter 定时器，避免泄漏
  for (const w of api._agentWaiters.values()) clearTimeout(w.timer);
  api._agentWaiters.clear();
});

/** 通过 agentUpdate 播种一条 agent 专属提醒（含一个 ok 动作）。 */
function seedAgentReminder(topic: string) {
  return api.agentUpdate({
    agentId: 'agent-1',
    topic,
    stage: 'waiting',
    title: '请确认',
    body: 'v1',
    actions: [{ id: 'ok', label: '确认' }],
  });
}

describe('agent waiter', () => {
  it('agentUpdate 检测到 response 后唤醒 waiter', () => {
    const created = seedAgentReminder('topic-upd');
    // 用户先响应，写入 response_json
    api.respond({ id: created.id, actionId: 'ok' });

    const resolveFn = vi.fn();
    api._setAgentWaiter('topic-upd', resolveFn, 100000);

    // agent 再次更新 → 发现已有 response，唤醒等待者
    api.agentUpdate({ agentId: 'agent-1', topic: 'topic-upd', stage: 'waiting', title: '请确认', body: 'v2' });

    expect(resolveFn).toHaveBeenCalledTimes(1);
    const woken = resolveFn.mock.calls[0][0];
    expect(woken).not.toBeNull();
    expect(woken.response).not.toBeNull();
    expect(woken.response.actionId).toBe('ok');
    expect(api._agentWaiters.has('topic-upd')).toBe(false);
  });

  it('agentUpdate 无 response 时不唤醒 waiter', () => {
    seedAgentReminder('topic-noresp');
    const resolveFn = vi.fn();
    api._setAgentWaiter('topic-noresp', resolveFn, 100000);

    api.agentUpdate({ agentId: 'agent-1', topic: 'topic-noresp', stage: 'waiting', title: '请确认', body: 'v2' });

    expect(resolveFn).not.toHaveBeenCalled();
    expect(api._agentWaiters.has('topic-noresp')).toBe(true);
  });

  it('回归：agentUpdate 更新分支省略可选字段（priority/project）不报错', () => {
    // 历史缺陷：UPDATE 分支曾直接绑定 input.priority/input.stage，省略时传入 undefined
    // 触发 sql.js "tried to bind a value of an unknown type (undefined)"。
    seedAgentReminder('topic-omit');
    expect(() =>
      api.agentUpdate({ agentId: 'agent-1', topic: 'topic-omit', title: '只改标题' }),
    ).not.toThrow();

    const updated = api.agentQuery('topic-omit')!;
    expect(updated.title).toBe('只改标题');
    expect(updated.priority).toBeNull();
    expect(updated.project).toBeNull();
  });

  it('agentClose 唤醒 waiter 并返回 done 记录', () => {
    seedAgentReminder('topic-close');
    const resolveFn = vi.fn();
    api._setAgentWaiter('topic-close', resolveFn, 100000);

    api.agentClose('topic-close', 'done');

    expect(resolveFn).toHaveBeenCalledTimes(1);
    const woken = resolveFn.mock.calls[0][0];
    expect(woken.status).toBe('done');
    expect(api._agentWaiters.has('topic-close')).toBe(false);
  });

  it('超时返回 null 并清理 waiter', () => {
    vi.useFakeTimers();
    try {
      const resolveFn = vi.fn();
      api._setAgentWaiter('topic-timeout', resolveFn, 5000);
      expect(api._agentWaiters.has('topic-timeout')).toBe(true);

      vi.advanceTimersByTime(5000);

      expect(resolveFn).toHaveBeenCalledTimes(1);
      expect(resolveFn).toHaveBeenCalledWith(null);
      expect(api._agentWaiters.has('topic-timeout')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('重复 _setAgentWaiter 会替换旧 waiter（旧 timer 被清理）', () => {
    seedAgentReminder('topic-replace');
    const first = vi.fn();
    const second = vi.fn();
    api._setAgentWaiter('topic-replace', first, 100000);
    api._setAgentWaiter('topic-replace', second, 100000);

    api.agentClose('topic-replace', 'cancelled');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('createAsk 去重', () => {
  const actions = [{ id: 'ok', label: '确认' }];

  it('同 source+key 命中已有 active → 去重、复用记录、supersede 旧 id', () => {
    const first = api.createAsk({ source: 's', key: 'k', title: 't1', actions });
    expect(first.deduped).toBe(false);
    expect(first.supersededId).toBeNull();

    const second = api.createAsk({
      source: 's',
      key: 'k',
      title: 't2',
      actions: [{ id: 'no', label: '拒绝' }],
    });

    expect(second.deduped).toBe(true);
    expect(second.supersededId).toBe(first.reminder.id);
    expect(second.reminder.id).toBe(first.reminder.id); // 复用同一条记录
    expect(second.reminder.title).toBe('t2');
    expect(second.reminder.actions).toEqual([{ id: 'no', label: '拒绝' }]);

    // 数据库中该 source+key 仍只有一条 active
    const actives = api.list({ status: 'active' }).filter((r) => r.source === 's' && r.key === 'k');
    expect(actives).toHaveLength(1);
    expect(actives[0].title).toBe('t2');
  });

  it('不同 key 不去重', () => {
    const a = api.createAsk({ source: 's', key: 'k1', title: 't', actions });
    const b = api.createAsk({ source: 's', key: 'k2', title: 't', actions });
    expect(b.deduped).toBe(false);
    expect(b.supersededId).toBeNull();
    expect(b.reminder.id).not.toBe(a.reminder.id);
  });

  it('无 key 不去重（每次新建）', () => {
    const a = api.createAsk({ source: 's', title: 't', actions });
    const b = api.createAsk({ source: 's', title: 't', actions });
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(false);
    expect(b.reminder.id).not.toBe(a.reminder.id);
  });

  it('同 key 但上一条已 dismissed → 不去重（只匹配 active）', () => {
    const first = api.createAsk({ source: 's', key: 'k', title: 't1', actions });
    api.dismiss(first.reminder.id);

    const second = api.createAsk({ source: 's', key: 'k', title: 't2', actions });
    expect(second.deduped).toBe(false);
    expect(second.supersededId).toBeNull();
    expect(second.reminder.id).not.toBe(first.reminder.id);
  });

  it('actions 非法时抛错（空数组 / id 重复）', () => {
    expect(() => api.createAsk({ source: 's', title: 't', actions: [] })).toThrow();
    expect(() =>
      api.createAsk({
        source: 's',
        title: 't',
        actions: [
          { id: 'x', label: 'a' },
          { id: 'x', label: 'b' },
        ],
      }),
    ).toThrow('重复');
  });
});

describe('respond / dismiss 状态流转', () => {
  const actions = [
    { id: 'ok', label: '确认' },
    { id: 'reject', label: '拒绝', requiresReason: true },
  ];

  it('respond: active → done 并持久化 response', () => {
    const { reminder } = api.createAsk({ source: 's', key: 'k', title: 't', actions });
    const result = api.respond({ id: reminder.id, actionId: 'ok' });

    expect(result.status).toBe('done');
    expect(result.response?.actionId).toBe('ok');
    expect(result.doneAt).not.toBeNull();

    const fetched = api.get(reminder.id)!;
    expect(fetched.status).toBe('done');
    expect(fetched.response?.actionId).toBe('ok');
  });

  it('respond 携带 reason 时被记录', () => {
    const { reminder } = api.createAsk({ source: 's', key: 'k', title: 't', actions });
    const result = api.respond({ id: reminder.id, actionId: 'reject', reason: '不需要' });
    expect(result.response?.reason).toBe('不需要');
  });

  it('requiresReason 按钮缺 reason 报错', () => {
    const { reminder } = api.createAsk({ source: 's', key: 'k', title: 't', actions });
    expect(() => api.respond({ id: reminder.id, actionId: 'reject' })).toThrow('reason');
  });

  it('未定义的 actionId 报错', () => {
    const { reminder } = api.createAsk({ source: 's', key: 'k', title: 't', actions });
    expect(() => api.respond({ id: reminder.id, actionId: 'ghost' })).toThrow('actionId');
  });

  it('respond 非 active 状态报错', () => {
    const { reminder } = api.createAsk({ source: 's', key: 'k', title: 't', actions });
    api.dismiss(reminder.id);
    expect(() => api.respond({ id: reminder.id, actionId: 'ok' })).toThrow();
  });

  it('dismiss: active → dismissed 并持久化', () => {
    const { reminder } = api.createAsk({ source: 's', key: 'k', title: 't', actions });
    const result = api.dismiss(reminder.id);

    expect(result.status).toBe('dismissed');
    expect(result.doneAt).not.toBeNull();
    expect(api.get(reminder.id)!.status).toBe('dismissed');
  });

  it('dismiss 非 active 状态报错', () => {
    const { reminder } = api.createAsk({ source: 's', key: 'k', title: 't', actions });
    api.dismiss(reminder.id);
    expect(() => api.dismiss(reminder.id)).toThrow();
  });

  it('对不存在的 id respond / dismiss 报错', () => {
    expect(() => api.respond({ id: 'rem_missing', actionId: 'ok' })).toThrow();
    expect(() => api.dismiss('rem_missing')).toThrow();
  });
});

describe('syncKeyedReminders 全量 reconcile（todo 到期巡查）', () => {
  const item = (key: string, title = `事项${key}`, severity: 'info' | 'warning' | 'error' = 'warning') => ({
    key,
    title,
    body: `截止 2026-09-18 · P2`,
    severity,
    type: 'info' as const,
    metadata: { todoId: key },
  });

  it('首次同步全部新建，source/key/内容落库正确', () => {
    const result = api.syncKeyedReminders('todo', [item('todo_1'), item('todo_2')]);
    expect(result).toEqual({ created: 2, updated: 0, dismissed: 0 });

    const list = api.list({ status: 'active', limit: 10 });
    expect(list).toHaveLength(2);
    const r1 = list.find((r) => r.key === 'todo_1')!;
    expect(r1.source).toBe('todo');
    expect(r1.type).toBe('info');
    expect(r1.severity).toBe('warning');
    expect(r1.title).toBe('事项todo_1');
    expect(r1.metadata).toEqual({ todoId: 'todo_1' });
  });

  it('内容无变化的重复同步完全跳过写入（updated_at 不刷、不计数）', () => {
    api.syncKeyedReminders('todo', [item('todo_1')]);
    const before = api.list({ status: 'active', limit: 10 })[0];

    const result = api.syncKeyedReminders('todo', [item('todo_1')]);
    expect(result).toEqual({ created: 0, updated: 0, dismissed: 0 });
    const after = api.list({ status: 'active', limit: 10 })[0];
    expect(after.id).toBe(before.id);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it('内容有变化命中去重更新：同一条记录改 severity/title，不新增', () => {
    api.syncKeyedReminders('todo', [item('todo_1')]);
    const before = api.list({ status: 'active', limit: 10 })[0];

    const result = api.syncKeyedReminders('todo', [
      { ...item('todo_1', '事项todo_1（已升级）', 'error') },
    ]);
    expect(result).toEqual({ created: 0, updated: 1, dismissed: 0 });

    const list = api.list({ status: 'active', limit: 10 });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(before.id);
    expect(list[0].severity).toBe('error');
    expect(list[0].title).toBe('事项todo_1（已升级）');
  });

  it('反向核对：集合外的本 source active 提醒被 dismiss，集合内保留', () => {
    api.syncKeyedReminders('todo', [item('todo_1'), item('todo_2'), item('todo_3')]);

    const result = api.syncKeyedReminders('todo', [item('todo_2')]);
    expect(result).toEqual({ created: 0, updated: 0, dismissed: 2 });

    const active = api.list({ status: 'active', limit: 10 });
    expect(active.map((r) => r.key)).toEqual(['todo_2']);
    const dismissedList = api.list({ status: 'dismissed', limit: 10 });
    expect(dismissedList.map((r) => r.key).sort()).toEqual(['todo_1', 'todo_3']);
  });

  it('空集合同步 = 清空该 source 全部 active 提醒（含无 key 的）', () => {
    api.syncKeyedReminders('todo', [item('todo_1')]);
    api.create({ source: 'todo', title: '无 key 的历史提醒' });

    const result = api.syncKeyedReminders('todo', []);
    expect(result).toEqual({ created: 0, updated: 0, dismissed: 2 });
    expect(api.list({ status: 'active', limit: 10 })).toHaveLength(0);
  });

  it('其他 source 的提醒不受影响', () => {
    api.create({ source: 'codex', key: 'build-1', title: '构建完成' });
    api.syncKeyedReminders('todo', [item('todo_1')]);

    const result = api.syncKeyedReminders('todo', []);
    expect(result.dismissed).toBe(1);
    const active = api.list({ status: 'active', limit: 10 });
    expect(active).toHaveLength(1);
    expect(active[0].source).toBe('codex');
  });

  it('已 dismiss 的 key 重新出现时会新建一条（不复活旧记录）', () => {
    api.syncKeyedReminders('todo', [item('todo_1')]);
    api.syncKeyedReminders('todo', []); // dismiss
    const before = api.list({ limit: 10 });
    expect(before[0].status).toBe('dismissed');

    const result = api.syncKeyedReminders('todo', [item('todo_1')]);
    expect(result).toEqual({ created: 1, updated: 0, dismissed: 0 });
    const active = api.list({ status: 'active', limit: 10 });
    expect(active).toHaveLength(1);
    expect(active[0].id).not.toBe(before[0].id);
  });

  it('空 key / 重复 key / 空 title 的条目被跳过', () => {
    const result = api.syncKeyedReminders('todo', [
      { key: '  ', title: '空 key' },
      item('todo_1'),
      item('todo_1', '重复 key 的第二条'),
      { key: 'todo_2', title: '  ' },
    ]);
    expect(result).toEqual({ created: 1, updated: 0, dismissed: 0 });
    const active = api.list({ status: 'active', limit: 10 });
    expect(active.map((r) => r.key)).toEqual(['todo_1']);
  });

  it('非法 severity/type 回落 info；source 为空抛错', () => {
    const result = api.syncKeyedReminders('todo', [
      { key: 'todo_1', title: 't', severity: 'critical' as any, type: 'weird' as any },
    ]);
    expect(result.created).toBe(1);
    const r = api.list({ status: 'active', limit: 10 })[0];
    expect(r.severity).toBe('info');
    expect(r.type).toBe('info');

    expect(() => api.syncKeyedReminders('  ', [])).toThrow('source');
  });
});

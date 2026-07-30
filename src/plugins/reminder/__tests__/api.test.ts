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

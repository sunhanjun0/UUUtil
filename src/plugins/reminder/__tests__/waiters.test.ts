/**
 * waiters 状态机单元测试（P0）
 *
 * 覆盖场景：
 *  1. registerWaiter → fulfillWaiter 正常落地
 *  2. 超时触发 onTimeout 并返回 timeout
 *  3. supersede：同 reminderId 重新注册顶掉旧 waiter
 *  4. hasWaiter 生命周期 / fulfill 未知 id 返回 false
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerWaiter, fulfillWaiter, hasWaiter } from '../waiters';

describe('Reminder Waiters 状态机', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('register → fulfill(responded) 正常落地', async () => {
    const onTimeout = vi.fn();
    const promise = registerWaiter('w1', 5000, onTimeout);
    expect(hasWaiter('w1')).toBe(true);

    const outcome = {
      kind: 'responded',
      response: { actionId: 'ok', respondedAt: '2026-01-01T00:00:00.000Z' },
    } as const;
    expect(fulfillWaiter('w1', outcome)).toBe(true);

    expect(await promise).toEqual(outcome);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(hasWaiter('w1')).toBe(false);
  });

  it('超时触发 onTimeout 并返回 timeout', async () => {
    const onTimeout = vi.fn();
    const promise = registerWaiter('w2', 5000, onTimeout);

    vi.advanceTimersByTime(5000);

    expect(await promise).toEqual({ kind: 'timeout' });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(hasWaiter('w2')).toBe(false);
  });

  it('fulfill 后 timer 已清理，超时不再触发', async () => {
    const onTimeout = vi.fn();
    const promise = registerWaiter('w3', 5000, onTimeout);

    fulfillWaiter('w3', { kind: 'dismissed' });
    vi.advanceTimersByTime(10000);

    expect(onTimeout).not.toHaveBeenCalled();
    expect(await promise).toEqual({ kind: 'dismissed' });
  });

  it('supersede：同 reminderId 重新注册，旧 waiter 提前退场', async () => {
    const p1 = registerWaiter('w4', 5000, vi.fn());
    const p2 = registerWaiter('w4', 5000, vi.fn());

    // 旧 waiter 立即被 superseded
    expect(await p1).toEqual({ kind: 'superseded' });
    // 新 waiter 仍然挂起
    expect(hasWaiter('w4')).toBe(true);

    fulfillWaiter('w4', { kind: 'dismissed' });
    expect(await p2).toEqual({ kind: 'dismissed' });
    expect(hasWaiter('w4')).toBe(false);
  });

  it('fulfillWaiter 对未知 id 返回 false', () => {
    expect(fulfillWaiter('nonexistent', { kind: 'dismissed' })).toBe(false);
  });

  it('hasWaiter 反映注册/完成生命周期', () => {
    registerWaiter('w5', 5000, vi.fn());
    expect(hasWaiter('w5')).toBe(true);
    fulfillWaiter('w5', { kind: 'dismissed' });
    expect(hasWaiter('w5')).toBe(false);
  });
});

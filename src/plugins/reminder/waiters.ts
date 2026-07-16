/**
 * reminder ask 的阻塞 waiter 注册表。
 *
 * ask 命令进入时通过 register 挂一个 Promise，
 * IPC 层收到 respond / dismiss 后调用 fulfill 让 Promise 落地；
 * 同 key 命中已有 active ask 时调用 supersede 让上一位提前退场。
 * 应用重启时该表随进程一起清空，符合"应用没开=直接错误"的既定原则。
 */

import type { ReminderResponse } from '../../shared/types';

export type WaiterOutcome =
  | { kind: 'responded'; response: ReminderResponse }
  | { kind: 'dismissed' }
  | { kind: 'superseded' }
  | { kind: 'timeout' };

interface WaiterEntry {
  resolve: (outcome: WaiterOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

const waiters = new Map<string, WaiterEntry>();

export function registerWaiter(
  reminderId: string,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<WaiterOutcome> {
  return new Promise<WaiterOutcome>((resolve) => {
    // 同一 reminderId 上如果已有 waiter（同 key 命中场景），先把旧的顶掉
    const prev = waiters.get(reminderId);
    if (prev) {
      clearTimeout(prev.timer);
      waiters.delete(reminderId);
      prev.resolve({ kind: 'superseded' });
    }

    const timer = setTimeout(() => {
      if (waiters.get(reminderId)?.timer !== timer) return;
      waiters.delete(reminderId);
      try { onTimeout(); } catch { /* 忽略清理阶段异常 */ }
      resolve({ kind: 'timeout' });
    }, timeoutMs);

    waiters.set(reminderId, { resolve, timer });
  });
}

export function fulfillWaiter(reminderId: string, outcome: WaiterOutcome): boolean {
  const entry = waiters.get(reminderId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  waiters.delete(reminderId);
  entry.resolve(outcome);
  return true;
}

export function hasWaiter(reminderId: string): boolean {
  return waiters.has(reminderId);
}

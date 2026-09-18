/**
 * todo 插件 —— 到期巡查（Stage 5）
 *
 * 周期扫描「已到期且未完成」的事项，把全量到期集经 bus `todo:due-scan` 广播；
 * reminder 插件订阅该事件，按 (source='todo', key=todoId) upsert 提醒并反向核对
 * （事项 done/cancelled/改期到未来/删除后，对应 active 提醒被关闭）。
 *
 * 跨插件只走 bus（铁律：插件间禁止直接 import），本文件不引用 reminder 的任何代码。
 *
 * 触发时机：
 *  - 插件 activate 后首扫（延后一个 tick，等所有插件的 core:ready 处理完）；
 *  - 每 60s 周期巡查；
 *  - `todo:changed` 即时核对（面板/CLI 变更后提醒立即跟随，不等下个周期）。
 */

import { bus } from '../../core/event-bus';
import { api, parseDueAtMs } from './api';
import type {
  ReminderSeverity,
  Todo,
  TodoDueReminderItem,
  TodoDueScanPayload,
} from '../../shared/types';

/** 巡查间隔：默认 60s（测试可注入更短间隔）。 */
export const DUE_SCAN_INTERVAL_MS = 60_000;

let intervalTimer: ReturnType<typeof setInterval> | null = null;
let firstScanTimer: ReturnType<typeof setTimeout> | null = null;
let listeningChanged = false;

/** 本地日历日（YYYY-MM-DD），用于「逾期 vs 今日到期」判定。 */
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 截止的本地日历日 < 今天 → 已逾期；今天（含今天已过时刻）→ 今日到期。 */
export function isOverdue(dueAt: string, now: Date): boolean {
  const dueMs = parseDueAtMs(dueAt);
  if (dueMs === null) return false;
  return localDay(new Date(dueMs)) < localDay(now);
}

/**
 * severity 映射（以 reminder 的 info | warning | error 为准）：
 * 已逾期 → warning，高优（P3）提一档 → error；今日到期 → info，高优 → warning。
 */
export function severityFor(priority: number, overdue: boolean): ReminderSeverity {
  if (overdue) return priority >= 3 ? 'error' : 'warning';
  return priority >= 3 ? 'warning' : 'info';
}

/** 截止时间的提醒正文格式：date-only 原样，日期时间取本地 YYYY-MM-DD HH:mm。 */
function formatDue(dueAt: string): string {
  const dueMs = parseDueAtMs(dueAt);
  if (dueMs === null) return dueAt;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueAt.trim())) return dueAt.trim();
  const d = new Date(dueMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${localDay(d)} ${hh}:${mm}`;
}

/** 把一条已到期事项组装成提醒快照；dueAt 缺失/非法时返回 null。 */
export function toDueReminderItem(todo: Todo, now: Date): TodoDueReminderItem | null {
  if (!todo.dueAt) return null;
  const overdue = isOverdue(todo.dueAt, now);
  const pri = todo.priority > 0 ? ` · P${todo.priority}` : '';
  return {
    id: todo.id,
    title: `${overdue ? '已逾期' : '今日到期'}：${todo.title}`,
    body: `截止 ${formatDue(todo.dueAt)}${pri}`,
    severity: severityFor(todo.priority, overdue),
    dueAt: todo.dueAt,
    priority: todo.priority,
    overdue,
  };
}

/** 扫一次并把全量到期集广播出去；返回本次条目（测试友好）。 */
export function scanDueTodos(now: Date = new Date()): TodoDueReminderItem[] {
  const items = api
    .listDue(now)
    .map((t) => toDueReminderItem(t, now))
    .filter((i): i is TodoDueReminderItem => i !== null);
  const payload: TodoDueScanPayload = { scannedAt: now.toISOString(), items };
  bus.emit('todo:due-scan', payload);
  return items;
}

/** 定时器/事件驱动的扫描入口：异常内化处理，不传播到核心层。 */
function runScanSafely(): void {
  try {
    scanDueTodos();
  } catch (err) {
    console.error('[todo] 到期巡查失败:', err);
  }
}

function onTodoChanged(): void {
  runScanSafely();
}

/**
 * 启动巡查：立即首扫（延后一个 tick）+ 周期巡查 + todo:changed 即时核对。
 * 幂等：重复调用先停旧定时器。
 */
export function startDueScanner(intervalMs: number = DUE_SCAN_INTERVAL_MS): void {
  stopDueScannerTimers();
  // 首扫延后一个 tick：等所有插件的 core:ready 处理完（reminder 表与订阅就绪），
  // 不依赖插件加载顺序。
  firstScanTimer = setTimeout(() => {
    firstScanTimer = null;
    runScanSafely();
  }, 0);
  intervalTimer = setInterval(runScanSafely, intervalMs);
  if (!listeningChanged) {
    bus.on('todo:changed', onTodoChanged);
    listeningChanged = true;
  }
}

function stopDueScannerTimers(): void {
  if (firstScanTimer) {
    clearTimeout(firstScanTimer);
    firstScanTimer = null;
  }
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}

/** 停止巡查并释放监听器（deactivate 时调用）。 */
export function stopDueScanner(): void {
  stopDueScannerTimers();
  if (listeningChanged) {
    bus.off('todo:changed', onTodoChanged);
    listeningChanged = false;
  }
}

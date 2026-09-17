import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, Plus, Trash2, X } from 'lucide-react';
import type { Todo, TodoList } from '../../src/shared/types';

/**
 * 事项管理 · 中央驾驶舱列表页（HANJ-77 Stage 3）
 * 视觉与交互以父 issue 附件 v7 原型为准：MISSION LOG 飞船驾驶舱。
 * tab 内自成暗色世界，全部样式 scoped 在 .todo-cockpit 下，不影响其他 tab。
 */

// ===== 视觉 token（与 v7 一致） =====
const CSS = `
.todo-cockpit {
  --bg: #060d18;
  --line: rgba(103, 232, 249, 0.14);
  --line-strong: rgba(103, 232, 249, 0.35);
  --phos: #67e8f9;
  --phos-dim: #3b7d8c;
  --amber: #fbbf24;
  --red: #f87171;
  --green: #34d399;
  --ink: #d7ecf5;
  --ink-2: #8fb3c7;
  --ink-3: #5f8098;

  width: 100%; height: 100%;
  background:
    radial-gradient(120% 90% at 50% -10%, #0d1c33 0%, #060d18 55%),
    #060d18;
  color: var(--ink);
  font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, "PingFang SC", monospace;
  font-size: 13px;
  caret-color: var(--phos);
  display: flex; justify-content: center;
  overflow: hidden;
  position: relative;
  border-radius: 4px;
}
.todo-cockpit ::selection { background: rgba(103, 232, 249, 0.28); }
/* 扫描线 + 网格 */
.todo-cockpit::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,0.016) 0 1px, transparent 1px 3px);
}
.todo-cockpit::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background:
    linear-gradient(rgba(103,232,249,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(103,232,249,0.03) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(80% 70% at 50% 40%, transparent 30%, #000 100%);
  -webkit-mask-image: radial-gradient(80% 70% at 50% 40%, transparent 30%, #000 100%);
}

.todo-cockpit .column {
  width: 560px; max-width: 100%; flex: 1;
  display: flex; flex-direction: column;
  padding: 0 22px; position: relative; z-index: 1; min-height: 0;
}

/* ===== 顶部：MISSION LOG + 状态灯 + 星历 ===== */
.todo-cockpit .head {
  display: flex; align-items: center; gap: 14px;
  padding: 18px 2px 12px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.todo-cockpit .head h1 {
  font-size: 15px; font-weight: 700; letter-spacing: 0.22em;
  color: var(--phos); margin: 0;
  text-shadow: 0 0 12px rgba(103, 232, 249, 0.45);
}
.todo-cockpit .head h1 .zh { font-size: 11px; letter-spacing: 0.5em; color: var(--ink-3); text-shadow: none; margin-left: 8px; font-weight: 400; }
.todo-cockpit .leds { display: flex; gap: 10px; margin-left: 4px; }
.todo-cockpit .led { display: flex; align-items: center; gap: 4px; font-size: 9px; letter-spacing: 0.12em; color: var(--ink-3); }
.todo-cockpit .led i { width: 6px; height: 6px; border-radius: 50%; }
.todo-cockpit .led.on i { background: var(--green); box-shadow: 0 0 6px var(--green); }
.todo-cockpit .led.nav i { background: var(--phos); box-shadow: 0 0 6px var(--phos); }
.todo-cockpit .stardate {
  margin-left: auto; font-size: 11px; color: var(--ink-2);
  font-variant-numeric: tabular-nums; letter-spacing: 0.06em;
}
.todo-cockpit .stardate b { color: var(--phos); font-weight: 600; }

/* ===== 视图切换 ===== */
.todo-cockpit .views { display: flex; gap: 6px; padding: 12px 2px 0; flex-shrink: 0; }
.todo-cockpit .view {
  font-size: 11px; letter-spacing: 0.1em;
  color: var(--ink-3); padding: 4px 12px;
  border: 1px solid transparent; border-radius: 3px;
  cursor: pointer; transition: all .15s ease;
  user-select: none;
}
.todo-cockpit .view:hover { color: var(--ink-2); border-color: var(--line); }
.todo-cockpit .view.active {
  color: var(--phos); border-color: var(--line-strong);
  background: rgba(103, 232, 249, 0.07);
  box-shadow: 0 0 12px rgba(103, 232, 249, 0.12) inset;
}
.todo-cockpit .view .n { opacity: 0.7; margin-left: 4px; font-variant-numeric: tabular-nums; }

/* ===== 录入台 ===== */
.todo-cockpit .quick-add {
  margin-top: 12px; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px;
  background: rgba(103, 232, 249, 0.05);
  border: 1px solid var(--line-strong);
  border-radius: 4px; padding: 11px 14px;
  position: relative; cursor: text;
  box-shadow: 0 0 20px rgba(103, 232, 249, 0.08), 0 0 0 1px rgba(103,232,249,0.04) inset;
}
.todo-cockpit .quick-add::before, .todo-cockpit .quick-add::after {
  content: ''; position: absolute; width: 10px; height: 10px;
  border: 1.5px solid var(--phos); pointer-events: none;
}
.todo-cockpit .quick-add::before { top: -1px; left: -1px; border-right: none; border-bottom: none; }
.todo-cockpit .quick-add::after { bottom: -1px; right: -1px; border-left: none; border-top: none; }
.todo-cockpit .quick-add .prompt { color: var(--phos); font-weight: 700; text-shadow: 0 0 8px rgba(103,232,249,.5); }
.todo-cockpit .quick-add input {
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  font-family: inherit; font-size: 12.5px; color: var(--ink); letter-spacing: 0.04em;
}
.todo-cockpit .quick-add input::placeholder { color: var(--ink-3); }
.todo-cockpit .quick-add .caret {
  width: 7px; height: 15px; background: var(--phos); flex-shrink: 0;
  box-shadow: 0 0 8px var(--phos);
  animation: todo-blink 1.1s steps(1) infinite;
}
@keyframes todo-blink { 50% { opacity: 0; } }
.todo-cockpit .quick-add kbd {
  margin-left: auto; font-family: inherit; font-size: 10px; letter-spacing: 0.1em;
  color: var(--phos-dim); border: 1px solid var(--line); border-radius: 3px; padding: 2px 7px;
  flex-shrink: 0;
}

/* ===== 任务日志列表 ===== */
.todo-cockpit .list { flex: 1; overflow-y: auto; margin-top: 8px; padding-right: 4px; min-height: 0;
  mask-image: linear-gradient(to bottom, #000 93%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, #000 93%, transparent); }
.todo-cockpit .list::-webkit-scrollbar { width: 6px; }
.todo-cockpit .list::-webkit-scrollbar-thumb { background: rgba(103,232,249,0.2); border-radius: 3px; }

.todo-cockpit .group {
  font-size: 10px; font-weight: 700; letter-spacing: 0.28em;
  color: var(--ink-3);
  margin: 20px 2px 4px; display: flex; align-items: center; gap: 8px;
}
.todo-cockpit .group:first-child { margin-top: 10px; }
.todo-cockpit .group::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.todo-cockpit .group .n { font-variant-numeric: tabular-nums; }
.todo-cockpit .group.overdue { color: var(--red); }
.todo-cockpit .group.overdue::after { background: rgba(248, 113, 113, 0.25); }
.todo-cockpit .group.today { color: var(--phos); }

.todo-cockpit .empty {
  padding: 42px 0; text-align: center;
  font-size: 11px; letter-spacing: 0.2em; color: var(--ink-3);
}

.todo-cockpit .row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 9px 6px;
  border-bottom: 1px solid var(--line);
  transition: background .15s ease;
}
.todo-cockpit .row:hover { background: rgba(103, 232, 249, 0.04); }
.todo-cockpit .row-main { display: flex; align-items: center; gap: 11px; flex: 1; min-width: 0; cursor: pointer; }

.todo-cockpit .check {
  width: 16px; height: 16px; flex-shrink: 0;
  border: 1.5px solid var(--ink-3);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--bg);
  transition: all .18s ease;
  cursor: pointer;
}
.todo-cockpit .check svg { width: 9px; height: 9px; stroke-width: 3; opacity: 0; transform: scale(0.4); transition: all .18s ease; }
.todo-cockpit .check.p1 { border-color: var(--red); box-shadow: 0 0 6px rgba(248,113,113,.35); }
.todo-cockpit .check.p2 { border-color: var(--amber); box-shadow: 0 0 6px rgba(251,191,36,.3); }
.todo-cockpit .check.p3 { border-color: var(--phos); box-shadow: 0 0 6px rgba(103,232,249,.3); }
.todo-cockpit .check.done { background: var(--green); border-color: var(--green); box-shadow: 0 0 10px rgba(52, 211, 153, 0.55); }
.todo-cockpit .check.done svg { opacity: 1; transform: scale(1); }

.todo-cockpit .title { font-size: 13px; line-height: 1.45; color: var(--ink); word-break: break-all; transition: color .18s ease; }
.todo-cockpit .row.done .title { color: var(--ink-3); text-decoration: line-through; }
.todo-cockpit .row .meta {
  margin-left: auto; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px;
  font-size: 10.5px; color: var(--ink-3); font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
}
.todo-cockpit .meta .list-ref { display: inline-flex; align-items: center; gap: 5px; }
.todo-cockpit .meta .dot { width: 6px; height: 6px; border-radius: 50%; }
.todo-cockpit .meta .due { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-2); }
.todo-cockpit .meta .due svg { width: 11px; height: 11px; }
.todo-cockpit .meta .due.overdue { color: var(--red); text-shadow: 0 0 8px rgba(248,113,113,.4); }
.todo-cockpit .meta .due.today { color: var(--amber); text-shadow: 0 0 8px rgba(251,191,36,.35); }

/* 展开：HUD 手风琴 */
.todo-cockpit .row.expanded {
  flex-direction: column; align-items: stretch;
  background: rgba(103, 232, 249, 0.045);
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: 10px 14px 12px; margin: 5px 0;
  position: relative;
}
.todo-cockpit .row.expanded::before, .todo-cockpit .row.expanded::after {
  content: ''; position: absolute; width: 10px; height: 10px; border: 1.5px solid var(--phos); pointer-events: none;
}
.todo-cockpit .row.expanded::before { top: -1px; left: -1px; border-right: none; border-bottom: none; }
.todo-cockpit .row.expanded::after { bottom: -1px; right: -1px; border-left: none; border-top: none; }
.todo-cockpit .expand-body { padding: 12px 0 2px 27px; display: flex; flex-direction: column; gap: 12px; }
.todo-cockpit .note {
  font-size: 12px; color: var(--ink-2); line-height: 1.65;
  background: rgba(6, 13, 24, 0.6); border: 1px solid var(--line);
  border-left: 2px solid var(--phos-dim);
  border-radius: 3px; padding: 8px 10px;
  font-family: inherit; width: 100%; resize: vertical; min-height: 38px;
  outline: none;
}
.todo-cockpit .note:focus { border-color: var(--line-strong); }
.todo-cockpit .note::placeholder { color: var(--ink-3); }
.todo-cockpit .expand-row { display: flex; align-items: center; gap: 7px; font-size: 11px; flex-wrap: wrap; }
.todo-cockpit .expand-row .lbl { color: var(--ink-3); letter-spacing: 0.15em; font-size: 10px; width: 34px; flex-shrink: 0; }
.todo-cockpit .chip {
  font-size: 11px; padding: 3px 10px; border-radius: 3px;
  border: 1px solid var(--line); background: transparent;
  color: var(--ink-3); cursor: pointer; transition: all .15s ease;
  font-family: inherit; letter-spacing: 0.04em;
}
.todo-cockpit .chip:hover { color: var(--ink-2); border-color: var(--line-strong); }
.todo-cockpit .chip.on {
  color: var(--phos); border-color: var(--phos);
  background: rgba(103, 232, 249, 0.1);
  box-shadow: 0 0 10px rgba(103, 232, 249, 0.18);
}
.todo-cockpit .chip.on-warn {
  color: var(--amber); border-color: var(--amber);
  background: rgba(251, 191, 36, 0.08);
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.15);
}
.todo-cockpit .chip.on-danger {
  color: var(--red); border-color: var(--red);
  background: rgba(248, 113, 113, 0.08);
  box-shadow: 0 0 10px rgba(248, 113, 113, 0.15);
}
.todo-cockpit .subtask { display: flex; align-items: center; gap: 9px; font-size: 12px; padding: 3px 0; color: var(--ink-2); }
.todo-cockpit .subtask .sq {
  width: 13px; height: 13px; border: 1.5px solid var(--ink-3);
  border-radius: 2px; color: var(--bg);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  cursor: pointer; transition: all .15s ease;
}
.todo-cockpit .subtask .sq svg { width: 8px; height: 8px; stroke-width: 3; }
.todo-cockpit .subtask.done .sq { background: var(--green); border-color: var(--green); box-shadow: 0 0 7px rgba(52,211,153,.5); }
.todo-cockpit .subtask.done span { color: var(--ink-3); text-decoration: line-through; }
.todo-cockpit .subtask .sub-x {
  opacity: 0; margin-left: auto; background: none; border: none; color: var(--ink-3);
  cursor: pointer; padding: 2px; display: flex; align-items: center; transition: all .15s ease;
}
.todo-cockpit .subtask:hover .sub-x { opacity: 1; }
.todo-cockpit .subtask .sub-x:hover { color: var(--red); }
.todo-cockpit .subtask.add { color: var(--ink-3); font-size: 11px; letter-spacing: 0.08em; }
.todo-cockpit .subtask.add input {
  flex: 1; background: transparent; border: none; outline: none;
  font-family: inherit; font-size: 11px; letter-spacing: 0.08em; color: var(--ink-2);
}
.todo-cockpit .subtask.add input::placeholder { color: var(--ink-3); }
.todo-cockpit .expand-actions { display: flex; gap: 16px; margin-top: 2px; }
.todo-cockpit .link {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; letter-spacing: 0.1em; color: var(--ink-3);
  cursor: pointer; background: none; border: none; font-family: inherit; padding: 0;
}
.todo-cockpit .link:hover { color: var(--ink); }
.todo-cockpit .link.danger:hover { color: var(--red); }
.todo-cockpit .link svg { width: 12px; height: 12px; }

/* ===== 底部状态栏 ===== */
.todo-cockpit .foot {
  padding: 10px 2px 13px; flex-shrink: 0;
  font-size: 10px; letter-spacing: 0.1em; color: var(--ink-3);
  display: flex; gap: 18px; align-items: center; flex-wrap: wrap;
  border-top: 1px solid var(--line);
}
.todo-cockpit .foot .ok { color: var(--green); }
.todo-cockpit .foot code { font-family: inherit; color: var(--phos-dim); }
`;

// ===== 日期工具（全部本地时区；date-only 用 YYYY-MM-DD 避免 sqlite date() 的 UTC 偏差） =====
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayStr(): string {
  return toDateStr(new Date());
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}
/** dueAt 可能是 date-only 或日期时间；统一折成本地日期串。 */
function dueDateStr(dueAt: string | null): string | null {
  if (!dueAt) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) return dueAt;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  return toDateStr(d);
}
function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000);
}

type ViewKey = 'today' | 'inbox' | 'all' | 'done';
const VIEW_DEFS: { key: ViewKey; label: string }[] = [
  { key: 'today', label: 'TODAY' },
  { key: 'inbox', label: 'INBOX' },
  { key: 'all', label: 'ALL' },
  { key: 'done', label: 'DONE' },
];

type GroupKey = 'overdue' | 'today' | 'tomorrow' | 'later';
const GROUP_DEFS: { key: GroupKey; label: string; cls?: string }[] = [
  { key: 'overdue', label: 'OVERDUE // 逾期', cls: 'overdue' },
  { key: 'today', label: 'TODAY // 今日航段', cls: 'today' },
  { key: 'tomorrow', label: 'TOMORROW // 下一航段' },
  { key: 'later', label: 'HOLDING // 待轨' },
];

/** 录入台快速语法：#标签 @清单 !优先级（!1 低 / !2 中 / !3 高）。 */
function parseQuickInput(raw: string, lists: TodoList[]): {
  title: string; tags: string[]; priority: number; listId: string | null;
} {
  const tags: string[] = [];
  let priority = 0;
  let listId: string | null = null;
  const titleParts: string[] = [];
  for (const tok of raw.split(/\s+/)) {
    if (!tok) continue;
    if (tok.startsWith('#') && tok.length > 1) {
      tags.push(tok.slice(1));
      continue;
    }
    if (tok.startsWith('@') && tok.length > 1) {
      const name = tok.slice(1).toLowerCase();
      const hit = lists.find((l) => l.name.toLowerCase() === name);
      if (hit) {
        listId = hit.id;
        continue;
      }
      // 未匹配的 @ 原样留在标题里，避免静默吞字
      titleParts.push(tok);
      continue;
    }
    const pm = tok.match(/^!([123])$/);
    if (pm) {
      priority = Number(pm[1]);
      continue;
    }
    titleParts.push(tok);
  }
  return { title: titleParts.join(' ').trim(), tags, priority, listId };
}

function groupOf(todo: Todo, today: string): GroupKey {
  const due = dueDateStr(todo.dueAt);
  if (!due) return 'later';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due === addDays(today, 1)) return 'tomorrow';
  return 'later';
}

function sortGroup(items: Todo[]): Todo[] {
  return [...items].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const da = dueDateStr(a.dueAt) ?? '9999-12-31';
    const db = dueDateStr(b.dueAt) ?? '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

/** 行尾到期标签：逾期 T-Nd 红 / 今天 HH:mm 或 TODAY 琥珀 / 明天 T+1D / 稍后 MM-DD。 */
function dueLabel(todo: Todo, today: string): { text: string; cls: string } | null {
  const due = dueDateStr(todo.dueAt);
  if (!due) return null;
  if (due < today) return { text: `T-${diffDays(today, due)}D`, cls: 'overdue' };
  if (due === today) {
    const raw = todo.dueAt ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return { text: `${hh}:${mm}`, cls: 'today' };
      }
    }
    return { text: 'TODAY', cls: 'today' };
  }
  if (due === addDays(today, 1)) return { text: 'T+1D', cls: '' };
  return { text: due.slice(5), cls: '' };
}

/** 勾选圈优先级色：3 高红 / 2 中琥珀 / 1 低青 / 0 默认。 */
function checkClass(priority: number): string {
  if (priority === 3) return 'p1';
  if (priority === 2) return 'p2';
  if (priority === 1) return 'p3';
  return '';
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function stardate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const doy = Math.floor((now.getTime() - new Date(y, 0, 0).getTime()) / 86400000);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${y}.${String(doy).padStart(3, '0')} // ${mm}-${dd} ${WEEKDAYS[now.getDay()]}`;
}

function logError(message: string, meta?: Record<string, unknown>): void {
  try {
    void window.assistant.log('error', 'renderer:todo', message, meta);
  } catch {
    /* 日志失败不影响页面 */
  }
}

interface RowProps {
  todo: Todo;
  lists: TodoList[];
  today: string;
  expanded: boolean;
  completing: boolean;
  onToggleExpand: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onUpdate: (patch: Parameters<typeof window.assistant.todo.update>[1]) => void;
  onRemove: () => void;
}

function TodoRow(props: RowProps) {
  const { todo, lists, today, expanded, completing } = props;
  const [subDraft, setSubDraft] = useState('');
  const isDone = todo.status === 'done';
  const showDone = isDone || completing;
  const list = todo.listId ? lists.find((l) => l.id === todo.listId) : null;
  const due = dueLabel(todo, today);

  const setSubtasks = (subtasks: Todo['subtasks']) => props.onUpdate({ subtasks });

  const toggleSubtask = (id: string) => {
    setSubtasks(todo.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  };
  const removeSubtask = (id: string) => {
    setSubtasks(todo.subtasks.filter((s) => s.id !== id));
  };
  const addSubtask = () => {
    const title = subDraft.trim();
    if (!title) return;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `st_${crypto.randomUUID()}`
      : `st_${Math.random().toString(36).slice(2, 12)}`;
    setSubtasks([...todo.subtasks, { id, title, done: false }]);
    setSubDraft('');
  };

  const dueChips: { label: string; target: string | null }[] = [
    { label: '今天', target: today },
    { label: '明天', target: addDays(today, 1) },
    { label: '下周', target: addDays(today, 7) },
    { label: '无日期', target: null },
  ];
  const currentDue = dueDateStr(todo.dueAt);

  // P3=低(1) P2=中(2) P1=高(3)，展示顺序同 v7：P3 P2 P1
  const priChips: { label: string; value: number; onCls: string }[] = [
    { label: 'P3', value: 1, onCls: 'on' },
    { label: 'P2', value: 2, onCls: 'on-warn' },
    { label: 'P1', value: 3, onCls: 'on-danger' },
  ];

  const rowCls = `row${expanded ? ' expanded' : ''}${showDone ? ' done' : ''}`;

  return (
    <div className={rowCls}>
      <div className="row-main" onClick={props.onToggleExpand}>
        <div
          className={`check ${checkClass(todo.priority)}${showDone ? ' done' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (isDone) props.onReopen();
            else props.onComplete();
          }}
        >
          <Check />
        </div>
        <span className="title">{todo.title}</span>
        <div className="meta">
          {list && (
            <span className="list-ref">
              <span className="dot" style={{ background: list.color ?? '#67e8f9' }} />
              {list.name.toUpperCase()}
            </span>
          )}
          {due && (
            <span className={`due ${due.cls}`}>
              <Clock />
              {due.text}
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div className="expand-body">
          <textarea
            className="note"
            key={`${todo.id}:${todo.updatedAt}`}
            defaultValue={todo.note ?? ''}
            placeholder="// 备注…"
            rows={2}
            onBlur={(e) => {
              const next = e.target.value.trim();
              const prev = (todo.note ?? '').trim();
              if (next !== prev) props.onUpdate({ note: next || null });
            }}
          />
          <div className="expand-row">
            <span className="lbl">DUE</span>
            {dueChips.map((c) => (
              <div
                key={c.label}
                className={`chip${currentDue === c.target || (c.target === null && currentDue === null) ? ' on' : ''}`}
                onClick={() => props.onUpdate({ dueAt: c.target })}
              >
                {c.label}
              </div>
            ))}
          </div>
          <div className="expand-row">
            <span className="lbl">PRI</span>
            {priChips.map((c) => (
              <div
                key={c.label}
                className={`chip${todo.priority === c.value ? ` ${c.onCls}` : ''}`}
                onClick={() => props.onUpdate({ priority: todo.priority === c.value ? 0 : c.value })}
              >
                {c.label}
              </div>
            ))}
          </div>
          <div>
            {todo.subtasks.map((st) => (
              <div key={st.id} className={`subtask${st.done ? ' done' : ''}`}>
                <div className="sq" onClick={() => toggleSubtask(st.id)}>
                  {st.done && <Check />}
                </div>
                <span>{st.title}</span>
                <button className="sub-x" onClick={() => removeSubtask(st.id)} title="删除子任务">
                  <X />
                </button>
              </div>
            ))}
            <div className="subtask add">
              <Plus />
              <input
                value={subDraft}
                placeholder="ADD SUB"
                onChange={(e) => setSubDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
              />
            </div>
          </div>
          <div className="expand-actions">
            <button className="link danger" onClick={props.onRemove}>
              <Trash2 />
              PURGE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TodoPage() {
  const [view, setView] = useState<ViewKey>('today');
  const [data, setData] = useState<Record<ViewKey, Todo[]>>({ today: [], inbox: [], all: [], done: [] });
  const [lists, setLists] = useState<TodoList[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<ReadonlySet<string>>(new Set());
  const [inputValue, setInputValue] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const today = todayStr();
  const [sdMain, sdDate] = useMemo(() => stardate().split(' // '), []);

  const load = useCallback(async () => {
    try {
      const [todayItems, inboxItems, allItems, doneItems, allLists] = await Promise.all([
        window.assistant.todo.list({ view: 'today' }),
        window.assistant.todo.list({ view: 'inbox' }),
        window.assistant.todo.list({ view: 'all' }),
        window.assistant.todo.list({ view: 'done' }),
        window.assistant.todo.listLists(),
      ]);
      setData({ today: todayItems, inbox: inboxItems, all: allItems, done: doneItems });
      setLists(allLists);
    } catch (err) {
      logError('事项列表加载失败', { error: String(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // CLI / 其他窗口写入时实时刷新（todo:changed → todo:update 广播）
  useEffect(() => {
    const unsubscribe = window.assistant.todo.onUpdate?.(() => {
      void load();
    });
    return () => {
      unsubscribe?.();
    };
  }, [load]);

  // ⌘K 全局聚焦录入台
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const create = async () => {
    const parsed = parseQuickInput(inputValue, lists);
    if (!parsed.title) return;
    setInputValue('');
    try {
      await window.assistant.todo.create({
        title: parsed.title,
        priority: parsed.priority,
        listId: parsed.listId,
        tags: parsed.tags.length ? parsed.tags : undefined,
      });
    } catch (err) {
      logError('创建事项失败', { error: String(err) });
    }
    await load();
  };

  // 勾选完成：绿色充能 200ms + 划线动画后落库刷新
  const complete = async (todo: Todo) => {
    if (completingIds.has(todo.id)) return;
    setCompletingIds((s) => new Set(s).add(todo.id));
    await new Promise((r) => setTimeout(r, 220));
    try {
      await window.assistant.todo.done(todo.id);
    } catch (err) {
      logError('完成事项失败', { error: String(err), id: todo.id });
    }
    setCompletingIds((s) => {
      const next = new Set(s);
      next.delete(todo.id);
      return next;
    });
    await load();
  };

  const reopen = async (todo: Todo) => {
    try {
      await window.assistant.todo.reopen(todo.id);
    } catch (err) {
      logError('重开事项失败', { error: String(err), id: todo.id });
    }
    await load();
  };

  const update = async (todo: Todo, patch: Parameters<typeof window.assistant.todo.update>[1]) => {
    try {
      await window.assistant.todo.update(todo.id, patch);
    } catch (err) {
      logError('更新事项失败', { error: String(err), id: todo.id });
    }
    await load();
  };

  const remove = async (todo: Todo) => {
    setExpandedId((cur) => (cur === todo.id ? null : cur));
    try {
      await window.assistant.todo.remove(todo.id);
    } catch (err) {
      logError('删除事项失败', { error: String(err), id: todo.id });
    }
    await load();
  };

  const items = data[view];

  const groups = useMemo(() => {
    if (view === 'done') return null;
    const grouped: Record<GroupKey, Todo[]> = { overdue: [], today: [], tomorrow: [], later: [] };
    for (const t of items) grouped[groupOf(t, today)].push(t);
    for (const key of Object.keys(grouped) as GroupKey[]) grouped[key] = sortGroup(grouped[key]);
    return grouped;
  }, [items, view, today]);

  const renderRow = (todo: Todo) => (
    <TodoRow
      key={todo.id}
      todo={todo}
      lists={lists}
      today={today}
      expanded={expandedId === todo.id}
      completing={completingIds.has(todo.id)}
      onToggleExpand={() => setExpandedId((cur) => (cur === todo.id ? null : todo.id))}
      onComplete={() => void complete(todo)}
      onReopen={() => void reopen(todo)}
      onUpdate={(patch) => void update(todo, patch)}
      onRemove={() => void remove(todo)}
    />
  );

  return (
    <div className="todo-cockpit">
      <style>{CSS}</style>
      <div className="column">
        <div className="head">
          <h1>
            MISSION LOG
            <span className="zh">事项</span>
          </h1>
          <div className="leds">
            <span className="led on"><i />PWR</span>
            <span className="led nav"><i />NAV</span>
            <span className="led on"><i />COM</span>
          </div>
          <div className="stardate">SD <b>{sdMain}</b> // {sdDate}</div>
        </div>

        <div className="views">
          {VIEW_DEFS.map((v) => (
            <div
              key={v.key}
              className={`view${view === v.key ? ' active' : ''}`}
              onClick={() => setView(v.key)}
            >
              {v.label}
              <span className="n">{data[v.key].length}</span>
            </div>
          ))}
        </div>

        <div className="quick-add" onClick={() => inputRef.current?.focus()}>
          <span className="prompt">›</span>
          <input
            ref={inputRef}
            value={inputValue}
            placeholder="新任务录入…（#标签 @清单 !优先级）"
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
          />
          {!inputFocused && inputValue === '' && <span className="caret" />}
          <kbd>⌘K</kbd>
        </div>

        <div className="list">
          {items.length === 0 && (
            <div className="empty">// NO ACTIVE MISSIONS — 录入第一条任务</div>
          )}
          {view === 'done'
            ? (
              <>
                {items.length > 0 && <div className="group">DONE // 归档 <span className="n">{items.length}</span></div>}
                {items.map(renderRow)}
              </>
            )
            : GROUP_DEFS.map((g) => {
                const rows = groups?.[g.key] ?? [];
                if (rows.length === 0) return null;
                return (
                  <React.Fragment key={g.key}>
                    <div className={`group${g.cls ? ` ${g.cls}` : ''}`}>
                      {g.label} <span className="n">{rows.length}</span>
                    </div>
                    {rows.map(renderRow)}
                  </React.Fragment>
                );
              })}
        </div>

        <div className="foot">
          <span>SYS <span className="ok">●</span> OK</span>
          <span><code>⌘K</code> QUICK-ADD</span>
          <span><code>uuutil.call.todo.add</code> UPLINK</span>
          <span>SYNC → REMINDER.CTR</span>
        </div>
      </div>
    </div>
  );
}

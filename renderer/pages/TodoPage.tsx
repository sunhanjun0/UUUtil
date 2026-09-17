import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, Plus, Trash2, X } from 'lucide-react';
import type { Todo, TodoList, TodoUpdatePayload } from '../../src/shared/types';

/**
 * 事项管理 · 驾驶舱列表页（HANJ-77 Stage 3 中央单栏 + Stage 4 舷侧仪表台/月历/动效）
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
  /* Stage 4：tab 进入 200ms 开机微闪（一次，不循环；路由 key 重挂载时重放） */
  animation: todo-boot 200ms linear 1;
}
@keyframes todo-boot {
  0% { opacity: 0; }
  30% { opacity: 1; }
  48% { opacity: 0.35; }
  72% { opacity: 1; }
  100% { opacity: 1; }
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

/* ===== Stage 4：舷侧仪表台（被动遥测，只读） ===== */
.todo-cockpit .console {
  width: 182px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 14px;
  padding: 18px 14px 14px;
  position: relative; z-index: 1;
  overflow-y: auto; min-height: 0;
}
.todo-cockpit .console::-webkit-scrollbar { width: 4px; }
.todo-cockpit .console::-webkit-scrollbar-thumb { background: rgba(103,232,249,0.14); border-radius: 2px; }
.todo-cockpit .console.left { border-right: 1px solid var(--line); }
.todo-cockpit .console.right { border-left: 1px solid var(--line); }
.todo-cockpit .con-title {
  font-size: 10px; font-weight: 700; letter-spacing: 0.28em;
  color: var(--ink-3); display: flex; align-items: center; gap: 6px;
  flex-shrink: 0;
}
.todo-cockpit .con-title::after { content: ''; flex: 1; height: 1px; background: var(--line); }
.todo-cockpit .con-empty { font-size: 9.5px; letter-spacing: 0.12em; color: var(--ink-3); opacity: 0.7; }

/* SYSTEMS 能量条 */
.todo-cockpit .sys { display: flex; flex-direction: column; gap: 9px; }
.todo-cockpit .sys-row { font-size: 10.5px; letter-spacing: 0.08em; color: var(--ink-2); }
.todo-cockpit .sys-row .top { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.todo-cockpit .sys-row .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.todo-cockpit .sys-row .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-cockpit .sys-row .cnt { margin-left: auto; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.todo-cockpit .gauge { height: 3px; background: rgba(103,232,249,0.1); border-radius: 2px; overflow: hidden; }
.todo-cockpit .gauge i { display: block; height: 100%; border-radius: 2px; transition: width .3s ease; }

/* OUTPUT // 近 7 日产出谱 */
.todo-cockpit .week { display: flex; flex-direction: column; gap: 6px; }
.todo-cockpit .week .bars { display: flex; align-items: flex-end; gap: 6px; height: 64px; padding: 0 2px; }
.todo-cockpit .week .b { flex: 1; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 5px; }
.todo-cockpit .week .b i { width: 100%; border-radius: 1.5px; background: rgba(103,232,249,0.22); transition: height .3s ease; }
.todo-cockpit .week .b.hot i { background: var(--phos); box-shadow: 0 0 6px rgba(103,232,249,.5); }
.todo-cockpit .week .b.zero i { background: rgba(103,232,249,0.08); }
.todo-cockpit .week .b span { font-size: 8.5px; color: var(--ink-3); letter-spacing: 0.05em; }
.todo-cockpit .week .b.hot span { color: var(--phos); }
.todo-cockpit .week .cap { font-size: 9px; letter-spacing: 0.18em; color: var(--ink-3); display: flex; justify-content: space-between; }
.todo-cockpit .week .cap b { color: var(--green); font-variant-numeric: tabular-nums; }

/* CAL // 历法 */
.todo-cockpit .cal { font-size: 9.5px; }
.todo-cockpit .cal-head { display: flex; align-items: center; margin-bottom: 6px; }
.todo-cockpit .cal-head .month { font-size: 10px; letter-spacing: 0.15em; color: var(--ink-2); font-weight: 700; font-variant-numeric: tabular-nums; }
.todo-cockpit .cal-head .nav { margin-left: auto; display: flex; gap: 2px; }
.todo-cockpit .cal-head .nav span {
  width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
  color: var(--ink-3); border: 1px solid var(--line); border-radius: 3px;
  cursor: pointer; font-size: 9px; user-select: none;
}
.todo-cockpit .cal-head .nav span:hover { color: var(--phos); border-color: var(--line-strong); }
.todo-cockpit .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
.todo-cockpit .cal-grid .wd { text-align: center; color: var(--ink-3); font-size: 8.5px; padding: 2px 0 4px; }
.todo-cockpit .cal-grid .d {
  position: relative; text-align: center; padding: 3px 0 4px;
  color: var(--ink-2); border-radius: 3px; cursor: pointer;
  font-variant-numeric: tabular-nums; border: 1px solid transparent;
  transition: all .12s ease; user-select: none;
}
.todo-cockpit .cal-grid .d:hover { background: rgba(103,232,249,0.08); }
.todo-cockpit .cal-grid .d.dim { color: rgba(95,128,152,0.4); }
.todo-cockpit .cal-grid .d .mk {
  position: absolute; left: 50%; bottom: 1px; transform: translateX(-50%);
  width: 3px; height: 3px; border-radius: 50%;
}
.todo-cockpit .cal-grid .d .mk.cy { background: var(--phos); box-shadow: 0 0 3px rgba(103,232,249,.6); }
.todo-cockpit .cal-grid .d .mk.rd { background: var(--red); box-shadow: 0 0 3px rgba(248,113,113,.6); }
.todo-cockpit .cal-grid .d .mk.am { background: var(--amber); box-shadow: 0 0 3px rgba(251,191,36,.6); }
.todo-cockpit .cal-grid .d.today { color: var(--phos); font-weight: 700; }
.todo-cockpit .cal-grid .d.sel {
  border-color: var(--phos); color: var(--phos); font-weight: 700;
  background: rgba(103,232,249,0.1);
  box-shadow: 0 0 8px rgba(103,232,249,0.18);
}

/* TELEMETRY 今日时间轴 */
.todo-cockpit .tl { position: relative; flex: 1; min-height: 60px; }
.todo-cockpit .tl-track { position: absolute; left: 5px; top: 4px; bottom: 4px; width: 1px; background: var(--line-strong); }
.todo-cockpit .tl-evt { position: relative; padding: 0 0 14px 18px; font-size: 10.5px; color: var(--ink-2); }
.todo-cockpit .tl-evt .t { color: var(--ink-3); font-variant-numeric: tabular-nums; letter-spacing: 0.05em; display: block; font-size: 9.5px; }
.todo-cockpit .tl-evt .txt { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-cockpit .tl-evt::before {
  content: ''; position: absolute; left: 2px; top: 4px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--bg); border: 1.5px solid var(--phos);
}
.todo-cockpit .tl-evt.done::before { background: var(--green); border-color: var(--green); box-shadow: 0 0 6px rgba(52,211,153,.5); }
.todo-cockpit .tl-evt.warn::before { border-color: var(--amber); box-shadow: 0 0 6px rgba(251,191,36,.5); }
.todo-cockpit .tl-evt.miss::before { border-color: var(--red); box-shadow: 0 0 6px rgba(248,113,113,.5); }
.todo-cockpit .tl-evt.done .txt { color: var(--ink-3); text-decoration: line-through; }
.todo-cockpit .tl-now { position: relative; padding: 0 0 14px 18px; font-size: 9.5px; color: var(--phos); letter-spacing: 0.1em; font-variant-numeric: tabular-nums; }
.todo-cockpit .tl-now::before {
  content: ''; position: absolute; left: 0; top: 4px;
  width: 11px; height: 2px; background: var(--phos); box-shadow: 0 0 6px var(--phos);
}

/* TODAY OUTPUT 完成度段条 */
.todo-cockpit .seg { display: flex; gap: 3px; }
.todo-cockpit .seg i { flex: 1; height: 6px; background: rgba(103,232,249,0.1); border-radius: 1px; }
.todo-cockpit .seg i.lit { background: var(--green); box-shadow: 0 0 5px rgba(52,211,153,.5); }
.todo-cockpit .seg-cap { display: flex; justify-content: space-between; font-size: 9.5px; color: var(--ink-3); letter-spacing: 0.1em; margin-bottom: 5px; }
.todo-cockpit .seg-cap b { color: var(--green); font-variant-numeric: tabular-nums; }

/* Stage 4 动效：COM 灯闪两下（CLI 外部写入）+ 新行滑入 */
@keyframes todo-com-pulse {
  0%, 100% { opacity: 1; }
  12% { opacity: 0.1; box-shadow: none; }
  30% { opacity: 1; box-shadow: 0 0 8px var(--green), 0 0 18px var(--green); }
  48% { opacity: 0.1; box-shadow: none; }
  68% { opacity: 1; box-shadow: 0 0 8px var(--green), 0 0 18px var(--green); }
}
.todo-cockpit .led i.com-pulse { animation: todo-com-pulse 0.6s ease-in-out 1; }
@keyframes todo-row-in {
  from { opacity: 0; transform: translateX(-16px); background: rgba(103,232,249,0.14); }
  60% { background: rgba(103,232,249,0.07); }
  to { opacity: 1; transform: translateX(0); background: transparent; }
}
.todo-cockpit .row.incoming { animation: todo-row-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) 1; }

/* 头部日期筛选 chip（月历选中非今天时出现） */
.todo-cockpit .view.date-chip { display: inline-flex; align-items: center; gap: 6px; }
.todo-cockpit .view.date-chip svg { width: 11px; height: 11px; opacity: 0.75; }
.todo-cockpit .view.date-chip svg:hover { opacity: 1; }

/* 窄面板保底：优先隐藏两侧舷台，中央列表独占 */
@media (max-width: 720px) {
  .todo-cockpit .console { display: none; }
}
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

// ===== Stage 4 舷侧辅助 =====

/** dueAt 是否带具体时间（date-only 无时刻，不进 TELEMETRY 时间轴）。 */
function hasClock(dueAt: string | null): boolean {
  if (!dueAt) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) return false;
  return !Number.isNaN(new Date(dueAt).getTime());
}

/** 本地 HH:mm。 */
function clockLabel(dueAt: string): string {
  const d = new Date(dueAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** completedAt（ISO，UTC）折成本地日期串；无则 null。 */
function completedDateStr(completedAt: string | null): string | null {
  if (!completedAt) return null;
  const d = new Date(completedAt);
  return Number.isNaN(d.getTime()) ? null : toDateStr(d);
}

interface CalCell { date: string; day: number; dim: boolean }
/** 月历网格：周一开头，前后月补齐到整周（dim 标记非本月）。 */
function buildCalCells(y: number, m: number): CalCell[] {
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const cells: CalCell[] = [];
  const start = new Date(y, m, 1 - offset);
  const total = Math.ceil((offset + new Date(y, m + 1, 0).getDate()) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date: toDateStr(d), day: d.getDate(), dim: d.getMonth() !== m });
  }
  return cells;
}

const CAL_WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/** 近 7 日产出：以今天收尾的 7 天（旧→新），标签周一~周日、今天为「今」。 */
function weekBuckets(doneItems: Todo[], today: string): { date: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of doneItems) {
    const d = completedDateStr(t.completedAt);
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const out: { date: string; label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    const wd = CAL_WEEKDAYS[(new Date(`${date}T00:00:00`).getDay() + 6) % 7];
    out.push({ date, label: i === 0 ? '今' : wd, count: counts.get(date) ?? 0 });
  }
  return out;
}

/** 连续完成天数：今天有完成从今天起算，否则从昨天起算（今天还没结束不算断签）。 */
function streakOf(doneItems: Todo[], today: string): number {
  const days = new Set<string>();
  for (const t of doneItems) {
    const d = completedDateStr(t.completedAt);
    if (d) days.add(d);
  }
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
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
  /** CLI 外部写入的新行：滑入动画。 */
  incoming: boolean;
  onToggleExpand: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onUpdate: (patch: Parameters<typeof window.assistant.todo.update>[1]) => void;
  onRemove: () => void;
}

function TodoRow(props: RowProps) {
  const { todo, lists, today, expanded, completing, incoming } = props;
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

  const rowCls = `row${expanded ? ' expanded' : ''}${showDone ? ' done' : ''}${incoming ? ' incoming' : ''}`;

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

// ===== Stage 4：舷侧仪表台 =====

/** 左舷 SYSTEMS：各清单未完成任务能量条，条长按最大值归一，清单色发光。 */
function SystemsPanel({ lists }: { lists: TodoList[] }) {
  const max = Math.max(1, ...lists.map((l) => l.openCount ?? 0));
  return (
    <>
      <div className="con-title">SYSTEMS</div>
      <div className="sys">
        {lists.length === 0 && <div className="con-empty">// NO SYSTEMS ONLINE</div>}
        {lists.map((l) => {
          const cnt = l.openCount ?? 0;
          const color = l.color ?? '#67e8f9';
          return (
            <div className="sys-row" key={l.id}>
              <div className="top">
                <span className="dot" style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
                <span className="nm">{l.name.toUpperCase()}</span>
                <span className="cnt">{cnt}</span>
              </div>
              <div className="gauge">
                <i style={{ width: `${Math.round((cnt / max) * 100)}%`, background: color, boxShadow: `0 0 5px ${color}` }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** 左舷 OUTPUT // 近 7 日：completedAt 按天聚合柱状谱，今天高亮；下挂 STREAK + TOTAL。 */
function WeekPanel({ doneItems, today }: { doneItems: Todo[]; today: string }) {
  const buckets = weekBuckets(doneItems, today);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const streak = streakOf(doneItems, today);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  return (
    <>
      <div className="con-title" style={{ marginTop: 6 }}>OUTPUT // 近 7 日</div>
      <div className="week">
        <div className="bars">
          {buckets.map((b) => {
            const cls = `b${b.date === today ? ' hot' : ''}${b.count === 0 ? ' zero' : ''}`;
            const h = b.count === 0 ? 8 : Math.max(12, Math.round((b.count / max) * 100));
            return (
              <div className={cls} key={b.date} title={`${b.date} · ${b.count}`}>
                <i style={{ height: `${h}%` }} />
                <span>{b.label}</span>
              </div>
            );
          })}
        </div>
        <div className="cap">
          <span>STREAK <b>{streak} DAYS</b></span>
          <span>TOTAL <b>{total}</b></span>
        </div>
      </div>
    </>
  );
}

interface CalProps {
  month: { y: number; m: number };
  today: string;
  selected: string | null;
  /** 活跃事项到期标记：date → 是否有到期（含逾期）。 */
  dueDates: ReadonlySet<string>;
  onMonthChange: (month: { y: number; m: number }) => void;
  onSelect: (date: string | null) => void;
}

/** 左舷 CAL // 历法：月历网格（周一开头、翻月），青=有到期 / 红=有逾期 / 琥珀=今天。 */
function CalendarPanel({ month, today, selected, dueDates, onMonthChange, onSelect }: CalProps) {
  const cells = buildCalCells(month.y, month.m);
  const shift = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1);
    onMonthChange({ y: d.getFullYear(), m: d.getMonth() });
  };
  return (
    <>
      <div className="con-title" style={{ marginTop: 6 }}>CAL // 历法</div>
      <div className="cal">
        <div className="cal-head">
          <span className="month">{month.y}.{String(month.m + 1).padStart(2, '0')}</span>
          <div className="nav">
            <span onClick={() => shift(-1)}>‹</span>
            <span onClick={() => shift(1)}>›</span>
          </div>
        </div>
        <div className="cal-grid">
          {CAL_WEEKDAYS.map((w) => <div className="wd" key={w}>{w}</div>)}
          {cells.map((c) => {
            let mk: string | null = null;
            if (dueDates.has(c.date)) mk = c.date < today ? 'rd' : 'cy';
            if (c.date === today) mk = 'am';
            const cls = `d${c.dim ? ' dim' : ''}${c.date === today ? ' today' : ''}${selected === c.date ? ' sel' : ''}`;
            return (
              <div
                className={cls}
                key={c.date}
                onClick={() => {
                  if (selected === c.date) {
                    onSelect(null);
                    return;
                  }
                  if (c.dim) {
                    const d = new Date(`${c.date}T00:00:00`);
                    onMonthChange({ y: d.getFullYear(), m: d.getMonth() });
                  }
                  onSelect(c.date);
                }}
              >
                {c.day}
                {mk && <span className={`mk ${mk}`} />}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

interface TimelineEvt { id: string; at: string; title: string; done: boolean }

/** 右舷 TELEMETRY：今日带时间的事项竖向时间轴 + NOW 当前时间标记。 */
function TelemetryPanel({ events, now }: { events: TimelineEvt[]; now: Date }) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowText = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // 第一条未完成的未来事项高亮琥珀（即将到来）；已过时间未完成标红
  const warnId = events.find((e) => !e.done && Number(e.at.slice(0, 2)) * 60 + Number(e.at.slice(3)) >= nowMin)?.id;
  const nodes: React.ReactNode[] = [];
  let nowInserted = false;
  for (const e of events) {
    const evtMin = Number(e.at.slice(0, 2)) * 60 + Number(e.at.slice(3));
    if (!nowInserted && evtMin >= nowMin) {
      nodes.push(<div className="tl-now" key="__now">NOW {nowText}</div>);
      nowInserted = true;
    }
    const cls = `tl-evt${e.done ? ' done' : e.id === warnId ? ' warn' : evtMin < nowMin ? ' miss' : ''}`;
    nodes.push(
      <div className={cls} key={e.id}>
        <span className="t">{e.at}</span>
        <span className="txt">{e.title}</span>
      </div>,
    );
  }
  if (!nowInserted) nodes.push(<div className="tl-now" key="__now">NOW {nowText}</div>);
  return (
    <>
      <div className="con-title">TELEMETRY</div>
      <div className="tl">
        <div className="tl-track" />
        {events.length === 0 && <div className="con-empty" style={{ paddingLeft: 18, paddingBottom: 14 }}>// NO TIMED ENTRIES</div>}
        {nodes}
      </div>
    </>
  );
}

/** 右舷 TODAY OUTPUT：今日到期事项的完成/总数段条。 */
function TodayOutputPanel({ done, total }: { done: number; total: number }) {
  const segs = total === 0 ? 4 : Math.min(total, 12);
  const lit = total === 0 ? 0 : Math.round((done / total) * segs);
  return (
    <div>
      <div className="seg-cap"><span>TODAY OUTPUT</span><b>{done}/{total}</b></div>
      <div className="seg">
        {Array.from({ length: segs }, (_, i) => <i key={i} className={i < lit ? 'lit' : ''} />)}
      </div>
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
  // Stage 4：月历选中日期（YYYY-MM-DD，选中后中央列表切换为该日事项）
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  // Stage 4 动效：CLI 外部写入 → COM 灯闪（seq 递增触发重放）+ 新行滑入
  const [comSeq, setComSeq] = useState(0);
  const [incomingId, setIncomingId] = useState<string | null>(null);
  const incomingTimer = useRef<number | undefined>(undefined);
  // TELEMETRY NOW 标记走秒
  const [now, setNow] = useState(() => new Date());

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

  // CLI / 其他窗口写入时实时刷新（todo:changed → todo:update 广播）；
  // CLI 外部写入新事项时 COM 灯闪两下 + 新行滑入
  useEffect(() => {
    const unsubscribe = window.assistant.todo.onUpdate?.((payload: TodoUpdatePayload) => {
      if (payload?.origin === 'cli' && payload?.reason === 'create') {
        setComSeq((s) => s + 1);
        if (payload.id) {
          setIncomingId(payload.id);
          window.clearTimeout(incomingTimer.current);
          incomingTimer.current = window.setTimeout(() => setIncomingId(null), 1600);
        }
      }
      void load();
    });
    return () => {
      unsubscribe?.();
      window.clearTimeout(incomingTimer.current);
    };
  }, [load]);

  // NOW 标记每 30s 走一次
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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

  // 月历选中日期时，中央列表切换为该日到期事项（活跃）
  const dateItems = useMemo(
    () => (selectedDate ? sortGroup(data.all.filter((t) => dueDateStr(t.dueAt) === selectedDate)) : null),
    [data.all, selectedDate],
  );
  const items = dateItems ?? data[view];

  const groups = useMemo(() => {
    if (view === 'done' || dateItems) return null;
    const grouped: Record<GroupKey, Todo[]> = { overdue: [], today: [], tomorrow: [], later: [] };
    for (const t of items) grouped[groupOf(t, today)].push(t);
    for (const key of Object.keys(grouped) as GroupKey[]) grouped[key] = sortGroup(grouped[key]);
    return grouped;
  }, [items, view, today, dateItems]);

  // CAL 月历标记：活跃事项按到期日聚合
  const dueDates = useMemo(() => {
    const set = new Set<string>();
    for (const t of data.all) {
      const d = dueDateStr(t.dueAt);
      if (d) set.add(d);
    }
    return set;
  }, [data.all]);

  // TELEMETRY：今日带时间的事项（含已完成），按时刻排序
  const timeline = useMemo(() => {
    const evts: { id: string; at: string; title: string; done: boolean }[] = [];
    for (const t of [...data.all, ...data.done]) {
      if (dueDateStr(t.dueAt) !== today || !hasClock(t.dueAt)) continue;
      evts.push({ id: t.id, at: clockLabel(t.dueAt as string), title: t.title, done: t.status === 'done' });
    }
    evts.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return evts;
  }, [data.all, data.done, today]);

  // TODAY OUTPUT：今日到期事项的完成/总数
  const todayOutput = useMemo(() => {
    const total = data.all.filter((t) => dueDateStr(t.dueAt) === today).length
      + data.done.filter((t) => dueDateStr(t.dueAt) === today).length;
    const doneCnt = data.done.filter((t) => dueDateStr(t.dueAt) === today).length;
    return { done: doneCnt, total };
  }, [data.all, data.done, today]);

  const selectDate = (date: string | null) => {
    setSelectedDate(date);
    setExpandedId(null);
  };

  const renderRow = (todo: Todo) => (
    <TodoRow
      key={todo.id}
      todo={todo}
      lists={lists}
      today={today}
      expanded={expandedId === todo.id}
      completing={completingIds.has(todo.id)}
      incoming={incomingId === todo.id}
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
      <div className="console left">
        <SystemsPanel lists={lists} />
        <WeekPanel doneItems={data.done} today={today} />
        <CalendarPanel
          month={calMonth}
          today={today}
          selected={selectedDate}
          dueDates={dueDates}
          onMonthChange={setCalMonth}
          onSelect={selectDate}
        />
      </div>
      <div className="column">
        <div className="head">
          <h1>
            MISSION LOG
            <span className="zh">事项</span>
          </h1>
          <div className="leds">
            <span className="led on"><i />PWR</span>
            <span className="led nav"><i />NAV</span>
            <span className="led on"><i key={comSeq} className={comSeq > 0 ? 'com-pulse' : ''} />COM</span>
          </div>
          <div className="stardate">SD <b>{sdMain}</b> // {sdDate}</div>
        </div>

        <div className="views">
          {VIEW_DEFS.map((v) => (
            <div
              key={v.key}
              className={`view${!selectedDate && view === v.key ? ' active' : ''}`}
              onClick={() => {
                setSelectedDate(null);
                setView(v.key);
              }}
            >
              {v.label}
              <span className="n">{data[v.key].length}</span>
            </div>
          ))}
          {selectedDate && selectedDate !== today && (
            <div className="view date-chip active" onClick={() => selectDate(null)} title="清除日期筛选">
              CAL // {selectedDate.slice(5)}
              <X />
            </div>
          )}
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
            <div className="empty">
              {dateItems ? `// ${selectedDate?.slice(5)} NO ENTRIES` : '// NO ACTIVE MISSIONS — 录入第一条任务'}
            </div>
          )}
          {dateItems
            ? (
              <>
                {dateItems.length > 0 && (
                  <div className="group today">DATE // {selectedDate?.slice(5)} <span className="n">{dateItems.length}</span></div>
                )}
                {dateItems.map(renderRow)}
              </>
            )
            : view === 'done'
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
      <div className="console right">
        <TelemetryPanel events={timeline} now={now} />
        <TodayOutputPanel done={todayOutput.done} total={todayOutput.total} />
      </div>
    </div>
  );
}

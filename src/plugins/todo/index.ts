/**
 * todo 插件 —— 事项管理
 *
 * Stage 1：数据模型 + 数据层 api（todos / todo_lists 两表，CRUD + 视图过滤）。
 * Stage 2：CLI 命令（todo.add / todo.list / todo.done / todo.update），
 *          外部工具（含 Mika）的写入入口；变更经 bus `todo:changed`
 *          （origin=cli）广播，IPC 侧转发为 `todo:update` 推给面板。
 * Stage 5：到期巡查——core:ready 后启动 due-scanner（首扫 + 60s 周期 +
 *          todo:changed 即时核对），全量到期集经 bus `todo:due-scan` 广播，
 *          由 reminder 插件 reconcile 进提醒中心；deactivate 停止并广播空集清场。
 * 定位：面板内的「瞬态」事项工具——快速捕捉、今日一瞥、随手勾掉。
 */

import { bus } from '../../core/event-bus';
import { registerCommand } from '../../core/command-registry';
import type { PluginManifest } from '../../core/plugin-loader';
import { api, ensureTodoTables } from './api';
import { startDueScanner, stopDueScanner } from './due-scanner';
import type {
  CreateTodoInput,
  ListTodosOptions,
  TodoUpdatePayload,
  UpdateTodoInput,
} from '../../shared/types';

export const manifest: PluginManifest = {
  id: 'todo',
  name: '事项管理',
  version: '0.3.0',
  description: '面板内的瞬态事项工具：快速捕捉、今日一瞥、随手勾掉；到期自动进提醒中心',
};

/** CLI 侧变更统一经此发出，origin 固定 cli（面板据此区分外部写入）。 */
function emitChanged(payload: Omit<TodoUpdatePayload, 'origin'>): void {
  bus.emit('todo:changed', { ...payload, origin: 'cli' });
}

/** listId 归一：显式 listId 优先，兼容 issue 约定的 list 别名；空串按未传处理。 */
function pickListId(args: Record<string, unknown>): string | null | undefined {
  const raw = args.listId ?? args.list;
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const s = String(raw).trim();
  return s ? s : undefined;
}

/** core:ready 处理（具名以便 deactivate 解除订阅）。 */
function onCoreReady(): void {
  ensureTodoTables();
  // 到期巡查：首扫（延后一个 tick）+ 60s 周期 + todo:changed 即时核对
  startDueScanner();
  console.log('[todo] 事项表已就绪，到期巡查已启动');
}

export function activate(): void {
  console.log('[todo] 插件已激活');

  bus.on('core:ready', onCoreReady);

  // todo.add —— 新建事项（外部工具写入入口）
  registerCommand({
    command: 'todo.add',
    description: '新建一条事项（外部工具写入入口，面板实时收到 todo:update 推送）',
    params: [
      { name: 'title', type: 'string', required: true, description: '事项标题' },
      { name: 'note', type: 'string', required: false, description: '备注' },
      { name: 'priority', type: 'number', required: false, description: '优先级：0 无 / 1 低 / 2 中 / 3 高，默认 0' },
      { name: 'dueAt', type: 'string', required: false, description: '截止时间（ISO 日期或日期时间，如 2026-09-18）' },
      { name: 'list', type: 'string', required: false, description: '所属清单 id（也可用 listId），缺省进收集箱' },
      { name: 'tags', type: 'object', required: false, description: '标签数组，如 ["工作","杂事"]' },
    ],
    example: { title: '写周报', priority: 2, dueAt: '2026-09-18', tags: ['工作'] },
    handler: (args) => {
      const input: CreateTodoInput = {
        title: String(args.title ?? ''),
        note: args.note === undefined || args.note === null ? undefined : String(args.note),
        priority: args.priority === undefined || args.priority === null ? undefined : Number(args.priority),
        dueAt: args.dueAt === undefined ? undefined : (args.dueAt === null ? null : String(args.dueAt)),
        listId: pickListId(args),
        tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined,
      };
      const todo = api.create(input);
      emitChanged({ reason: 'create', id: todo.id });
      return todo;
    },
  });

  // todo.list —— 列出事项
  registerCommand({
    command: 'todo.list',
    description: '列出事项（默认 all 视图、排除已完成；today 含逾期）',
    params: [
      { name: 'view', type: 'string', required: false, description: 'today | inbox | all | done，默认 all' },
      { name: 'date', type: 'string', required: false, description: '指定日 YYYY-MM-DD；today 视图作基准日，其余视图按当日精确匹配' },
      { name: 'listId', type: 'string', required: false, description: '按清单过滤' },
      { name: 'includeDone', type: 'boolean', required: false, description: '为 true 时包含 done/cancelled（done 视图除外）' },
    ],
    example: { view: 'today' },
    handler: (args) => {
      const options: ListTodosOptions = {};
      if (typeof args.view === 'string') options.view = args.view as ListTodosOptions['view'];
      if (typeof args.date === 'string') options.date = args.date;
      if (typeof args.listId === 'string') options.listId = args.listId;
      if (typeof args.includeDone === 'boolean') options.includeDone = args.includeDone;
      return api.list(options);
    },
  });

  // todo.done —— 勾掉一条事项
  registerCommand({
    command: 'todo.done',
    description: '把一条事项标记为完成（写入 completedAt；仅 todo/doing 状态可完成）',
    params: [{ name: 'id', type: 'string', required: true, description: '事项 id，形如 todo_xxx' }],
    example: { id: 'todo_xxxxxxxx' },
    handler: (args) => {
      const todo = api.done(String(args.id));
      emitChanged({ reason: 'done', id: todo.id });
      return todo;
    },
  });

  // todo.update —— 更新任意字段（含清空语义：note/dueAt/list 传 null）
  registerCommand({
    command: 'todo.update',
    description: '更新一条事项的任意字段；note/dueAt/list 传 null 表示清空（list=null 移回收集箱）',
    params: [
      { name: 'id', type: 'string', required: true, description: '事项 id' },
      { name: 'title', type: 'string', required: false, description: '标题' },
      { name: 'note', type: 'string', required: false, description: '备注；传 null 清空' },
      { name: 'status', type: 'string', required: false, description: 'todo | doing | done | cancelled' },
      { name: 'priority', type: 'number', required: false, description: '优先级：0 无 / 1 低 / 2 中 / 3 高' },
      { name: 'dueAt', type: 'string', required: false, description: '截止时间（ISO）；传 null 清空' },
      { name: 'list', type: 'string', required: false, description: '所属清单 id（也可用 listId）；传 null 移回收集箱' },
      { name: 'tags', type: 'object', required: false, description: '标签数组（整体替换）' },
      { name: 'subtasks', type: 'object', required: false, description: '子任务数组 [{id?,title,done}]（整体替换）' },
    ],
    example: { id: 'todo_xxxxxxxx', priority: 3, dueAt: '2026-09-20' },
    handler: (args) => {
      const id = String(args.id);
      const patch: UpdateTodoInput = {};
      if (args.title !== undefined) patch.title = String(args.title);
      if (args.note !== undefined) patch.note = args.note === null ? null : String(args.note);
      if (args.status !== undefined) patch.status = args.status as UpdateTodoInput['status'];
      if (args.priority !== undefined) patch.priority = Number(args.priority);
      if (args.dueAt !== undefined) patch.dueAt = args.dueAt === null ? null : String(args.dueAt);
      const listId = pickListId(args);
      if (listId !== undefined) patch.listId = listId;
      if (args.tags !== undefined) patch.tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];
      if (args.subtasks !== undefined) patch.subtasks = Array.isArray(args.subtasks) ? (args.subtasks as UpdateTodoInput['subtasks']) : [];
      const todo = api.update(id, patch);
      emitChanged({ reason: 'update', id: todo.id });
      return todo;
    },
  });

  bus.emit('todo:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[todo] 插件已停用');
  stopDueScanner();
  bus.off('core:ready', onCoreReady);
  // 清场：广播空到期集，让 reminder 关掉所有 todo 来源的活跃提醒
  bus.emit('todo:due-scan', { scannedAt: new Date().toISOString(), items: [] });
  bus.emit('todo:deactivated');
}

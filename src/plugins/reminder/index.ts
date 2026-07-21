/**
 * reminder 插件 —— 提醒框架
 *
 * 阶段 1：数据模型 + notify + 面板列表。
 * 阶段 2：source+key 去重 + 两色悬浮球光点 + 实时事件通道。
 * 阶段 3：reminder.ask 阻塞式确认 + reminder.respond。
 * 阶段 4：Agent 专属模式（agent.update / agent.wait / agent.query / agent.close）。
 */

import { bus } from '../../core/event-bus';
import { registerCommand } from '../../core/command-registry';
import type { PluginManifest } from '../../core/plugin-loader';
import { api, ensureRemindersTable } from './api';
import { fulfillWaiter, registerWaiter } from './waiters';
import type {
  AskReminderInput,
  AskReminderResult,
  CreateReminderInput,
  ListRemindersOptions,
  ReminderAction,
  RespondReminderInput,
} from '../../shared/types';

const DEFAULT_ASK_TIMEOUT_SEC = 300;
const MAX_ASK_TIMEOUT_SEC = 3600;

export const manifest: PluginManifest = {
  id: 'reminder',
  name: 'Reminder 提醒框架',
  version: '0.4.0',
  description: '外部工具通过 CLI 推送提醒 / 阻塞式确认，支持 Agent 专属模式',
};

export function activate(): void {
  console.log('[reminder] 插件已激活');

  bus.on('core:ready', () => {
    ensureRemindersTable();
    console.log('[reminder] 提醒表已就绪');
  });

  // reminder.notify —— 单向推送
  registerCommand({
    command: 'reminder.notify',
    description: '推送一条提醒到 UUUtil 提醒中心（单向，即发即退）',
    params: [
      { name: 'source', type: 'string', required: true, description: '发起方，如 codex / claude / vibecoding' },
      { name: 'title', type: 'string', required: true, description: '标题' },
      { name: 'type', type: 'string', required: false, description: 'info | action，默认 info' },
      { name: 'severity', type: 'string', required: false, description: 'info | warning | error，默认 info' },
      { name: 'body', type: 'string', required: false, description: '正文/详情' },
      { name: 'key', type: 'string', required: false, description: '同 source 内的去重键' },
      { name: 'metadata', type: 'object', required: false, description: '任意扩展 JSON' },
    ],
    example: {
      source: 'codex',
      type: 'info',
      title: '构建完成',
      body: 'main 分支构建成功，耗时 42s',
    },
    handler: (args) => {
      const result = api.create(args as unknown as CreateReminderInput);
      bus.emit('reminder:changed', {
        reason: 'notify',
        type: result.reminder.type,
        deduped: result.deduped,
      });
      return result;
    },
  });

  // reminder.ask —— 阻塞式确认
  registerCommand({
    command: 'reminder.ask',
    timeoutMs: (MAX_ASK_TIMEOUT_SEC + 30) * 1000,
    description: '推送一条待响应提醒并阻塞等待用户在面板上选择按钮；超时非 0 退出',
    params: [
      { name: 'source', type: 'string', required: true, description: '发起方，如 codex / claude' },
      { name: 'title', type: 'string', required: true, description: '标题' },
      { name: 'actions', type: 'object', required: true, description: '按钮数组：[{id,label,style?,requiresReason?}]' },
      { name: 'severity', type: 'string', required: false, description: 'info | warning | error，默认 info' },
      { name: 'body', type: 'string', required: false, description: '正文/详情' },
      { name: 'key', type: 'string', required: false, description: '同 source 内的去重键（命中会覆盖上一位等待者）' },
      { name: 'metadata', type: 'object', required: false, description: '任意扩展 JSON' },
      { name: 'timeoutSec', type: 'number', required: false, description: `等待秒数，默认 ${DEFAULT_ASK_TIMEOUT_SEC}，上限 ${MAX_ASK_TIMEOUT_SEC}` },
    ],
    example: {
      source: 'claude',
      title: '确认删除 /tmp/old-cache？',
      severity: 'warning',
      actions: [
        { id: 'approve', label: '允许', style: 'primary' },
        { id: 'deny', label: '拒绝', style: 'danger', requiresReason: true },
      ],
    },
    handler: async (args): Promise<AskReminderResult> => {
      const input = args as unknown as AskReminderInput;
      const timeoutSec = clampTimeout(input.timeoutSec);
      const { reminder, deduped, supersededId } = api.createAsk({
        ...input,
        actions: input.actions as ReminderAction[],
      });

      if (deduped && supersededId) {
        // 通知等待中的旧 CLI：这个位置已被新的 ask 顶替
        fulfillWaiter(supersededId, { kind: 'superseded' });
      }

      bus.emit('reminder:changed', {
        reason: 'ask',
        type: 'action',
        deduped,
      });

      const outcome = await registerWaiter(reminder.id, timeoutSec * 1000, () => {
        // 超时：把这条卡片翻成 dismissed，避免面板一直挂着一个死按钮
        try {
          const current = api.get(reminder.id);
          if (current && current.status === 'active') {
            api.dismiss(reminder.id);
            bus.emit('reminder:changed', { reason: 'dismiss', type: 'action', deduped: false });
          }
        } catch (err) {
          console.error('[reminder] ask 超时清理失败:', err);
        }
      });

      if (outcome.kind === 'responded') {
        return {
          status: 'responded',
          reminderId: reminder.id,
          actionId: outcome.response.actionId,
          reason: outcome.response.reason ?? null,
          respondedAt: outcome.response.respondedAt,
        };
      }
      if (outcome.kind === 'superseded') {
        return { status: 'superseded', reminderId: reminder.id };
      }
      if (outcome.kind === 'dismissed') {
        return { status: 'dismissed', reminderId: reminder.id };
      }
      return { status: 'timeout', reminderId: reminder.id };
    },
  });

  // reminder.respond —— 供脚本/测试直接落响应
  registerCommand({
    command: 'reminder.respond',
    description: '为一条 active 的 ask 提交响应（面板也走同一底层 API）',
    params: [
      { name: 'id', type: 'string', required: true, description: 'reminder id' },
      { name: 'actionId', type: 'string', required: true, description: 'actions 中定义的按钮 id' },
      { name: 'reason', type: 'string', required: false, description: '理由；若按钮 requiresReason=true 则必填' },
    ],
    example: { id: 'rem_xxxx', actionId: 'approve' },
    handler: (args) => {
      const reminder = api.respond(args as unknown as RespondReminderInput);
      // 用户 CLI 走的这条，同样要唤醒挂着的 ask
      if (reminder.response) {
        fulfillWaiter(reminder.id, { kind: 'responded', response: reminder.response });
      }
      bus.emit('reminder:changed', {
        reason: 'respond',
        type: reminder.type,
        deduped: false,
      });
      return reminder;
    },
  });

  // reminder.dismiss —— 主动忽略一条 active 提醒
  registerCommand({
    command: 'reminder.dismiss',
    description: '忽略一条 active 提醒；若该条正在被 ask 阻塞等待，等待端会以 dismissed 状态退出',
    params: [{ name: 'id', type: 'string', required: true, description: 'reminder id' }],
    example: { id: 'rem_xxxx' },
    handler: (args) => {
      const reminder = api.dismiss(String(args.id));
      fulfillWaiter(reminder.id, { kind: 'dismissed' });
      bus.emit('reminder:changed', {
        reason: 'dismiss',
        type: reminder.type,
        deduped: false,
      });
      return reminder;
    },
  });

  // reminder.list —— 列出提醒
  registerCommand({
    command: 'reminder.list',
    description: '列出提醒（默认 status=active，limit=20）',
    params: [
      { name: 'status', type: 'string', required: false, description: 'active | done | dismissed，默认 active' },
      { name: 'limit', type: 'number', required: false, description: '返回条数上限，默认 20，最大 200' },
    ],
    example: { status: 'active', limit: 20 },
    handler: (args) => {
      const options: ListRemindersOptions = {};
      if (typeof args.status === 'string') options.status = args.status as ListRemindersOptions['status'];
      if (args.limit !== undefined && args.limit !== null) {
        const n = Number(args.limit);
        if (Number.isFinite(n)) options.limit = Math.trunc(n);
      }
      return api.list(options);
    },
  });

  // reminder.get —— 按 id 取详情
  registerCommand({
    command: 'reminder.get',
    description: '按 id 取一条提醒详情',
    params: [{ name: 'id', type: 'string', required: true, description: 'reminder id，形如 rem_xxx' }],
    example: { id: 'rem_xxxxxxxx' },
    handler: (args) => {
      const item = api.get(String(args.id));
      if (!item) throw new Error(`提醒不存在：${args.id}`);
      return item;
    },
  });

  // ===== Agent 专属模式命令 =====

  // agent.update —— 推送/更新 Agent 提醒（同 topic 自动合并，历史记入 history 数组）
  registerCommand({
    command: 'agent.update',
    description: '推送或更新一条 Agent 专属提醒；同 topic 自动合并，旧版本记入 history 数组',
    params: [
      { name: 'agentId', type: 'string', required: true, description: 'Agent 标识，如 codex / claude' },
      { name: 'topic', type: 'string', required: true, description: '主题唯一键（同 topic 自动合并）' },
      { name: 'stage', type: 'string', required: true, description: 'propose | progress | done | blocked | info | stale' },
      { name: 'priority', type: 'string', required: false, description: 'normal | high，默认 normal' },
      { name: 'project', type: 'string', required: false, description: '项目分组标识' },
      { name: 'title', type: 'string', required: true, description: '标题' },
      { name: 'body', type: 'string', required: true, description: '完整内容（Markdown 格式）' },
      { name: 'actions', type: 'object', required: false, description: '按钮数组：[{id,label,style?,requiresReason?}]' },
      { name: 'metadata', type: 'object', required: false, description: '任意扩展 JSON' },
    ],
    example: {
      agentId: 'codex',
      topic: 'task:refactor-20260721',
      stage: 'progress',
      priority: 'normal',
      project: 'UUUtil',
      title: '重构提醒框架 UI',
      body: '## 进度\n- ✅ 数据模型扩展\n- 🔄 UI 渲染中',
      actions: [{ id: 'approve', label: '批准', style: 'primary' }],
    },
    handler: (args) => {
      const reminder = api.agentUpdate(args);
      bus.emit('reminder:changed', {
        reason: 'notify',
        type: reminder.type,
        deduped: false,
      });
      return reminder;
    },
  });

  // agent.wait —— 等待用户响应（阻塞）
  registerCommand({
    command: 'agent.wait',
    timeoutMs: (MAX_ASK_TIMEOUT_SEC + 30) * 1000,
    description: '阻塞等待某 topic 的 Agent 提醒被用户响应',
    params: [
      { name: 'topic', type: 'string', required: true, description: '主题唯一键' },
      { name: 'timeoutSec', type: 'number', required: false, description: `等待秒数，默认 ${DEFAULT_ASK_TIMEOUT_SEC}，上限 ${MAX_ASK_TIMEOUT_SEC}` },
    ],
    example: { topic: 'task:refactor-20260721', timeoutSec: 300 },
    handler: async (args) => {
      const topic = String(args.topic);
      const timeoutSec = clampTimeout(args.timeoutSec);

      // 先检查是否已有响应
      const existing = api.agentQuery(topic);
      if (existing && existing.response) {
        return existing;
      }

      // 没有响应，注册 waiter
      return new Promise((resolve) => {
        api._setAgentWaiter(topic, resolve, timeoutSec * 1000);
      });
    },
  });

  // agent.query —— 查询某 topic 的当前状态
  registerCommand({
    command: 'agent.query',
    description: '查询某 topic 的 Agent 提醒当前状态',
    params: [{ name: 'topic', type: 'string', required: true, description: '主题唯一键' }],
    example: { topic: 'task:refactor-20260721' },
    handler: (args) => {
      const item = api.agentQuery(String(args.topic));
      if (!item) throw new Error(`topic 不存在：${args.topic}`);
      return item;
    },
  });

  // agent.close —— 关闭某 topic 的提醒（标记为 done/stale）
  registerCommand({
    command: 'agent.close',
    description: '关闭某 topic 的 Agent 提醒，标记为 done/stale',
    params: [
      { name: 'topic', type: 'string', required: true, description: '主题唯一键' },
      { name: 'result', type: 'string', required: true, description: 'done | cancelled | superseded' },
    ],
    example: { topic: 'task:refactor-20260721', result: 'done' },
    handler: (args) => {
      const result = args.result as 'done' | 'cancelled' | 'superseded';
      const reminder = api.agentClose(String(args.topic), result);
      bus.emit('reminder:changed', {
        reason: 'dismiss',
        type: reminder.type,
        deduped: false,
      });
      return reminder;
    },
  });

  bus.emit('reminder:activated', { version: manifest.version });
}

function clampTimeout(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ASK_TIMEOUT_SEC;
  return Math.min(Math.max(Math.floor(n), 1), MAX_ASK_TIMEOUT_SEC);
}

export function deactivate(): void {
  console.log('[reminder] 插件已停用');
  bus.emit('reminder:deactivated');
}

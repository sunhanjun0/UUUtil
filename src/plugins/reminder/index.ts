/**
 * reminder 插件 —— 提醒框架（阶段 1：数据模型 + notify + 面板列表）
 *
 * 阶段 1 只做数据落库、CLI 推送、面板可见。悬浮球光点/去重/回调都在后续阶段。
 */

import { bus } from '../../core/event-bus';
import { registerCommand } from '../../core/command-registry';
import type { PluginManifest } from '../../core/plugin-loader';
import { api, ensureRemindersTable } from './api';
import type { CreateReminderInput, ListRemindersOptions } from '../../shared/types';

export const manifest: PluginManifest = {
  id: 'reminder',
  name: 'Reminder 提醒框架',
  version: '0.1.0',
  description: '外部工具通过 CLI 推送提醒，落库并在提醒中心展示（阶段 1）',
};

export function activate(): void {
  console.log('[reminder] 插件已激活');

  bus.on('core:ready', () => {
    ensureRemindersTable();
    console.log('[reminder] 提醒表已就绪');
  });

  // reminder.notify —— 推一条提醒（阶段 1 的核心命令）
  registerCommand({
    command: 'reminder.notify',
    description: '推送一条提醒到 UUUtil 提醒中心（阶段 1：落库 + 面板列表，不含悬浮球提示）',
    params: [
      { name: 'source', type: 'string', required: true, description: '发起方，如 codex / claude / vibecoding' },
      { name: 'title', type: 'string', required: true, description: '标题，面板列表主要展示字段' },
      { name: 'type', type: 'string', required: false, description: 'info | action，默认 info（action 类未来会触发暖橙光点）' },
      { name: 'severity', type: 'string', required: false, description: 'info | warning | error，默认 info' },
      { name: 'body', type: 'string', required: false, description: '正文/详情' },
      { name: 'key', type: 'string', required: false, description: '同 source 内的去重键（阶段 2 才启用）' },
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

  bus.emit('reminder:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[reminder] 插件已停用');
  bus.emit('reminder:deactivated');
}

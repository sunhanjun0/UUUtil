/**
 * focus 插件 —— 注意力观察系统（FIE 客户端）
 *
 * 焦点数据由 FIE (Focus Ingestion Engine) 通过事件摄取自动归因产生。
 * 本插件不持有数据库，只做只读展示（经 IPC）与事件摄取代理（经 bus / IPC / CLI）。
 */

import { bus } from '../../core/event-bus';
import { registerCommand } from '../../core/command-registry';
import type { PluginManifest } from '../../core/plugin-loader';
import { api } from './api';
import type { AttentionEvent, FieResult } from '../../shared/types';

export const manifest: PluginManifest = {
  id: 'focus',
  name: 'Focus 注意力观察',
  version: '0.3.0',
  description: '基于 FIE 事件摄取观察注意力分布、归因决策与活跃趋势',
};

/** 把 FieResult 拆成命令结果：失败即抛错（离线时标注），交由注册表统一转 handler_error。 */
function unwrap<T>(result: FieResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(result.offline ? `FIE 服务不可达：${result.error}` : result.error);
}

function toInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function toBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function activate(): void {
  console.log('[focus] 插件已激活（FIE 客户端）');

  // 唯一的写路径：把注意力事件转发给 FIE 摄取。
  bus.on('focus:ingest', (event: AttentionEvent) => {
    api.ingest(event).then((result) => bus.emit('focus:ingested', result));
  });

  // focus.ingest —— 上报注意力事件（写路径）。
  registerCommand({
    command: 'focus.ingest',
    description: '上报一条注意力事件，由 FIE 归因（skip / check_in / create_and_check_in）',
    params: [
      { name: 'source', type: 'string', required: true, description: '事件来源，如 codex / git-hook' },
      { name: 'sourceEventId', type: 'string', required: true, description: '来源内唯一事件 ID，与 source 组成幂等键' },
      { name: 'occurredAt', type: 'string', required: true, description: 'ISO 8601 带时区，如 2026-07-15T09:00:00+08:00' },
      { name: 'type', type: 'string', required: true, description: '事件类型，形如 domain.action' },
      { name: 'project', type: 'string', required: false, description: '项目名，命中候选 Focus 时贡献权重' },
      { name: 'summary', type: 'string', required: false, description: '一句话摘要，参与关键词提取' },
      { name: 'content', type: 'string', required: false, description: '原始正文，按隐私模式决定是否保留' },
      { name: 'metadata', type: 'object', required: false, description: '任意键值；其中 files（字符串数组）用于文件维度跨工具匹配' },
    ],
    example: {
      source: 'codex',
      sourceEventId: 'demo-001',
      occurredAt: '2026-07-15T09:00:00+08:00',
      type: 'conversation.finished',
      project: 'UUUtil',
      summary: '完成 CLI 最小闭环',
    },
    handler: async (args) => unwrap(await api.ingest(args as unknown as AttentionEvent)),
  });

  // focus.list —— 列出当前焦点（读路径）。
  registerCommand({
    command: 'focus.list',
    description: '列出当前焦点对象（按最近活跃排序，含关键词、项目、状态）',
    params: [
      { name: 'limit', type: 'number', required: false, description: '返回条数上限' },
      { name: 'includeArchived', type: 'boolean', required: false, description: '是否包含已归档焦点，默认 false' },
    ],
    example: { limit: 20 },
    handler: async (args) =>
      unwrap(await api.listFocuses({ limit: toInt(args.limit), includeArchived: toBool(args.includeArchived) })),
  });

  // focus.runs —— 列出最近的归因 run（读路径）。
  registerCommand({
    command: 'focus.runs',
    description: '列出最近的归因 run（每次事件摄取的决策记录）',
    params: [{ name: 'limit', type: 'number', required: false, description: '返回条数上限' }],
    example: { limit: 20 },
    handler: async (args) => unwrap(await api.listRuns(toInt(args.limit))),
  });

  // focus.run —— 查看单次归因 run 详情（读路径）。
  registerCommand({
    command: 'focus.run',
    description: '查看单次归因 run 详情（候选、脱敏事件、生成的 check-in）',
    params: [{ name: 'id', type: 'string', required: true, description: 'run id，如 run_xxx' }],
    example: { id: 'run_xxxxxxxx' },
    handler: async (args) => unwrap(await api.getRun(String(args.id))),
  });

  // focus.trend —— 活跃度趋势（读路径）。
  registerCommand({
    command: 'focus.trend',
    description: '按天聚合的活跃度趋势（check-in 数与活跃焦点数）',
    params: [
      { name: 'days', type: 'number', required: false, description: '统计天数，默认由 FIE 决定（约 30 天）' },
      { name: 'focusId', type: 'string', required: false, description: '仅统计某个焦点的趋势' },
    ],
    example: { days: 30 },
    handler: async (args) =>
      unwrap(await api.getTrend({ days: toInt(args.days), focusId: args.focusId ? String(args.focusId) : undefined })),
  });

  // focus.health —— FIE 服务探活（读路径）。
  registerCommand({
    command: 'focus.health',
    description: '检查 FIE 服务是否可达',
    example: {},
    handler: async () => unwrap(await api.health()),
  });

  bus.emit('focus:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[focus] 插件已停用');
  bus.emit('focus:deactivated');
}

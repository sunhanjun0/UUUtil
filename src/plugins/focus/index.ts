/**
 * focus 插件 —— 注意力观察系统（FIE 客户端）
 *
 * 焦点数据由 FIE (Focus Ingestion Engine) 通过事件摄取自动归因产生。
 * 本插件不持有数据库，只做只读展示（经 IPC）与事件摄取代理（经 bus / IPC）。
 */

import { bus } from '../../core/event-bus';
import { registerCommand } from '../../core/command-registry';
import type { PluginManifest } from '../../core/plugin-loader';
import { api } from './api';
import type { AttentionEvent } from '../../shared/types';

export const manifest: PluginManifest = {
  id: 'focus',
  name: 'Focus 注意力观察',
  version: '0.3.0',
  description: '基于 FIE 事件摄取观察注意力分布、归因决策与活跃趋势',
};

export function activate(): void {
  console.log('[focus] 插件已激活（FIE 客户端）');

  // 唯一的写路径：把注意力事件转发给 FIE 摄取。
  bus.on('focus:ingest', (event: AttentionEvent) => {
    api.ingest(event).then((result) => bus.emit('focus:ingested', result));
  });

  // 声明式注册 CLI 命令：外部工具（agent skill / 脚本）上报注意力事件给 FIE 摄取。
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
    ],
    example: {
      source: 'codex',
      sourceEventId: 'demo-001',
      occurredAt: '2026-07-15T09:00:00+08:00',
      type: 'conversation.finished',
      project: 'UUUtil',
      summary: '完成 CLI 最小闭环',
    },
    handler: async (args) => {
      const result = await api.ingest(args as unknown as AttentionEvent);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  });

  bus.emit('focus:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[focus] 插件已停用');
  bus.emit('focus:deactivated');
}

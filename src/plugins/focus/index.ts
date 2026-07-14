/**
 * focus 插件 —— 注意力观察系统（FIE 客户端）
 *
 * 焦点数据由 FIE (Focus Ingestion Engine) 通过事件摄取自动归因产生。
 * 本插件不持有数据库，只做只读展示（经 IPC）与事件摄取代理（经 bus / IPC）。
 */

import { bus } from '../../core/event-bus';
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

  bus.emit('focus:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[focus] 插件已停用');
  bus.emit('focus:deactivated');
}

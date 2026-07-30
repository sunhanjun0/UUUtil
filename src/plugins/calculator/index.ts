/**
 * calculator 插件
 */

import { bus } from '../../core/event-bus';
import { recordEvent } from '../../core/db';
import type { PluginManifest } from '../../core/plugin-loader';
import { api } from './api';

export const manifest: PluginManifest = {
  id: 'calculator',
  name: 'Calculator',
  version: '0.1.0',
  description: '简单计算器插件',
};

export function activate(): void {
  console.log('[calculator] 插件已激活');

  bus.on('core:ready', () => {
    console.log('[calculator] 核心已就绪');
  });

  bus.on('calculator:calculate', (expression: string) => {
    const result = api.calculate(expression);
    bus.emit('calculator:result', { expression, result });

    // 事件日志统一入口：行数上限 / 时间窗口清理由 core/db 负责
    recordEvent('calculator:calculate', { expression, result });
  });

  bus.emit('calculator:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[calculator] 插件已停用');
  bus.emit('calculator:deactivated');
}

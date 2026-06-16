/**
 * dev-utils 插件
 */

import { bus } from '../../core/event-bus';
import { getDatabase, autoSave } from '../../core/db';
import type { PluginManifest } from '../../core/plugin-loader';
import { api } from './api';

export const manifest: PluginManifest = {
  id: 'dev-utils',
  name: 'Dev Utils',
  version: '0.1.0',
  description: '开发工具集：JSON、Base64、时间戳、正则、UUID',
};

export function activate(): void {
  console.log('[dev-utils] 插件已激活');

  bus.on('core:ready', () => {
    console.log('[dev-utils] 核心已就绪');
  });

  bus.on('dev-utils:invoke', (action: string, ...args: any[]) => {
    const handler = (api as any)[action];
    if (typeof handler !== 'function') return;
    const result = handler(...args);

    try {
      const db = getDatabase();
      db.run(
        `INSERT INTO _events_log (event, payload) VALUES (?, ?)`,
        ['dev-utils:invoke', JSON.stringify({ action, result })]
      );
      autoSave();
    } catch (err) {
      // 忽略
    }

    bus.emit('dev-utils:result', { action, result });
  });

  bus.emit('dev-utils:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[dev-utils] 插件已停用');
  bus.emit('dev-utils:deactivated');
}

/**
 * hello-world 插件 —— 验证插件机制的示例插件。
 *
 * 注意：示例插件默认禁用（见 core/plugin-loader 的 EXAMPLE_PLUGIN_IDS），
 * 生产启动不会加载它；需要时执行 `uuutil call plugin.enable --json '{"id":"hello-world"}'`
 * 后重启即可启用。复制本目录开发新插件时，把新插件 id 从示例名单里排除即可正常加载。
 */

import { bus } from '../../core/event-bus';
import { recordEvent } from '../../core/db';
import { registerCommand } from '../../core/command-registry';
import type { PluginManifest } from '../../core/plugin-loader';
import { api } from './api';

export const manifest: PluginManifest = {
  id: 'hello-world',
  name: 'Hello World',
  version: '0.1.0',
  description: '验证插件机制的示例插件',
};

export function activate(): void {
  console.log('[hello-world] 插件已激活');

  bus.on('core:ready', () => {
    console.log('[hello-world] 核心已就绪，执行初始化');
    initialize();
  });

  bus.on('hello-world:greet', (name: string) => {
    const greeting = api.greet(name);
    bus.emit('hello-world:greeted', { name, greeting });

    // 事件日志统一入口：行数上限 / 时间窗口清理由 core/db 负责
    recordEvent('hello-world:greet', { name, greeting });
  });

  // 声明式注册 CLI 命令：外部工具可通过 `uuutil call hello-world.greet` 调用。
  registerCommand({
    command: 'hello-world.greet',
    description: '返回一句问候，用于验证 CLI 全链路',
    params: [{ name: 'name', type: 'string', required: true, description: '被问候者的名字' }],
    example: { name: '世界' },
    handler: (args) => ({ greeting: api.greet(String(args.name ?? '')) }),
  });

  bus.emit('hello-world:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[hello-world] 插件已停用');
  bus.emit('hello-world:deactivated');
}

function initialize(): void {
  console.log('[hello-world] 初始化完成，等待指令');
}

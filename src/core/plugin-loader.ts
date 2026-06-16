/**
 * 插件加载器 —— 扫描插件目录，加载所有插件
 */

import path from 'path';
import fs from 'fs';
import { bus } from './event-bus';
import { getDatabase, autoSave } from './db';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
}

export interface Plugin {
  manifest: PluginManifest;
  activate?: () => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

interface PluginModule {
  default?: {
    manifest?: PluginManifest;
    activate?: () => void | Promise<void>;
    deactivate?: () => void | Promise<void>;
  };
  manifest?: PluginManifest;
  activate?: () => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

const loadedPlugins = new Map<string, Plugin>();

export function getPluginsDir(): string {
  return path.join(__dirname, '..', 'plugins');
}

export async function loadAllPlugins(): Promise<Plugin[]> {
  const pluginsDir = getPluginsDir();
  const plugins: Plugin[] = [];

  if (!fs.existsSync(pluginsDir)) {
    console.warn(`[PluginLoader] 插件目录不存在: ${pluginsDir}`);
    return plugins;
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  const pluginDirs = entries.filter((e) => e.isDirectory());

  for (const dir of pluginDirs) {
    const plugin = await loadPlugin(dir.name, pluginsDir);
    if (plugin) plugins.push(plugin);
  }

  bus.emit('core:plugins-loaded', plugins);
  console.log(`[PluginLoader] 已加载 ${plugins.length} 个插件`);
  return plugins;
}

async function loadPlugin(pluginId: string, baseDir: string): Promise<Plugin | null> {
  const pluginDir = path.join(baseDir, pluginId);
  const indexPath = path.join(pluginDir, 'index.js'); // 编译后是 .js

  if (!fs.existsSync(indexPath)) {
    console.warn(`[PluginLoader] 插件 "${pluginId}" 缺少编译产物 index.js`);
    return null;
  }

  try {
    const module = require(indexPath) as PluginModule;

    const manifest = module.manifest || module.default?.manifest || {
      id: pluginId,
      name: pluginId,
      version: '0.1.0',
    };

    const plugin: Plugin = {
      manifest: { ...manifest, id: pluginId },
      activate: module.activate || module.default?.activate,
      deactivate: module.deactivate || module.default?.deactivate,
    };

    // 持久化到数据库
    try {
      const db = getDatabase();
      db.run(
        `INSERT OR REPLACE INTO _plugins (id, name, version, enabled, updated_at)
         VALUES (?, ?, ?, 1, datetime('now'))`,
        [plugin.manifest.id, plugin.manifest.name, plugin.manifest.version]
      );
      autoSave();
    } catch {
      // 数据库可能还没初始化，忽略
    }

    // 激活插件
    if (plugin.activate) {
      await plugin.activate();
      bus.emit('core:plugin-activated', plugin.manifest);
    }

    loadedPlugins.set(pluginId, plugin);
    console.log(`[PluginLoader] 插件已激活: ${plugin.manifest.name} (${plugin.manifest.id})`);
    return plugin;
  } catch (err) {
    console.error(`[PluginLoader] 加载插件 "${pluginId}" 失败:`, err);
    return null;
  }
}

export function listPlugins(): PluginManifest[] {
  return Array.from(loadedPlugins.values()).map((p) => p.manifest);
}

export function getPluginCount(): number {
  return loadedPlugins.size;
}

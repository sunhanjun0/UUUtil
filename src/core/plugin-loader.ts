/**
 * 插件加载器 —— 扫描插件目录，加载所有插件
 *
 * 插件开关以 `_plugins.enabled` 为唯一事实来源：
 * - 加载前先查表，仅加载 enabled=1 的插件；enabled=0 的目录整体跳过（不 require）
 * - 目录存在但表中无记录（首次启动 / 新增插件）：自动注册并默认启用
 * - 示例插件（EXAMPLE_PLUGIN_IDS，如 hello-world）是例外：默认禁用、需显式启用，
 *   生产启动不加载；仅在表中明确 enabled=1 时才 require/activate
 * - setPluginEnabled() 运行时改开关：禁用立即调用 deactivate() 并卸载，
 *   启用仅落库、下次启动生效（避免同会话内重复注册监听与命令）
 */

import path from 'path';
import fs from 'fs';
import { bus } from './event-bus';
import { getDatabase, autoSave, getMeta, setMeta } from './db';
import { registerCommand, unregisterByScope } from './command-registry';
import { info as logInfo, error as logError } from './logger';
import type { RegisteredPluginInfo, PluginStateResult } from '../shared/types';

/**
 * 示例插件名单：仅供演示插件机制，默认禁用、按需 opt-in。
 * 新增示例插件时把目录名加进来即可；复制模板开发的正式插件不在名单中，不受影响。
 */
export const EXAMPLE_PLUGIN_IDS: ReadonlySet<string> = new Set(['hello-world']);

/** 一次性迁移标记（_meta 表）：把旧版本中默认启用的示例插件改为禁用 */
const MIGRATION_EXAMPLE_PLUGINS_DISABLED = 'migration:example-plugins-default-disabled';

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

/**
 * 查询 `_plugins` 表中该插件是否被禁用。
 * 无记录（新插件 / 首次启动）或数据库不可用时返回 false —— 默认启用，不阻塞加载。
 */
function isPluginDisabled(pluginId: string): boolean {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT enabled FROM _plugins WHERE id = ?`);
    try {
      stmt.bind([pluginId]);
      if (!stmt.step()) return false;
      return stmt.get()[0] === 0;
    } finally {
      stmt.free();
    }
  } catch {
    // 数据库可能还没初始化，退化为「默认启用」
    return false;
  }
}

/**
 * 示例插件的 opt-in 判断：仅当表中明确 enabled=1 时才允许加载，其余一律拦截
 * （无记录 / enabled=0 都拦截）。非示例插件或数据库不可用时返回 false，
 * 交给常规的「默认启用」逻辑处理。
 */
function isExamplePluginBlocked(pluginId: string): boolean {
  if (!EXAMPLE_PLUGIN_IDS.has(pluginId)) return false;
  try {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT enabled FROM _plugins WHERE id = ?`);
    try {
      stmt.bind([pluginId]);
      if (!stmt.step()) return true; // 全新安装、从未被显式启用 → 拦截
      return stmt.get()[0] !== 1;
    } finally {
      stmt.free();
    }
  } catch {
    // 数据库不可用时 fail-closed：默认拦截示例插件，与其「默认禁用、需显式 opt-in」的设计意图一致
    return true;
  }
}

/**
 * 把被拦截的示例插件预注册进 `_plugins` 表（INSERT OR IGNORE，enabled=0）：
 * 这样 `plugin.list` 能看到它、`plugin.enable <id>` 能直接启用，而不必先手动插数据。
 * name/version 先用占位值，用户启用后下次启动 loadPlugin 的 upsert 会从 manifest 同步。
 */
function registerBlockedExample(pluginId: string): void {
  try {
    const db = getDatabase();
    db.run(
      `INSERT INTO _plugins (id, name, version, enabled, updated_at)
       VALUES (?, ?, '0.1.0', 0, datetime('now'))
       ON CONFLICT(id) DO NOTHING`,
      [pluginId, pluginId]
    );
    autoSave();
  } catch {
    // 数据库不可用时忽略，下次启动会补注册
  }
}

/**
 * 一次性迁移：旧版本把示例插件按普通插件注册为 enabled=1，现改为默认禁用。
 * 对存量库批量禁用一次，用 _meta 标记守卫；迁移后用户再手动 plugin.enable
 * 不会被重复覆盖（标记已写入，迁移不会再跑）。
 */
function migrateExamplePluginsOnce(): void {
  try {
    if (getMeta(MIGRATION_EXAMPLE_PLUGINS_DISABLED)) return;
    const db = getDatabase();
    for (const id of EXAMPLE_PLUGIN_IDS) {
      // 只禁用当前 enabled != 0 的，避免 _meta 标记丢失重跑时覆盖用户已 opt-in 的启用状态
      db.run(
        `UPDATE _plugins SET enabled = 0, updated_at = datetime('now') WHERE id = ? AND enabled != 0`,
        [id],
      );
    }
    setMeta(MIGRATION_EXAMPLE_PLUGINS_DISABLED, '1');
    logInfo('plugin-loader', 'example_plugins_migrated_to_disabled', {
      ids: Array.from(EXAMPLE_PLUGIN_IDS),
    });
  } catch (err) {
    // 迁移失败不阻塞启动；标记未写入，下次启动重试
    logError('plugin-loader', 'example_plugins_migration_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function loadAllPlugins(): Promise<Plugin[]> {
  const pluginsDir = getPluginsDir();
  const plugins: Plugin[] = [];

  if (!fs.existsSync(pluginsDir)) {
    console.warn(`[PluginLoader] 插件目录不存在: ${pluginsDir}`);
    return plugins;
  }

  // 存量库的示例插件默认禁用迁移（全新库无记录，幂等无副作用）
  migrateExamplePluginsOnce();

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  const pluginDirs = entries.filter((e) => e.isDirectory());

  for (const dir of pluginDirs) {
    if (isExamplePluginBlocked(dir.name)) {
      registerBlockedExample(dir.name);
      console.log(`[PluginLoader] 示例插件默认禁用，跳过加载: ${dir.name}`);
      logInfo('plugin-loader', 'example_plugin_blocked', { pluginId: dir.name });
      continue;
    }
    if (isPluginDisabled(dir.name)) {
      console.log(`[PluginLoader] 插件已禁用，跳过加载: ${dir.name}`);
      logInfo('plugin-loader', 'plugin_disabled_skipped', { pluginId: dir.name });
      continue;
    }
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

    // 持久化到数据库：upsert 只同步 name/version，保留已有 enabled 开关。
    // 新插件首次注册默认 enabled=1（示例插件为 0，见 EXAMPLE_PLUGIN_IDS）；
    // 已禁用的插件重新加载时不会被重置为启用。
    try {
      const db = getDatabase();
      const defaultEnabled = EXAMPLE_PLUGIN_IDS.has(plugin.manifest.id) ? 0 : 1;
      db.run(
        `INSERT INTO _plugins (id, name, version, enabled, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           version = excluded.version,
           updated_at = datetime('now')`,
        [plugin.manifest.id, plugin.manifest.name, plugin.manifest.version, defaultEnabled]
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

/**
 * 列出 `_plugins` 表中所有已注册插件（含已禁用、未加载的），并标注当前会话是否已加载。
 * 数据库不可用时退化为仅返回已加载插件。
 */
export function listRegisteredPlugins(): RegisteredPluginInfo[] {
  try {
    const db = getDatabase();
    const rows = db.exec(`SELECT id, name, version, enabled FROM _plugins ORDER BY id`);
    if (rows.length === 0) return [];
    return rows[0].values.map((row) => {
      const id = String(row[0]);
      return {
        id,
        name: String(row[1]),
        version: String(row[2]),
        enabled: row[3] === 1,
        loaded: loadedPlugins.has(id),
      };
    });
  } catch {
    return Array.from(loadedPlugins.values()).map((p) => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      enabled: true,
      loaded: true,
    }));
  }
}

/**
 * 启用 / 禁用一个插件，状态写入 `_plugins.enabled` 并立即落盘。
 *
 * - 禁用：若插件当前已加载，立即调用其 deactivate() 并从已加载表移除（即时生效）；
 *   deactivate() 抛错只记日志、不回滚开关（插件内部异常由插件自行负责，见 CONVENTIONS 第 5 条）。
 * - 启用：仅落库，下次启动 loadAllPlugins() 时恢复加载，避免同一会话内
 *   重复注册 bus 监听 / CLI 命令。
 *
 * 表中无该插件记录时抛错（目录从未被扫描到，无从开关）。
 */
export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<PluginStateResult> {
  if (typeof pluginId !== 'string' || pluginId.length === 0) {
    throw new Error('非法插件 id');
  }

  const db = getDatabase();

  const existsStmt = db.prepare(`SELECT 1 FROM _plugins WHERE id = ?`);
  let exists = false;
  try {
    existsStmt.bind([pluginId]);
    exists = existsStmt.step();
  } finally {
    existsStmt.free();
  }
  if (!exists) {
    throw new Error(`插件未注册：${pluginId}（启动时未扫描到该插件目录）`);
  }

  db.run(
    `UPDATE _plugins SET enabled = ?, updated_at = datetime('now') WHERE id = ?`,
    [enabled ? 1 : 0, pluginId]
  );
  autoSave();

  let deactivated = false;
  if (!enabled) {
    const plugin = loadedPlugins.get(pluginId);
    if (plugin) {
      if (plugin.deactivate) {
        try {
          await plugin.deactivate();
        } catch (err) {
          logError('plugin-loader', 'deactivate_failed', {
            pluginId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      loadedPlugins.delete(pluginId);
      // 强制清理该插件注册的 CLI 命令与 bus 监听，避免「禁用后能力仍存活」：
      // 命令按 `pluginId.action` 前缀反注册；bus 监听按 `pluginId:` 命名空间批量移除。
      // 插件自身订阅的 core:* 内核事件由其 deactivate() 自行清理。
      const removedCommands = unregisterByScope(pluginId);
      const removedListeners = bus.offPrefix(`${pluginId}:`);
      logInfo('plugin-loader', 'plugin_capabilities_cleaned', {
        pluginId, removedCommands, removedListeners,
      });
      bus.emit('core:plugin-deactivated', plugin.manifest);
      deactivated = true;
    }
  }

  logInfo('plugin-loader', 'plugin_enabled_changed', { pluginId, enabled, deactivated });
  console.log(
    `[PluginLoader] 插件 "${pluginId}" 已${enabled ? '启用（下次启动生效）' : '禁用'}${deactivated ? '并已卸载' : ''}`
  );

  return {
    id: pluginId,
    enabled,
    deactivated,
    // 禁用总是即时反映到运行时（已卸载或本就未加载）；启用需要重启后重新扫描加载
    applied: enabled ? 'on-restart' : 'immediate',
  };
}

/**
 * 注册核心插件管理命令（plugin.*），经 CLI loopback 服务暴露给外部工具：
 *   uuutil call plugin.list
 *   uuutil call plugin.disable --json '{"id":"hello-world"}'
 *   uuutil call plugin.enable  --json '{"id":"hello-world"}'
 *
 * 在主进程 bootstrap 中 loadAllPlugins() 之后调用一次。
 */
export function registerPluginCommands(): void {
  registerCommand({
    command: 'plugin.list',
    description: '列出所有已注册插件及其启用 / 加载状态',
    handler: () => listRegisteredPlugins(),
  });

  registerCommand({
    command: 'plugin.enable',
    description: '启用插件（写入 _plugins.enabled=1，下次启动恢复加载）',
    params: [{ name: 'id', type: 'string', required: true, description: '插件 id（插件目录名）' }],
    example: { id: 'hello-world' },
    handler: (args) => setPluginEnabled(String(args.id), true),
  });

  registerCommand({
    command: 'plugin.disable',
    description: '禁用插件（已激活则立即 deactivate 并卸载，下次启动不再加载）',
    params: [{ name: 'id', type: 'string', required: true, description: '插件 id（插件目录名）' }],
    example: { id: 'hello-world' },
    handler: (args) => setPluginEnabled(String(args.id), false),
  });

  logInfo('plugin-loader', 'plugin_commands_registered');
}

#!/usr/bin/env node
/**
 * _plugins.enabled 插件开关端到端验证脚本（无需启动 Electron）。
 *
 * 直接驱动编译产物 dist/core，用临时 SQLite 文件模拟完整生命周期：
 *   A. 首次启动（表为空）→ 普通插件自动注册并默认启用；
 *      示例插件（hello-world）默认禁用、预注册进表但不加载（生产环境不加载示例）
 *   B. 示例插件 opt-in：plugin.enable → 重启后加载，name/version 从 manifest 同步
 *   C. 普通插件运行时禁用 → 立即 deactivate 并卸载；重启不加载；
 *      运行时启用 → 仅落库不热加载；再重启恢复
 *   D. 存量库迁移：旧版本 enabled=1 的示例插件，重启后被一次性迁移为禁用，
 *      且迁移标记守卫生效（用户此后再启用不会被重复禁用）
 *   E. 边界：目录在但表记录被删 → 重启后自动重新注册并启用
 *
 * 用法：npm run build:main && node scripts/verify-plugin-enabled.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');
const assert = require('assert');

// ===== mock electron：logger 依赖 app.getPath，clipboard 插件依赖 clipboard 模块 =====
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return 'electron-mock';
  return origResolve.call(this, request, ...rest);
};
require.cache['electron-mock'] = {
  id: 'electron-mock',
  filename: 'electron-mock',
  loaded: true,
  exports: {
    app: { getPath: () => os.tmpdir() },
    clipboard: { readText: () => '', writeText: () => {} },
    shell: {},
    ipcMain: { handle() {}, on() {} },
  },
};

const DIST = path.join(__dirname, '..', 'dist');
const dbPath = path.join(os.tmpdir(), `uuutil-plugin-enabled-test-${process.pid}.db`);
const EXAMPLE_ID = 'hello-world';

// 与 core/plugin-loader 的 EXAMPLE_PLUGIN_IDS 保持一致
const isExample = (id) => id === EXAMPLE_ID;

const pluginDirs = fs
  .readdirSync(path.join(DIST, 'plugins'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

/** 清空 dist 下所有模块缓存，模拟进程重启（bus / db / loader 全部重建） */
function clearCoreCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(DIST)) delete require.cache[key];
  }
}

function query(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) rows.push(stmt.get());
  } finally {
    stmt.free();
  }
  return rows;
}

/** 模拟一次应用重启：重建 core，initDatabase + loadAllPlugins */
async function boot() {
  clearCoreCache();
  const core = require(path.join(DIST, 'core'));
  await core.initDatabase(dbPath);
  await core.loadAllPlugins();
  return core;
}

async function main() {
  try { fs.unlinkSync(dbPath); } catch { /* ignore */ }

  // ===== Round A：首次启动，_plugins 表为空 =====
  let core = await boot();
  let ids = core.listPlugins().map((p) => p.id).sort();
  console.log('首次启动加载的插件:', ids.join(', '));

  const normalDirs = pluginDirs.filter((d) => !isExample(d));
  assert.deepStrictEqual(ids, normalDirs, '首次启动应加载全部普通插件、不加载示例插件');

  let rows = query(core.getDatabase(), 'SELECT id, enabled FROM _plugins ORDER BY id');
  assert.strictEqual(rows.length, pluginDirs.length, '示例插件也应预注册进表（供 plugin.list / plugin.enable 使用）');
  for (const [id, enabled] of rows) {
    if (isExample(id)) {
      assert.strictEqual(enabled, 0, `示例插件 ${id} 首次注册应默认 enabled=0`);
    } else {
      assert.strictEqual(enabled, 1, `普通插件 ${id} 首次注册应默认 enabled=1`);
    }
  }

  // plugin.* CLI 命令注册并可用
  core.registerPluginCommands();
  let listResult = await core.invokeCommand('plugin.list');
  assert(listResult.ok, `plugin.list 应成功: ${JSON.stringify(listResult)}`);
  const helloRow = listResult.data.find((p) => p.id === EXAMPLE_ID);
  assert(helloRow && helloRow.enabled === false && helloRow.loaded === false,
    'plugin.list 中示例插件应为 enabled=false / loaded=false');
  assert(listResult.data.filter((p) => !isExample(p.id)).every((p) => p.enabled === true && p.loaded === true),
    'plugin.list 中普通插件应全部 enabled+loaded');

  // ===== Round B：示例插件 opt-in —— 显式启用后重启加载 =====
  let enableResult = await core.invokeCommand('plugin.enable', { id: EXAMPLE_ID });
  assert(enableResult.ok, `plugin.enable 应成功: ${JSON.stringify(enableResult)}`);
  assert.strictEqual(enableResult.data.applied, 'on-restart');
  assert(!core.listPlugins().some((p) => p.id === EXAMPLE_ID), '启用不应在同会话热加载');
  core.flushDatabase();
  core.closeDatabase();

  core = await boot();
  ids = core.listPlugins().map((p) => p.id).sort();
  console.log('显式启用后重启加载的插件:', ids.join(', '));
  assert.deepStrictEqual(ids, pluginDirs, '显式启用示例插件后重启应加载全部插件');
  rows = query(core.getDatabase(), 'SELECT name, version FROM _plugins WHERE id = ?', [EXAMPLE_ID]);
  assert.strictEqual(rows[0][0], 'Hello World', '加载后 upsert 应把占位 name 同步为 manifest.name');
  core.flushDatabase();
  core.closeDatabase();

  // ===== Round C：普通插件运行时禁用/启用全流程（HNA-15 核心场景） =====
  core = await boot();
  core.registerPluginCommands();

  let deactivatedEvent = null;
  core.bus.on('core:plugin-deactivated', (manifest) => { deactivatedEvent = manifest; });

  const disableResult = await core.invokeCommand('plugin.disable', { id: 'calculator' });
  assert(disableResult.ok, `plugin.disable 应成功: ${JSON.stringify(disableResult)}`);
  assert.strictEqual(disableResult.data.deactivated, true, '禁用已激活插件应调用 deactivate()');
  assert.strictEqual(disableResult.data.applied, 'immediate');
  assert(deactivatedEvent && deactivatedEvent.id === 'calculator', '应发出 core:plugin-deactivated 事件');
  assert(!core.listPlugins().some((p) => p.id === 'calculator'), '禁用后 calculator 应已卸载');

  rows = query(core.getDatabase(), 'SELECT enabled FROM _plugins WHERE id = ?', ['calculator']);
  assert.strictEqual(rows[0][0], 0, 'DB 中 enabled 应落为 0');

  // 未注册插件报错
  const badResult = await core.invokeCommand('plugin.disable', { id: 'no-such-plugin' });
  assert(!badResult.ok, '未知插件 id 应返回失败');
  core.flushDatabase();
  core.closeDatabase();

  core = await boot();
  ids = core.listPlugins().map((p) => p.id).sort();
  console.log('禁用 calculator 后重启加载的插件:', ids.join(', '));
  assert(!ids.includes('calculator'), '重启后 calculator 不应加载');
  assert.strictEqual(ids.length, pluginDirs.length - 1, '应只少 calculator 一个');

  core.registerPluginCommands();
  enableResult = await core.invokeCommand('plugin.enable', { id: 'calculator' });
  assert(enableResult.ok, `plugin.enable 应成功: ${JSON.stringify(enableResult)}`);
  assert.strictEqual(enableResult.data.applied, 'on-restart');
  core.flushDatabase();
  core.closeDatabase();

  core = await boot();
  ids = core.listPlugins().map((p) => p.id).sort();
  assert.deepStrictEqual(ids, pluginDirs, '重新启用后重启应恢复全部插件');
  rows = query(core.getDatabase(), 'SELECT id, enabled FROM _plugins ORDER BY id');
  assert(rows.every((r) => r[1] === 1), '重新加载后 enabled 应保持 1（upsert 不重置开关）');
  core.flushDatabase();
  core.closeDatabase();

  // ===== Round D：存量库迁移 —— 旧版本默认启用的示例插件被一次性禁用 =====
  // 手工构造旧库状态：hello-world enabled=1，且没有迁移标记
  core = await boot();
  core.getDatabase().run(`UPDATE _plugins SET enabled = 1 WHERE id = ?`, [EXAMPLE_ID]);
  core.getDatabase().run(`DELETE FROM _meta WHERE key = 'migration:example-plugins-default-disabled'`);
  core.flushDatabase();
  core.closeDatabase();

  core = await boot();
  ids = core.listPlugins().map((p) => p.id).sort();
  console.log('存量库迁移后重启加载的插件:', ids.join(', '));
  assert(!ids.includes(EXAMPLE_ID), '迁移后示例插件不应加载');
  rows = query(core.getDatabase(), 'SELECT enabled FROM _plugins WHERE id = ?', [EXAMPLE_ID]);
  assert.strictEqual(rows[0][0], 0, '迁移应把存量示例插件 enabled 落为 0');
  rows = query(core.getDatabase(), `SELECT value FROM _meta WHERE key = 'migration:example-plugins-default-disabled'`);
  assert.strictEqual(rows[0][0], '1', '迁移标记应已写入');

  // 迁移标记守卫：用户此后显式启用，重启后正常加载（迁移不再重复执行）
  core.registerPluginCommands();
  enableResult = await core.invokeCommand('plugin.enable', { id: EXAMPLE_ID });
  assert(enableResult.ok, '迁移后用户仍应能显式启用示例插件');
  core.flushDatabase();
  core.closeDatabase();

  core = await boot();
  ids = core.listPlugins().map((p) => p.id).sort();
  assert(ids.includes(EXAMPLE_ID), '迁移完成后，用户显式启用的示例插件重启应正常加载（迁移不重复执行）');
  core.flushDatabase();
  core.closeDatabase();

  // ===== Round E：边界 —— 目录在但表记录被删 → 重启自动注册并启用 =====
  core = await boot();
  core.getDatabase().run(`DELETE FROM _plugins WHERE id = 'calculator'`);
  core.flushDatabase();
  core.closeDatabase();

  core = await boot();
  ids = core.listPlugins().map((p) => p.id).sort();
  assert(ids.includes('calculator'), '无表记录的插件目录应自动注册并加载');
  rows = query(core.getDatabase(), 'SELECT enabled FROM _plugins WHERE id = ?', ['calculator']);
  assert.strictEqual(rows[0][0], 1, '自动注册应默认 enabled=1');
  console.log('边界场景（目录在/记录缺失 → 自动注册启用）通过');

  core.closeDatabase();
  try { fs.unlinkSync(dbPath); } catch { /* ignore */ }

  console.log('\n✅ 全部断言通过：_plugins.enabled 开关 + 示例插件默认禁用端到端验证成功');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ 验证失败:', err);
  process.exit(1);
});

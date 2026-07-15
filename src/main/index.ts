/**
 * Electron 主进程入口 —— 仅负责 bootstrap 调度。
 *
 * 窗口/托盘逻辑见 windows.ts；IPC 见 ipc/*；业务逻辑见 cli.ts / whiteboard.ts / terminal.ts 等。
 * 新增功能不要在此堆 handler，按 docs/architecture-complexity-management.md 的约定走 IPC 注册表。
 */

import { app, globalShortcut } from 'electron';
import path from 'path';
import {
  initDatabase,
  closeDatabase,
  bus,
  initAi,
  initLogger,
  closeLogger,
  info as logInfo,
} from '../core';
import { loadAllPlugins, listPlugins } from '../core/plugin-loader';
import { disposeAllTerminals } from './terminal';
import { registerAllIpc } from './ipc';
import { startCliServer, type CliServerHandle } from './cli-server';
import {
  createBallWindow,
  createTray,
  registerGlobalShortcuts,
  isBallWindowAlive,
  showPanelWindow,
} from './windows';

let cliServer: CliServerHandle | null = null;

async function bootstrap(): Promise<void> {
  initLogger();
  logInfo('app', '应用启动');

  await initDatabase(path.join(app.getPath('userData'), 'assistant.db'));
  logInfo('app', '数据库已初始化');

  initAi();
  logInfo('app', 'AI 核心已初始化');

  await loadAllPlugins();
  logInfo('app', '插件加载完成', { count: listPlugins().length });

  bus.emit('core:ready');
  logInfo('app', '核心已就绪');

  registerAllIpc();

  cliServer = await startCliServer();
  if (cliServer) logInfo('app', 'CLI 服务已启动', { port: cliServer.port });

  createBallWindow();
  createTray();
  registerGlobalShortcuts();
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // 有托盘时不退出
});

app.on('activate', () => {
  if (!isBallWindowAlive()) {
    createBallWindow();
  } else {
    showPanelWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  logInfo('app', '应用退出');
  void cliServer?.close();
  disposeAllTerminals();
  closeDatabase();
  closeLogger();
});

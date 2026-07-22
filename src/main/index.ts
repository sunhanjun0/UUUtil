/**
 * Electron 主进程入口 —— 仅负责 bootstrap 调度。
 *
 * 窗口/托盘逻辑见 windows.ts；IPC 见 ipc/*；业务逻辑见 cli.ts / whiteboard.ts / terminal.ts 等。
 * 新增功能不要在此堆 handler，按 docs/architecture-complexity-management.md 的约定走 IPC 注册表。
 */

import { app, globalShortcut } from 'electron';
import path from 'path';

// 父进程（例如 concurrently）可能提前退出，留下孤儿主进程；此时任何往 stdout/stderr
// 的写入都会抛 EPIPE，经由 Node 冒泡触发 Electron 的 uncaughtException 弹窗。
// 这里给两条流各挂一个静默 error 监听，把管道断开的情况吞掉，日志文件不受影响。
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err && err.code !== 'EPIPE') {
      // 非 EPIPE 的写错误依然让 Electron 感知，但也不再让它当致命异常
      try { process.stderr.write(`[stream-error] ${err.message}\n`); } catch { /* 二次 EPIPE 忽略 */ }
    }
  });
}
import {
  initDatabase,
  closeDatabase,
  bus,
  initAi,
  initLogger,
  closeLogger,
  info as logInfo,
  warn as logWarn,
  error as logError,
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

  // 开始调试日志
  console.log('=== 开始创建窗口和托盘 ===');
  logInfo('window', 'about_to_create_ball_window');

  try {
    createBallWindow();
    console.log('createBallWindow 成功');
    logInfo('window', 'ball_window_created');
  } catch (e) {
    console.error('createBallWindow 失败:', e);
    logWarn('window', 'ball_window_error', { error: String(e) });
  }

  try {
    createTray();
    console.log('createTray 成功');
    logInfo('window', 'tray_created');
  } catch (e) {
    console.error('createTray 失败:', e);
    logWarn('window', 'tray_error', { error: String(e) });
  }

  try {
    registerGlobalShortcuts();
    console.log('registerGlobalShortcuts 成功');
    logInfo('window', 'global_shortcuts_registered');
  } catch (e) {
    console.error('registerGlobalShortcuts 失败:', e);
    logWarn('window', 'shortcuts_error', { error: String(e) });
  }

  console.log('=== bootstrap 完成 ===');
  logInfo('app', 'bootstrap_complete');
}

// ========== 全局异常处理 - 记录异常日志帮助排查崩溃 ==========

// 未捕获的同步异常
process.on('uncaughtException', (err) => {
  const errorInfo = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
  logError('app', 'uncaught_exception', errorInfo);
  console.error('[uncaughtException]', errorInfo);

  // 尝试干净退出
  try {
    globalShortcut.unregisterAll();
    closeDatabase();
    closeLogger();
  } finally {
    process.exit(1);
  }
});

// 未处理的 Promise rejection
process.on('unhandledRejection', (reason, promise) => {
  let reasonStr: string;
  let reasonInfo: unknown;
  if (reason instanceof Error) {
    reasonStr = reason.message;
    reasonInfo = { name: reason.name, message: reason.message, stack: reason.stack };
  } else {
    reasonStr = String(reason);
    reasonInfo = { reason: reasonStr };
  }
  logWarn('app', 'unhandled_rejection', {
    reason: reasonStr,
    reason_detail: reasonInfo,
  });
  console.warn('[unhandledRejection]', reason);
  // 不退出，只记录日志
});

// 进程退出事件
process.on('exit', (code) => {
  logInfo('app', 'process_exit', { exitCode: code });
});

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

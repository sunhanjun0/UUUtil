/**
 * IPC 模块聚合注册入口。
 *
 * 新增 IPC 功能：在对应 *.ipc.ts 中用 defineInvoke/defineSend 声明，
 * 然后加入此处的模块列表即可，无需再手写 ipcMain.handle。
 */

import { registerIpcModules } from './register';
import { windowIpc } from './window.ipc';
import { whiteboardIpc } from './whiteboard.ipc';
import { pluginIpc } from './plugin.ipc';
import { aiIpc } from './ai.ipc';
import { cliIpc } from './cli.ipc';
import { terminalIpc } from './terminal.ipc';
import { logsIpc } from './logs.ipc';
import { focusIpc } from './focus.ipc';
import { reminderIpc } from './reminder.ipc';
import { screenshotIpc } from './screenshot.ipc';
import { uiSettingsIpc } from './ui-settings.ipc';

export function registerAllIpc(): void {
  registerIpcModules([
    windowIpc,
    whiteboardIpc,
    pluginIpc,
    aiIpc,
    cliIpc,
    terminalIpc,
    logsIpc,
    focusIpc,
    reminderIpc,
    screenshotIpc,
    uiSettingsIpc,
  ]);
}

/**
 * 窗口控制 IPC 模块：悬浮球展开/收起、面板最大化、开发者工具、窗口移动、退出。
 */

import { app, BrowserWindow } from 'electron';
import { closeDatabase, info as logInfo } from '../../core';
import { defineInvoke, defineSend } from './types';
import type { IpcModule } from './types';
import {
  togglePanelWindow,
  hidePanelWindow,
  togglePanelMaximize,
  showBallContextMenu,
} from '../windows';

export const windowIpc: IpcModule = {
  namespace: 'window',
  defs: [
    defineSend('ball:expand', () => { logInfo('window', 'ball_expand_received'); togglePanelWindow(); }),
    defineSend('ball:collapse', () => { logInfo('window', 'ball_collapse_received'); hidePanelWindow(); }),
    defineInvoke('panel:toggle-maximize', () => togglePanelMaximize()),
    defineSend('panel:open-devtools', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.webContents.openDevTools({ mode: 'detach' });
    }),
    defineSend('ball:context-menu', () => showBallContextMenu()),
    defineSend('ball:quit', () => { closeDatabase(); app.quit(); }),
    // 通用窗口移动（根据 event.sender 判断是哪个窗口）
    defineSend('window:move', (event, dx: number, dy: number) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return;
      const [x, y] = win.getPosition();
      win.setPosition(x + dx, y + dy);
    }),
  ],
};

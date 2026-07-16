/**
 * Reminder IPC —— 面板前端读取提醒列表 / 详情，
 * 同时把 bus 上的 reminder:changed 事件广播到所有渲染窗口。
 */

import { BrowserWindow } from 'electron';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { api as reminderApi } from '../../plugins/reminder/api';
import { bus } from '../../core/event-bus';
import type { ListRemindersOptions, ReminderUpdatePayload } from '../../shared/types';

let bound = false;
let lastInfoAt: string | null = null;

function bindBus() {
  if (bound) return;
  bound = true;
  bus.on('reminder:changed', (payload) => {
    try {
      if (payload.type === 'info') {
        lastInfoAt = new Date().toISOString();
      }
      const update: ReminderUpdatePayload = {
        activeActionCount: reminderApi.countActiveActions(),
        lastInfoAt,
        reason: payload.reason,
        type: payload.type,
        deduped: payload.deduped,
      };
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('reminder:update', update);
        }
      }
    } catch (err) {
      console.error('[reminder.ipc] 广播 reminder:update 失败:', err);
    }
  });
}

bindBus();

export const reminderIpc: IpcModule = {
  namespace: 'reminder',
  defs: [
    defineInvoke('reminder:list', (_event, options?: ListRemindersOptions) => reminderApi.list(options)),
    defineInvoke('reminder:get', (_event, id: string) => reminderApi.get(id)),
  ],
};

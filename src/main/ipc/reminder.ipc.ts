/**
 * Reminder IPC —— 面板前端读取提醒列表 / 详情、提交响应或忽略，
 * 同时把 bus 上的 reminder:changed 事件广播到所有渲染窗口。
 */

import { BrowserWindow } from 'electron';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { api as reminderApi } from '../../plugins/reminder/api';
import { fulfillWaiter } from '../../plugins/reminder/waiters';
import { bus } from '../../core/event-bus';
import type {
  ListRemindersOptions,
  ReminderUpdatePayload,
  RespondReminderInput,
} from '../../shared/types';

let bound = false;
let lastInfoAt: string | null = null;

function bindBus() {
  if (bound) return;
  bound = true;
  bus.on('reminder:changed', (payload) => {
    try {
      if (payload.reason === 'notify' && payload.type === 'info') {
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
    defineInvoke('reminder:respond', (_event, input: RespondReminderInput) => {
      const reminder = reminderApi.respond(input);
      if (reminder.response) {
        fulfillWaiter(reminder.id, { kind: 'responded', response: reminder.response });
      }
      bus.emit('reminder:changed', {
        reason: 'respond',
        type: reminder.type,
        deduped: false,
      });
      return reminder;
    }),
    defineInvoke('reminder:dismiss', (_event, id: string) => {
      const reminder = reminderApi.dismiss(id);
      fulfillWaiter(reminder.id, { kind: 'dismissed' });
      bus.emit('reminder:changed', {
        reason: 'dismiss',
        type: reminder.type,
        deduped: false,
      });
      return reminder;
    }),
  ],
};

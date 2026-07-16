/**
 * Reminder IPC —— 面板前端读取提醒列表与详情。
 *
 * 阶段 1 只暴露只读接口；写操作走 CLI（reminder.notify），面板暂不承担人工创建。
 */

import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { api as reminderApi } from '../../plugins/reminder/api';
import type { ListRemindersOptions } from '../../shared/types';

export const reminderIpc: IpcModule = {
  namespace: 'reminder',
  defs: [
    defineInvoke('reminder:list', (_event, options?: ListRemindersOptions) => reminderApi.list(options)),
    defineInvoke('reminder:get', (_event, id: string) => reminderApi.get(id)),
  ],
};

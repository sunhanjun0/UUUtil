/**
 * Clipboard IPC —— 面板前端读取剪贴板历史 / 复制回剪贴板 / 置顶 / 删除 / 清空，
 * 同时把 bus 上的 clipboard:changed 事件广播到所有渲染窗口。
 *
 * 与 reminder.ipc.ts 同构：主进程直接引用插件 api.ts（唯一对外接口），符合插件隔离铁律。
 */

import { BrowserWindow } from 'electron';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { api as clipboardApi } from '../../plugins/clipboard/api';
import { bus } from '../../core/event-bus';
import { error } from '../../core/logger';
import type { ClipboardUpdatePayload, ListClipboardOptions } from '../../shared/types';

let bound = false;

function bindBus() {
  if (bound) return;
  bound = true;
  bus.on('clipboard:changed', (payload: ClipboardUpdatePayload) => {
    try {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('clipboard:update', payload);
        }
      }
    } catch (err) {
      error('clipboard.ipc', '广播 clipboard:update 失败', { error: err instanceof Error ? err.message : String(err) });
    }
  });
}

bindBus();

export const clipboardIpc: IpcModule = {
  namespace: 'clipboard',
  defs: [
    defineInvoke('clipboard:list', (_event, options?: ListClipboardOptions) => clipboardApi.list(options)),
    defineInvoke('clipboard:get', (_event, id: string) => clipboardApi.get(id)),
    defineInvoke('clipboard:copy', (_event, id: string) => {
      const item = clipboardApi.copyToClipboard(id);
      bus.emit('clipboard:changed', { reason: 'copy', total: clipboardApi.count() });
      return item;
    }),
    defineInvoke('clipboard:toggle-pin', (_event, id: string) => {
      const item = clipboardApi.togglePin(id);
      bus.emit('clipboard:changed', { reason: 'pin', total: clipboardApi.count() });
      return item;
    }),
    defineInvoke('clipboard:remove', (_event, id: string) => {
      clipboardApi.remove(id);
      bus.emit('clipboard:changed', { reason: 'remove', total: clipboardApi.count() });
      return { removed: 1 };
    }),
    defineInvoke('clipboard:clear', () => {
      const cleared = clipboardApi.clear();
      bus.emit('clipboard:changed', { reason: 'clear', total: clipboardApi.count() });
      return { cleared };
    }),
  ],
};

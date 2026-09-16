/**
 * Todo IPC —— 面板前端对事项/清单的全部读写入口，
 * 同时把 bus 上的 todo:changed 事件以 todo:update 广播到所有渲染窗口
 * （CLI 外部写入也走这条通道，是 COM 灯闪 + 新行滑入动效的数据源）。
 *
 * 变更类调用在返回前 emit todo:changed（origin=panel）；CLI 侧由插件命令
 * 以 origin=cli 发出，两边共用同一载荷形状（TodoUpdatePayload）。
 */

import { BrowserWindow } from 'electron';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { api as todoApi } from '../../plugins/todo/api';
import { bus } from '../../core/event-bus';
import type {
  CreateTodoInput,
  CreateTodoListInput,
  ListTodosOptions,
  TodoUpdatePayload,
  UpdateTodoInput,
  UpdateTodoListInput,
} from '../../shared/types';

let bound = false;

function bindBus() {
  if (bound) return;
  bound = true;
  bus.on('todo:changed', (payload) => {
    try {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('todo:update', payload);
        }
      }
    } catch (err) {
      console.error('[todo.ipc] 广播 todo:update 失败:', err);
    }
  });
}

bindBus();

/** 面板侧变更统一经此发出，origin 固定 panel。 */
function emitChanged(payload: Omit<TodoUpdatePayload, 'origin'>): void {
  bus.emit('todo:changed', { ...payload, origin: 'panel' });
}

export const todoIpc: IpcModule = {
  namespace: 'todo',
  defs: [
    defineInvoke('todo:list', (_event, options?: ListTodosOptions) => todoApi.list(options)),
    defineInvoke('todo:get', (_event, id: string) => todoApi.get(id)),
    defineInvoke('todo:create', (_event, input: CreateTodoInput) => {
      const todo = todoApi.create(input);
      emitChanged({ reason: 'create', id: todo.id });
      return todo;
    }),
    defineInvoke('todo:update', (_event, id: string, patch: UpdateTodoInput) => {
      const todo = todoApi.update(id, patch);
      emitChanged({ reason: 'update', id: todo.id });
      return todo;
    }),
    defineInvoke('todo:remove', (_event, id: string) => {
      todoApi.remove(id);
      emitChanged({ reason: 'remove', id });
    }),
    defineInvoke('todo:done', (_event, id: string) => {
      const todo = todoApi.done(id);
      emitChanged({ reason: 'done', id: todo.id });
      return todo;
    }),
    defineInvoke('todo:reopen', (_event, id: string) => {
      const todo = todoApi.reopen(id);
      emitChanged({ reason: 'reopen', id: todo.id });
      return todo;
    }),
    defineInvoke('todo:listLists', () => todoApi.listLists()),
    defineInvoke('todo:createList', (_event, input: CreateTodoListInput) => {
      const list = todoApi.createList(input);
      emitChanged({ reason: 'lists', id: list.id });
      return list;
    }),
    defineInvoke('todo:updateList', (_event, id: string, patch: UpdateTodoListInput) => {
      const list = todoApi.updateList(id, patch);
      emitChanged({ reason: 'lists', id: list.id });
      return list;
    }),
    defineInvoke('todo:removeList', (_event, id: string) => {
      todoApi.removeList(id);
      emitChanged({ reason: 'lists', id });
    }),
  ],
};

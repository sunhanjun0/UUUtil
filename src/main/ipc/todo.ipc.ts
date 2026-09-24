/**
 * Todo IPC —— 面板前端对事项/清单的全部读写入口，
 * 同时把 bus 上的 todo:changed 事件以 todo:update 广播到所有渲染窗口
 * （CLI 外部写入也走这条通道，是 COM 灯闪 + 新行滑入动效的数据源）。
 *
 * 变更类调用在返回前 emit todo:changed（origin=panel）；CLI 侧由插件命令
 * 以 origin=cli 发出，两边共用同一载荷形状（TodoUpdatePayload）。
 */

import { BrowserWindow, shell } from 'electron';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import {
  api as todoApi,
  multicaBridge,
  buildMulticaExternalRef,
  resolveMulticaAppUrl,
} from '../../plugins/todo/api';
import { bus } from '../../core/event-bus';
import type {
  CreateTodoInput,
  CreateTodoListInput,
  ListTodosOptions,
  MulticaBridgeResult,
  PullMulticaTodoInput,
  PullMulticaTodoResult,
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

    // ===== Multica 投影（Stage 2）=====
    // 桥接层能力暴露到渲染层：全部错误内化（ok:false），Multica 不可用不阻塞事项本体
    defineInvoke('todo:get-by-external-ref', (_event, ref: string) => todoApi.getByExternalRef(ref)),
    defineInvoke('todo:multica-list', () => multicaBridge.listAssignedIssues()),
    defineInvoke('todo:multica-get', (_event, id: string) => multicaBridge.getIssue(id)),
    // ⇩ 拉入：create+link 一步到位；重复拉入（ref 已占用）返回 ok:false 而非抛错
    defineInvoke('todo:multica-pull', (_event, input: PullMulticaTodoInput): PullMulticaTodoResult => {
      try {
        const issueId = typeof input?.issueId === 'string' ? input.issueId.trim() : '';
        if (!issueId) return { ok: false, error: 'issueId 必填' };
        const ref = buildMulticaExternalRef(issueId, typeof input.identifier === 'string' ? input.identifier : undefined);
        if (todoApi.getByExternalRef(ref)) return { ok: false, error: '该 issue 已拉入' };
        const todo = todoApi.create({
          title: input.title,
          note: input.note,
          priority: input.priority,
          dueAt: input.dueAt ?? null,
          externalRef: ref,
        });
        emitChanged({ reason: 'create', id: todo.id });
        return { ok: true, todo };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }),
    // 打开对应 Multica issue：面板内无 Multica 视图 → 系统浏览器（实现时择可用者）
    defineInvoke('todo:multica-open', async (_event, issueId: string): Promise<MulticaBridgeResult<null>> => {
      const id = typeof issueId === 'string' ? issueId.trim() : '';
      const appUrl = resolveMulticaAppUrl();
      if (!id) return { ok: false, error: 'issueId 必填' };
      if (!appUrl) return { ok: false, error: 'Multica app_url 不可解析' };
      try {
        await shell.openExternal(`${appUrl}/issues/${encodeURIComponent(id)}`);
        return { ok: true, data: null };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }),
  ],
};

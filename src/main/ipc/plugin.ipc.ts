/**
 * 插件 IPC 模块：内核插件列表 + 各插件对外方法的桥接。
 *
 * 所有插件调用统一通过 plugin-bridge（bus.emit/on），不直接 import 插件实现。
 */

import { bus } from '../../core';
import { listPlugins } from '../../core/plugin-loader';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { waitForPluginEvent, invokeActionPlugin } from '../plugin-bridge';

export const pluginIpc: IpcModule = {
  namespace: 'plugin',
  defs: [
    defineInvoke('core:list-plugins', () => listPlugins()),

    defineInvoke('plugin:hello-world:greet', (_event, name: string) => {
      bus.emit('hello-world:greet', name);
      return { success: true };
    }),

    defineInvoke('plugin:calculator:calculate', async (_event, expression: string) => {
      const data = await waitForPluginEvent<{ expression: string; result: string }>(
        'calculator:result',
        'calculator:calculate',
        [expression],
        (message) => message.expression === expression,
      );
      return data.result;
    }),

    defineInvoke('plugin:dev-utils:invoke', (_event, action: string, ...args: any[]) =>
      invokeActionPlugin('dev-utils:result', action, 'dev-utils:invoke', [action, ...args])),

    // 知识库
    defineInvoke('plugin:knowledge-base:getNotes', (_event, categoryId?: string, tagId?: string) =>
      invokeActionPlugin('knowledge-base:result', 'getNotes', 'knowledge-base:getNotes', [categoryId, tagId])),
    defineInvoke('plugin:knowledge-base:searchNotes', (_event, keyword: string) =>
      invokeActionPlugin('knowledge-base:result', 'searchNotes', 'knowledge-base:searchNotes', [keyword])),
    defineInvoke('plugin:knowledge-base:createNote', (_event, title: string, content: string, categoryId: string, tagIds: string[]) =>
      invokeActionPlugin('knowledge-base:result', 'createNote', 'knowledge-base:createNote', [title, content, categoryId, tagIds])),
    defineInvoke('plugin:knowledge-base:updateNote', (_event, noteId: string, title: string, content: string, categoryId: string, tagIds: string[]) =>
      invokeActionPlugin('knowledge-base:result', 'updateNote', 'knowledge-base:updateNote', [noteId, title, content, categoryId, tagIds])),
    defineInvoke('plugin:knowledge-base:deleteNote', (_event, noteId: string) =>
      invokeActionPlugin('knowledge-base:result', 'deleteNote', 'knowledge-base:deleteNote', [noteId])),
    defineInvoke('plugin:knowledge-base:getCategories', () =>
      invokeActionPlugin('knowledge-base:result', 'getCategories', 'knowledge-base:getCategories', [])),
    defineInvoke('plugin:knowledge-base:createCategory', (_event, name: string, color?: string) =>
      invokeActionPlugin('knowledge-base:result', 'createCategory', 'knowledge-base:createCategory', [name, color])),
    defineInvoke('plugin:knowledge-base:deleteCategory', (_event, categoryId: string) =>
      invokeActionPlugin('knowledge-base:result', 'deleteCategory', 'knowledge-base:deleteCategory', [categoryId])),
    defineInvoke('plugin:knowledge-base:getTags', () =>
      invokeActionPlugin('knowledge-base:result', 'getTags', 'knowledge-base:getTags', [])),
    defineInvoke('plugin:knowledge-base:createTag', (_event, name: string) =>
      invokeActionPlugin('knowledge-base:result', 'createTag', 'knowledge-base:createTag', [name])),
    defineInvoke('plugin:knowledge-base:deleteTag', (_event, tagId: string) =>
      invokeActionPlugin('knowledge-base:result', 'deleteTag', 'knowledge-base:deleteTag', [tagId])),
  ],
};

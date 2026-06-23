/**
 * Electron Preload 脚本 —— 双窗口模式
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { AiChatRequest, AiProviderConfig, AiRuntimeConfig } from '../shared/types';

contextBridge.exposeInMainWorld('assistant', {
  // ===== 窗口控制 =====
  expandBall: () => ipcRenderer.send('ball:expand'),
  collapseBall: () => ipcRenderer.send('ball:collapse'),
  showBallContextMenu: () => ipcRenderer.send('ball:context-menu'),
  quitBall: () => ipcRenderer.send('ball:quit'),
  moveWindow: (dx: number, dy: number) => ipcRenderer.send('window:move', dx, dy),
  panelReady: () => ipcRenderer.send('panel:ready'),
  openDevTools: () => ipcRenderer.send('panel:open-devtools'),

  // ===== 插件 API =====
  listPlugins: () => ipcRenderer.invoke('core:list-plugins'),
  greet: (name: string) => ipcRenderer.invoke('plugin:hello-world:greet', name),
  calculate: (expression: string) => ipcRenderer.invoke('plugin:calculator:calculate', expression),
  devUtils: (action: string, ...args: any[]) => ipcRenderer.invoke('plugin:dev-utils:invoke', action, ...args),
  getWhiteboardState: () => ipcRenderer.invoke('core:whiteboard:get-state'),
  saveWhiteboardState: (state: string) => ipcRenderer.invoke('core:whiteboard:save-state', state),

  // 知识库 API
  getNotes: (categoryId?: string, tagId?: string) => ipcRenderer.invoke('plugin:knowledge-base:getNotes', categoryId, tagId),
  searchNotes: (keyword: string) => ipcRenderer.invoke('plugin:knowledge-base:searchNotes', keyword),
  createNote: (title: string, content: string, categoryId: string, tagIds: string[]) => ipcRenderer.invoke('plugin:knowledge-base:createNote', title, content, categoryId, tagIds),
  updateNote: (noteId: string, title: string, content: string, categoryId: string, tagIds: string[]) => ipcRenderer.invoke('plugin:knowledge-base:updateNote', noteId, title, content, categoryId, tagIds),
  deleteNote: (noteId: string) => ipcRenderer.invoke('plugin:knowledge-base:deleteNote', noteId),
  getCategories: () => ipcRenderer.invoke('plugin:knowledge-base:getCategories'),
  createCategory: (name: string, color?: string) => ipcRenderer.invoke('plugin:knowledge-base:createCategory', name, color),
  deleteCategory: (categoryId: string) => ipcRenderer.invoke('plugin:knowledge-base:deleteCategory', categoryId),
  getTags: () => ipcRenderer.invoke('plugin:knowledge-base:getTags'),
  createTag: (name: string) => ipcRenderer.invoke('plugin:knowledge-base:createTag', name),
  deleteTag: (tagId: string) => ipcRenderer.invoke('plugin:knowledge-base:deleteTag', tagId),

  // AI 核心 API
  ai: {
    listProviders: () => ipcRenderer.invoke('core:ai:list-providers'),
    getRuntimeConfig: () => ipcRenderer.invoke('core:ai:get-runtime-config'),
    upsertProvider: (provider: Omit<AiProviderConfig, 'createdAt' | 'updatedAt'>) => ipcRenderer.invoke('core:ai:upsert-provider', provider),
    deleteProvider: (providerId: string) => ipcRenderer.invoke('core:ai:delete-provider', providerId),
    updateRuntimeConfig: (config: AiRuntimeConfig) => ipcRenderer.invoke('core:ai:update-runtime-config', config),
    chat: (request: AiChatRequest) => ipcRenderer.invoke('core:ai:chat', request),
  },

  getVersion: () => '0.1.0',
});

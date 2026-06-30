/**
 * Electron Preload 脚本 —— 双窗口模式
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiChatRequest,
  AiProviderConfig,
  AiRuntimeConfig,
  CliCommandRequest,
  FocusHorizon,
  FocusImportance,
  FocusStatus,
} from '../shared/types';
import type { AssistantApi } from '../shared/assistant-api';

const assistantApi: AssistantApi = {
  // ===== 窗口控制 =====
  expandBall: () => ipcRenderer.send('ball:expand'),
  collapseBall: () => ipcRenderer.send('ball:collapse'),
  togglePanelMaximize: (): Promise<boolean> => ipcRenderer.invoke('panel:toggle-maximize'),
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
  saveWhiteboardAttachment: (input: { name: string; mime: string; dataUrl: string }) => ipcRenderer.invoke('core:whiteboard:save-attachment', input),
  getWhiteboardAttachment: (filename: string, mime?: string) => ipcRenderer.invoke('core:whiteboard:get-attachment', filename, mime),
  openWhiteboardAttachmentsDir: () => ipcRenderer.invoke('core:whiteboard:open-attachments-dir'),
  openWhiteboardAttachment: (filename: string) => ipcRenderer.invoke('core:whiteboard:open-attachment', filename),
  showWhiteboardAttachmentInFolder: (filename: string) => ipcRenderer.invoke('core:whiteboard:show-attachment-in-folder', filename),

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

  // ===== 专注管理 Focus API =====
  focus: {
    createArea: (name: string, description: string, whyImportant: string, horizon: FocusHorizon, status: FocusStatus, importance: FocusImportance, tagIds: string[], desiredOutcome?: string, nextReviewAt?: string, contextLinks?: string[]) =>
      ipcRenderer.invoke('focus:create-area', name, description, whyImportant, horizon, status, importance, tagIds, desiredOutcome, nextReviewAt, contextLinks),
    updateArea: (areaId: string, name: string, description: string, whyImportant: string, horizon: FocusHorizon, status: FocusStatus, importance: FocusImportance, tagIds: string[], desiredOutcome?: string, nextReviewAt?: string, contextLinks?: string[]) =>
      ipcRenderer.invoke('focus:update-area', areaId, name, description, whyImportant, horizon, status, importance, tagIds, desiredOutcome, nextReviewAt, contextLinks),
    deleteArea: (areaId: string) => ipcRenderer.invoke('focus:delete-area', areaId),
    getAreas: (horizon?: FocusHorizon, status?: FocusStatus, tagId?: string, importance?: FocusImportance) => ipcRenderer.invoke('focus:get-areas', horizon, status, tagId, importance),
    getAreaById: (areaId: string) => ipcRenderer.invoke('focus:get-area-by-id', areaId),
    migrateArea: (areaId: string, toHorizon: FocusHorizon, reason?: string) => ipcRenderer.invoke('focus:migrate-area', areaId, toHorizon, reason),
    changeAreaStatus: (areaId: string, toStatus: FocusStatus, reason?: string) => ipcRenderer.invoke('focus:change-area-status', areaId, toStatus, reason),
    getMigrations: (areaId?: string) => ipcRenderer.invoke('focus:get-migrations', areaId),
    createTag: (name: string, color?: string) => ipcRenderer.invoke('focus:create-tag', name, color),
    getTags: () => ipcRenderer.invoke('focus:get-tags'),
    deleteTag: (tagId: string) => ipcRenderer.invoke('focus:delete-tag', tagId),
    startSession: (focusId: string) => ipcRenderer.invoke('focus:start-session', focusId),
    endSession: (sessionId: string, notes?: string) => ipcRenderer.invoke('focus:end-session', sessionId, notes),
    getSessions: (focusId?: string) => ipcRenderer.invoke('focus:get-sessions', focusId),
    getStats: () => ipcRenderer.invoke('focus:get-stats'),
  },

  // AI 核心 API
  ai: {
    listProviders: () => ipcRenderer.invoke('core:ai:list-providers'),
    getRuntimeConfig: () => ipcRenderer.invoke('core:ai:get-runtime-config'),
    upsertProvider: (provider: Omit<AiProviderConfig, 'createdAt' | 'updatedAt'>) => ipcRenderer.invoke('core:ai:upsert-provider', provider),
    deleteProvider: (providerId: string) => ipcRenderer.invoke('core:ai:delete-provider', providerId),
    updateRuntimeConfig: (config: AiRuntimeConfig) => ipcRenderer.invoke('core:ai:update-runtime-config', config),
    chat: (request: AiChatRequest) => ipcRenderer.invoke('core:ai:chat', request),
    chatStream: (request: AiChatRequest, onChunk: (chunk: string) => void, onReasoning?: (chunk: string) => void) => {
      const streamId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const listener = (_event: Electron.IpcRendererEvent, chunkStreamId: string, chunk: string) => {
        if (chunkStreamId === streamId) onChunk(chunk);
      };
      const reasoningListener = (_event: Electron.IpcRendererEvent, chunkStreamId: string, chunk: string) => {
        if (chunkStreamId === streamId) onReasoning?.(chunk);
      };
      ipcRenderer.on('core:ai:chat-stream:chunk', listener);
      ipcRenderer.on('core:ai:chat-stream:reasoning', reasoningListener);
      const promise = ipcRenderer.invoke('core:ai:chat-stream', streamId, request).finally(() => {
        ipcRenderer.removeListener('core:ai:chat-stream:chunk', listener);
        ipcRenderer.removeListener('core:ai:chat-stream:reasoning', reasoningListener);
      });
      return {
        streamId,
        promise,
        cancel: () => ipcRenderer.invoke('core:ai:cancel-chat-stream', streamId),
      };
    },
  },

  // ===== CLI 工具 =====
  cli: {
    execute: (request: CliCommandRequest) => ipcRenderer.invoke('core:cli:execute', request),
  },

  // ===== 终端（PTY，仅供用户手动操作，禁止接入 AI）=====
  terminal: {
    create: (options?: { cols?: number; rows?: number }): Promise<string> =>
      ipcRenderer.invoke('core:terminal:create', options),
    write: (id: string, data: string) => ipcRenderer.send('core:terminal:input', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.send('core:terminal:resize', id, cols, rows),
    dispose: (id: string) => ipcRenderer.send('core:terminal:dispose', id),
    onData: (id: string, callback: (data: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, termId: string, data: string) => {
        if (termId === id) callback(data);
      };
      ipcRenderer.on('core:terminal:data', listener);
      return () => ipcRenderer.removeListener('core:terminal:data', listener);
    },
    onExit: (id: string, callback: (exitCode: number, signal?: number) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, termId: string, exitCode: number, signal?: number) => {
        if (termId === id) callback(exitCode, signal);
      };
      ipcRenderer.on('core:terminal:exit', listener);
      return () => ipcRenderer.removeListener('core:terminal:exit', listener);
    },
  },

  getVersion: () => '0.1.0',
  log: (level: string, scope: string, message: string, meta?: Record<string, unknown>) => ipcRenderer.invoke('core:logs:write', level, scope, message, meta),
  openLogsDir: () => ipcRenderer.invoke('core:logs:open-dir'),
  getLogPath: () => ipcRenderer.invoke('core:logs:get-path'),
  readRecentLogs: (lines?: number) => ipcRenderer.invoke('core:logs:recent', lines),
  clearLogs: () => ipcRenderer.invoke('core:logs:clear'),
  takeScreenshot: () => ipcRenderer.invoke('screenshot:take'),
};

contextBridge.exposeInMainWorld('assistant', assistantApi);

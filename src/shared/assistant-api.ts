/**
 * 渲染进程可访问的 preload API 类型。
 *
 * 这是 window.assistant 的唯一类型合同；preload 暴露方法变化时必须同步维护这里。
 */

import type {
  AiChatRequest,
  AiChatResponse,
  AiConfigResult,
  AiProviderConfig,
  AiRuntimeConfig,
  AttentionEvent,
  CliCommandRequest,
  CliCommandResult,
  FieFocus,
  FieResult,
  ListRemindersOptions,
  Reminder,
  ReminderUpdatePayload,
  RespondReminderInput,
  FieRunDetail,
  FieRunSummary,
  IngestBatchResult,
  IngestResult,
  KnowledgeCategory,
  KnowledgeNote,
  KnowledgeSearchResult,
  KnowledgeTag,
  PluginInfo,
  TabLayout,
  TrendPoint,
} from './types';


export interface WhiteboardAttachmentInput {
  name: string;
  mime: string;
  dataUrl: string;
}

export type WhiteboardAttachmentSaveResult =
  | { success: true; id: string; name: string; mime: string; size: number; filename: string; thumbnailFilename?: string }
  | { success: false; error: string };

export type SuccessResult = { success: boolean };
export type StrictSuccessResult = { success: true } | { success: false; error: string };

export interface AiStreamHandle {
  streamId: string;
  promise: Promise<AiChatResponse>;
  cancel: () => Promise<SuccessResult>;
}

export interface TerminalCreateResult {
  id: string;
  tmuxName: string | null;
}

export interface TerminalPersistedSession {
  tmuxName: string;
  title: string;
  sortOrder: number;
}

export interface AssistantApi {
  expandBall: () => void;
  collapseBall: () => void;
  togglePanelMaximize: () => Promise<boolean>;
  showBallContextMenu: () => void;
  quitBall: () => void;
  moveWindow: (dx: number, dy: number) => void;
  panelReady: () => void;
  openDevTools: () => void;

  listPlugins: () => Promise<PluginInfo[]>;
  greet: (name: string) => Promise<SuccessResult>;
  calculate: (expression: string) => Promise<string>;
  devUtils: (action: string, ...args: any[]) => Promise<any>;

  getWhiteboardState: () => Promise<string | null>;
  saveWhiteboardState: (state: string) => Promise<SuccessResult>;
  saveWhiteboardAttachment: (input: WhiteboardAttachmentInput) => Promise<WhiteboardAttachmentSaveResult>;
  getWhiteboardAttachment: (filename: string, mime?: string) => Promise<string | null>;
  openWhiteboardAttachmentsDir: () => Promise<SuccessResult>;
  openWhiteboardAttachment: (filename: string) => Promise<StrictSuccessResult>;
  showWhiteboardAttachmentInFolder: (filename: string) => Promise<StrictSuccessResult>;

  getNotes: (categoryId?: string, tagId?: string) => Promise<KnowledgeNote[]>;
  searchNotes: (keyword: string) => Promise<KnowledgeSearchResult>;
  createNote: (title: string, content: string, categoryId: string, tagIds: string[]) => Promise<any>;
  updateNote: (noteId: string, title: string, content: string, categoryId: string, tagIds: string[]) => Promise<any>;
  deleteNote: (noteId: string) => Promise<any>;
  getCategories: () => Promise<KnowledgeCategory[]>;
  createCategory: (name: string, color?: string) => Promise<any>;
  deleteCategory: (categoryId: string) => Promise<any>;
  getTags: () => Promise<KnowledgeTag[]>;
  createTag: (name: string) => Promise<any>;
  deleteTag: (tagId: string) => Promise<any>;

  focus: {
    ingest: (event: AttentionEvent) => Promise<FieResult<IngestResult>>;
    ingestBatch: (events: AttentionEvent[]) => Promise<FieResult<IngestBatchResult>>;
    listFocuses: (options?: { limit?: number; includeArchived?: boolean }) => Promise<FieResult<FieFocus[]>>;
    listRuns: (limit?: number) => Promise<FieResult<FieRunSummary[]>>;
    getRun: (id: string) => Promise<FieResult<FieRunDetail>>;
    trend: (options?: { days?: number; focusId?: string }) => Promise<FieResult<TrendPoint[]>>;
    health: () => Promise<FieResult<{ ok: boolean; service: string }>>;
  };

  reminder: {
    list: (options?: ListRemindersOptions) => Promise<Reminder[]>;
    get: (id: string) => Promise<Reminder | null>;
    respond: (input: RespondReminderInput) => Promise<Reminder>;
    dismiss: (id: string) => Promise<Reminder>;
    onUpdate: (callback: (payload: ReminderUpdatePayload) => void) => () => void;
  };

  ai: {
    listProviders: () => Promise<AiProviderConfig[]>;
    getRuntimeConfig: () => Promise<AiRuntimeConfig>;
    upsertProvider: (provider: Omit<AiProviderConfig, 'createdAt' | 'updatedAt'>) => Promise<AiConfigResult>;
    deleteProvider: (providerId: string) => Promise<AiConfigResult>;
    updateRuntimeConfig: (config: AiRuntimeConfig) => Promise<AiConfigResult>;
    chat: (request: AiChatRequest) => Promise<AiChatResponse>;
    chatStream: (request: AiChatRequest, onChunk: (chunk: string) => void, onReasoning?: (chunk: string) => void) => AiStreamHandle;
  };

  cli: {
    execute: (request: CliCommandRequest) => Promise<CliCommandResult>;
  };

  ui: {
    getTabLayout: () => Promise<TabLayout>;
    saveTabLayout: (layout: TabLayout) => Promise<SuccessResult>;
  };

  terminal: {
    create: (options?: { cols?: number; rows?: number; restoreTmuxName?: string }) => Promise<TerminalCreateResult>;
    write: (id: string, data: string) => void;
    resize: (id: string, cols: number, rows: number) => void;
    dispose: (id: string) => void;
    list: () => Promise<TerminalPersistedSession[]>;
    save: (sessions: TerminalPersistedSession[]) => Promise<SuccessResult>;
    onData: (id: string, callback: (data: string) => void) => () => void;
    onExit: (id: string, callback: (exitCode: number, signal?: number) => void) => () => void;
  };

  takeScreenshot: () => Promise<{ success: boolean; filePath?: string; error?: string }>;

  getVersion: () => string;
  log: (level: string, scope: string, message: string, meta?: Record<string, unknown>) => Promise<SuccessResult>;
  openLogsDir: () => Promise<SuccessResult>;
  getLogPath: () => Promise<string | null>;
  readRecentLogs: (lines?: number) => Promise<string[]>;
  clearLogs: () => Promise<SuccessResult>;
}

declare global {
  interface Window {
    assistant: AssistantApi;
  }
}

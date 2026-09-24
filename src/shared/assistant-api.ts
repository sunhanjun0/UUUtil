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
  ClipboardItem,
  ClipboardUpdatePayload,
  CreateTodoInput,
  CreateTodoListInput,
  FieFocus,
  FieResult,
  ListClipboardOptions,
  ListRemindersOptions,
  ListTodosOptions,
  Reminder,
  SpeechGatewayHealth,
  SpeechSynthesizeInput,
  SpeechSynthesizeResult,
  SpeechTranscribeInput,
  SpeechTranscribeResult,
  SpeechVoiceItem,
  ReminderUpdatePayload,
  RespondReminderInput,
  FieRunDetail,
  FieRunSummary,
  IngestBatchResult,
  IngestResult,
  KnowledgeCategory,
  KnowledgeLibraryResult,
  KnowledgeNote,
  KnowledgeSearchResult,
  KnowledgeTag,
  MulticaBridgeResult,
  MulticaIssueSummary,
  PluginInfo,
  PluginStateResult,
  PullMulticaTodoInput,
  PullMulticaTodoResult,
  RegisteredPluginInfo,
  TabLayout,
  Todo,
  TodoList,
  TodoUpdatePayload,
  TrendPoint,
  UpdateTodoInput,
  UpdateTodoListInput,
} from './types';
import type { BallMenuGeometry } from './ball-menu';


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
  /** 打开/关闭悬浮球环形菜单；打开时返回菜单几何信息，关闭返回 null */
  setBallMenuOpen: (open: boolean) => Promise<BallMenuGeometry | null>;
  /** 主进程因窗口失焦自动收起环形菜单时通知渲染层同步状态；返回取消订阅函数 */
  onBallMenuClosed: (callback: () => void) => () => void;
  togglePanelMaximize: () => Promise<boolean>;
  showBallContextMenu: () => void;
  quitBall: () => void;
  moveWindow: (dx: number, dy: number) => void;
  panelReady: () => void;
  openDevTools: () => void;

  listPlugins: () => Promise<PluginInfo[]>;
  /** 列出所有注册插件（含禁用 / 未加载），用于插件管理界面 */
  listRegisteredPlugins: () => Promise<RegisteredPluginInfo[]>;
  /** 启用 / 禁用插件：禁用即时 deactivate，启用下次启动生效 */
  setPluginEnabled: (id: string, enabled: boolean) => Promise<PluginStateResult>;
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
  /** 本地笔记 + OpenViking 共享库联合检索 */
  searchKbLibrary: (keyword: string) => Promise<KnowledgeLibraryResult>;
  /** 读取共享库 Viking URI 正文，不可达/失败为 null */
  readKbOvContent: (uri: string) => Promise<string | null>;
  createNote: (title: string, content: string, categoryId: string, tagIds: string[]) => Promise<any>;
  updateNote: (noteId: string, title: string, content: string, categoryId: string, tagIds: string[]) => Promise<any>;
  deleteNote: (noteId: string) => Promise<any>;
  getCategories: () => Promise<KnowledgeCategory[]>;
  createCategory: (name: string, color?: string) => Promise<any>;
  deleteCategory: (categoryId: string) => Promise<any>;
  getTags: () => Promise<KnowledgeTag[]>;
  createTag: (name: string) => Promise<any>;
  deleteTag: (tagId: string) => Promise<any>;

  // ===== 语音实验室 Speech API =====
  speech: {
    health: () => Promise<SpeechGatewayHealth>;
    voices: () => Promise<SpeechVoiceItem[]>;
    synthesize: (input: SpeechSynthesizeInput) => Promise<SpeechSynthesizeResult>;
    transcribe: (input: SpeechTranscribeInput) => Promise<SpeechTranscribeResult>;
    getConfig: () => Promise<{ baseUrl: string; apiKeySet: boolean }>;
    setConfig: (input: { baseUrl?: string; apiKey?: string }) => Promise<{ updated: string[]; config: { baseUrl: string; apiKeySet: boolean } }>;
  };

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

  todo: {
    list: (options?: ListTodosOptions) => Promise<Todo[]>;
    get: (id: string) => Promise<Todo | null>;
    create: (input: CreateTodoInput) => Promise<Todo>;
    update: (id: string, patch: UpdateTodoInput) => Promise<Todo>;
    remove: (id: string) => Promise<void>;
    done: (id: string) => Promise<Todo>;
    reopen: (id: string) => Promise<Todo>;
    listLists: () => Promise<TodoList[]>;
    createList: (input: CreateTodoListInput) => Promise<TodoList>;
    updateList: (id: string, patch: UpdateTodoListInput) => Promise<TodoList>;
    removeList: (id: string) => Promise<void>;
    /** 按外部链接精确查询（Multica 投影「已拉入 IN LOG」判定数据源）。 */
    getByExternalRef: (ref: string) => Promise<Todo | null>;
    /** MULTICA 投影分组数据源：当前成员名下 todo/in_progress 的 issue；Multica 不可用 ok:false。 */
    multicaList: () => Promise<MulticaBridgeResult<MulticaIssueSummary[]>>;
    multicaGet: (id: string) => Promise<MulticaBridgeResult<MulticaIssueSummary>>;
    /** ⇩ 拉入：create+link 一步到位；已拉入/数据非法返回 ok:false，不抛出。 */
    multicaPull: (input: PullMulticaTodoInput) => Promise<PullMulticaTodoResult>;
    /** 系统浏览器打开对应 Multica issue；app_url 不可解析时 ok:false。 */
    multicaOpen: (issueId: string) => Promise<MulticaBridgeResult<null>>;
    onUpdate: (callback: (payload: TodoUpdatePayload) => void) => () => void;
  };

  clipboard: {
    list: (options?: ListClipboardOptions) => Promise<ClipboardItem[]>;
    get: (id: string) => Promise<ClipboardItem | null>;
    thumbnail: (id: string) => Promise<string | null>;
    copy: (id: string) => Promise<ClipboardItem>;
    togglePin: (id: string) => Promise<ClipboardItem>;
    remove: (id: string) => Promise<{ removed: number }>;
    clear: () => Promise<{ cleared: number }>;
    openFile: (id: string) => Promise<{ opened: boolean }>;
    showInFolder: (id: string) => Promise<{ showed: boolean }>;
    onUpdate: (callback: (payload: ClipboardUpdatePayload) => void) => () => void;
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

/**
 * 共享类型 —— 所有插件和核心模块共同使用的类型定义
 */

/** 插件清单 */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

/** 事件日志条目 */
export interface EventLogEntry {
  event: string;
  payload?: string;
  timestamp: string;
}

/** AI 消息角色 */
export type AiMessageRole = 'system' | 'user' | 'assistant';

export type AiMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format?: string } };

/** AI 对话消息 */
export interface AiMessage {
  role: AiMessageRole;
  content: string | AiMessageContentPart[];
}

/** AI Provider 类型 */
export type AiProviderType = 'openai-compatible' | 'custom';

/** AI Provider 配置 */
export interface AiProviderConfig {
  id: string;
  name: string;
  type: AiProviderType;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** AI 默认模型与参数配置 */
export interface AiRuntimeConfig {
  defaultProviderId?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** AI 文本生成请求 */
export interface AiChatRequest {
  messages: AiMessage[];
  providerId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** AI 文本生成响应 */
export interface AiChatResponse {
  success: boolean;
  content?: string;
  reasoning?: string;
  providerId?: string;
  model?: string;
  finishReason?: string;
  error?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  durationMs?: number;
}

/** AI 配置保存结果 */
export interface AiConfigResult {
  success: boolean;
  error?: string;
}

/** CLI 命令执行请求 */
export interface CliCommandRequest {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

/** CLI 命令执行结果 */
export interface CliCommandResult {
  success: boolean;
  command: string;
  cwd: string;
  exitCode?: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
  error?: string;
}

/** hello-world 插件对外暴露的数据 */
export interface HelloWorldApi {
  greet(name: string): string;
}

/** calculator 插件对外暴露的数据 */
export interface CalculatorApi {
  calculate(expression: string): string;
}

/** dev-utils 插件对外暴露的数据 */
export interface DevUtilsApi {
  jsonFormat(input: string): { success: boolean; output: string };
  sqlFormat(input: string): { success: boolean; output: string };
  sqlCompress(input: string): { success: boolean; output: string };
  base64Encode(input: string): string;
  base64Decode(input: string): { success: boolean; output: string };
  timestampToDate(ts: string): { success: boolean; output: string };
  dateToTimestamp(dateStr: string): { success: boolean; output: string };
  regexTest(pattern: string, text: string, flags: string): { success: boolean; matches: string[]; error?: string };
  uuidGenerate(version: 'v4' | 'v7'): string;
}

/** 知识库笔记 */
export interface KnowledgeNote {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** 知识库分类 */
export interface KnowledgeCategory {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

/** 知识库标签 */
export interface KnowledgeTag {
  id: string;
  name: string;
  createdAt: string;
}

/** 知识库搜索结果 */
export interface KnowledgeSearchResult {
  notes: KnowledgeNote[];
  total: number;
}

/** knowledge-base 插件对外暴露的 API */
export interface KnowledgeBaseApi {
  createNote(title: string, content: string, categoryId: string, tagIds: string[]): { success: boolean; noteId?: string; error?: string };
  updateNote(noteId: string, title: string, content: string, categoryId: string, tagIds: string[]): { success: boolean; error?: string };
  deleteNote(noteId: string): { success: boolean; error?: string };
  getNotes(categoryId?: string, tagId?: string): KnowledgeNote[];
  searchNotes(keyword: string): KnowledgeSearchResult;
  createCategory(name: string, color?: string): { success: boolean; categoryId?: string; error?: string };
  getCategories(): KnowledgeCategory[];
  deleteCategory(categoryId: string): { success: boolean; error?: string };
  createTag(name: string): { success: boolean; tagId?: string; error?: string };
  getTags(): KnowledgeTag[];
  deleteTag(tagId: string): { success: boolean; error?: string };
}

// ==================== 焦点管理类型 ====================
// 核心概念：焦点由 FIE (Focus Ingestion Engine) 通过事件摄取自动归因产生。
// 应用侧不再手动管理焦点，只做只读展示 + 事件摄取代理。

/** FIE 统一返回结构：网络不可达时 offline=true，供 UI 优雅降级。 */
export type FieResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; offline?: boolean };

/** 摄取接口的请求体。source + sourceEventId 组成幂等键。 */
export interface AttentionEvent {
  /** 事件来源，如 codex / git-hook / ci / agent */
  source: string;
  /** 来源内唯一的事件 ID，与 source 组成幂等键 */
  sourceEventId: string;
  /** ISO 8601 且带时区偏移，如 2026-07-09T09:00:00+08:00 */
  occurredAt: string;
  /** 形如 domain.action 的事件类型，如 conversation.finished */
  type: string;
  /** 项目名，命中候选 Focus 项目名时贡献最高权重 */
  project?: string;
  /** 一句话摘要，参与关键词提取，写入前脱敏 */
  summary?: string;
  /** 原始正文，按隐私模式决定是否保留，不会出现在查询响应中 */
  content?: string;
  /** 任意键值，其中 files（字符串数组）用于文件维度跨工具匹配 */
  metadata?: Record<string, unknown> & { files?: string[] };
}

export type FieDecision = 'skip' | 'check_in' | 'create_and_check_in' | null;

/** /v1/events/ingest 的响应体。 */
export interface IngestResult {
  status: 'accepted' | 'duplicate';
  deduplicated: boolean;
  decision: FieDecision;
  focusId: string | null;
  runId: string;
  reason: string | null;
  lowConfidence: boolean;
}

/** 批量摄取结果，每条 results[] 另带 source/sourceEventId。 */
export interface IngestBatchResult {
  status: 'accepted';
  accepted: number;
  duplicates: number;
  failed: number;
  results: Array<IngestResult & { source: string; sourceEventId: string; error?: string }>;
}

/** FIE Focus 对象（查询返回，snake_case 忠实于接口）。 */
export interface FieFocus {
  id: string;
  name: string;
  project: string | null;
  keywords: string[];
  status: string;
  merged_into: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

/** ingestion run 列表项。 */
export interface FieRunSummary {
  id: string;
  status: string;
  decision: FieDecision;
  reason: string | null;
  source: string;
  source_event_id: string;
  event_type: string;
  occurred_at: string;
  created_at: string;
}

/** run 决策候选。 */
export interface FieRunCandidate {
  id: string;
  name: string;
  score: number;
  reason: string;
}

/** run 内脱敏后的事件。 */
export interface FieRunEvent {
  id: string;
  source: string;
  sourceEventId: string;
  occurredAt: string;
  type: string;
  project: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** run 产生的 check-in。 */
export interface FieRunCheckin {
  id: string;
  notes: string | null;
  blocker: string | null;
  nextAction: string | null;
  createdAt: string;
  focus: { id: string; name: string; project: string | null } | null;
}

/** 单次 run 详情。 */
export interface FieRunDetail {
  id: string;
  status: string;
  decision: FieDecision;
  reason: string | null;
  candidates: FieRunCandidate[];
  error: string | null;
  created_at: string;
  updated_at: string;
  event: FieRunEvent | null;
  checkin: FieRunCheckin | null;
}

/** 活跃度趋势的单日聚合点。 */
export interface TrendPoint {
  date: string;
  checkins: number;
  focuses: number;
}

/** focus 插件对外 API（FIE 客户端薄封装）。 */
export interface FocusApi {
  ingest(event: AttentionEvent): Promise<FieResult<IngestResult>>;
  ingestBatch(events: AttentionEvent[]): Promise<FieResult<IngestBatchResult>>;
  listFocuses(options?: { limit?: number; includeArchived?: boolean }): Promise<FieResult<FieFocus[]>>;
  listRuns(limit?: number): Promise<FieResult<FieRunSummary[]>>;
  getRun(id: string): Promise<FieResult<FieRunDetail>>;
  getTrend(options?: { days?: number; focusId?: string }): Promise<FieResult<TrendPoint[]>>;
  health(): Promise<FieResult<{ ok: boolean; service: string }>>;
}

/** 前台 TAB 栏布局配置：order 为路径顺序，hidden 为隐藏的路径集合（均以路由 path 为标识）。 */
export interface TabLayout {
  order: string[];
  hidden: string[];
}

// ===== Reminder（提醒框架）=====

/** 提醒类型：告知 vs 需处理。 */
export type ReminderType = 'info' | 'action';

/** 严重级别，UI 后续阶段用来分色/排序。 */
export type ReminderSeverity = 'info' | 'warning' | 'error';

/** 提醒状态。阶段 1 只会出现 active；done/dismissed 待后续阶段接入。 */
export type ReminderStatus = 'active' | 'done' | 'dismissed';

/** ask 类型提醒可以带一组按钮，供面板/CLI 联动响应。 */
export interface ReminderAction {
  id: string;
  label: string;
  /** default | primary | danger，仅用于按钮视觉。 */
  style?: 'default' | 'primary' | 'danger';
  /** 是否要求填写理由（面板会展开 textarea）。 */
  requiresReason?: boolean;
}

/** 用户响应 ask 后写入的结果快照。 */
export interface ReminderResponse {
  actionId: string;
  reason?: string;
  respondedAt: string;
}

/** 一条提醒对象（面板/CLI 读取时返回）。 */
export interface Reminder {
  id: string;
  source: string;
  key: string | null;
  type: ReminderType;
  severity: ReminderSeverity;
  title: string;
  body: string | null;
  status: ReminderStatus;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  metadata: Record<string, unknown> | null;
  /** 仅 ask 类型可能有；notify 直接为 null。 */
  actions: ReminderAction[] | null;
  /** 已响应 / 已忽略后才有值。 */
  response: ReminderResponse | null;
}

/** 创建一条提醒的入参。 */
export interface CreateReminderInput {
  source: string;
  title: string;
  type?: ReminderType;
  severity?: ReminderSeverity;
  body?: string;
  key?: string;
  metadata?: Record<string, unknown>;
}

/** 列表查询选项。 */
export interface ListRemindersOptions {
  status?: ReminderStatus;
  limit?: number;
}

/** create 返回值：包含实际写入 / 复用的 reminder，以及是否命中去重。 */
export interface CreateReminderResult {
  reminder: Reminder;
  deduped: boolean;
}

/** ask 命令入参。type 强制为 action，`actions` 必填。 */
export interface AskReminderInput {
  source: string;
  title: string;
  actions: ReminderAction[];
  severity?: ReminderSeverity;
  body?: string;
  key?: string;
  metadata?: Record<string, unknown>;
  /** 阻塞等待秒数，默认 300，上限 3600。 */
  timeoutSec?: number;
}

/** ask 命令的三种终态返回。 */
export type AskReminderResult =
  | {
      status: 'responded';
      reminderId: string;
      actionId: string;
      reason: string | null;
      respondedAt: string;
    }
  | {
      status: 'timeout';
      reminderId: string;
    }
  | {
      status: 'superseded';
      reminderId: string;
    }
  | {
      status: 'dismissed';
      reminderId: string;
    };

/** respond 命令入参，也用于面板 IPC。 */
export interface RespondReminderInput {
  id: string;
  actionId: string;
  reason?: string;
}

/** 主进程 → 渲染进程的 reminder 变更事件负载。 */
export interface ReminderUpdatePayload {
  activeActionCount: number;
  lastInfoAt: string | null;
  reason: 'notify' | 'ask' | 'respond' | 'dismiss';
  type: ReminderType;
  deduped: boolean;
}

/** reminder 插件对外 API。 */
export interface ReminderApi {
  create(input: CreateReminderInput): CreateReminderResult;
  createAsk(input: AskReminderInput): { reminder: Reminder; deduped: boolean; supersededId: string | null };
  respond(input: RespondReminderInput): Reminder;
  dismiss(id: string): Reminder;
  list(options?: ListRemindersOptions): Reminder[];
  get(id: string): Reminder | null;
  countActiveActions(): number;
}

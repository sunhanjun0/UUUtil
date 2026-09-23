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

/** `_plugins` 表中的注册插件信息（含禁用 / 未加载的插件） */
export interface RegisteredPluginInfo {
  id: string;
  name: string;
  version: string;
  /** _plugins.enabled 开关状态 */
  enabled: boolean;
  /** 当前会话是否已加载并激活 */
  loaded: boolean;
}

/** setPluginEnabled 的执行结果 */
export interface PluginStateResult {
  id: string;
  enabled: boolean;
  /** 是否同步调用了 deactivate()（仅禁用已激活插件时为 true） */
  deactivated: boolean;
  /** immediate=运行时即时生效；on-restart=下次启动生效 */
  applied: 'immediate' | 'on-restart';
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

/** OpenViking 共享库检索命中项（跨 HANJUN account 的 memories/resources） */
export interface OvLibraryHit {
  uri: string;
  contextType: string;
  score: number;
  title: string;
  abstract: string;
}

/** 本地笔记 + OpenViking 共享库的联合检索结果 */
export interface KnowledgeLibraryResult {
  local: KnowledgeSearchResult;
  /** OpenViking 不可达时为 null（页面只展示本地结果） */
  ov: OvLibraryHit[] | null;
}

/** knowledge-base 插件对外暴露的 API */
export interface KnowledgeBaseApi {
  createNote(title: string, content: string, categoryId: string, tagIds: string[]): { success: boolean; noteId?: string; error?: string };
  updateNote(noteId: string, title: string, content: string, categoryId: string, tagIds: string[]): { success: boolean; error?: string };
  deleteNote(noteId: string): { success: boolean; error?: string };
  getNotes(categoryId?: string, tagId?: string): KnowledgeNote[];
  /** 语义优先（OpenViking 可达时），不可达回落本地 LIKE */
  searchNotes(keyword: string): Promise<KnowledgeSearchResult>;
  /** 本地笔记 + OpenViking 共享库联合检索 */
  searchLibrary(keyword: string): Promise<KnowledgeLibraryResult>;
  /** 读取共享库某条 Viking URI 的正文，不可达/失败返回 null */
  readOvContent(uri: string): Promise<string | null>;
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
  agentId: string | null;
  topic: string | null;
  stage: 'propose' | 'progress' | 'done' | 'blocked' | 'info' | 'stale' | null;
  priority: 'normal' | 'high' | null;
  project: string | null;
  history: any[] | null;
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

/** syncKeyedReminders 的单条输入：同一 source 下以 key 去重的一条提醒内容。 */
export interface SyncReminderItem {
  /** 同 source 内的去重键，必填；空串 / 重复 key 会被跳过。 */
  key: string;
  title: string;
  type?: ReminderType;
  severity?: ReminderSeverity;
  body?: string;
  metadata?: Record<string, unknown>;
}

/** syncKeyedReminders 的 reconcile 结果计数。 */
export interface SyncRemindersResult {
  /** 新建的 active 提醒数。 */
  created: number;
  /** 命中去重且内容有变化、被更新的提醒数（内容无变化会跳过写入，不计入）。 */
  updated: number;
  /** 反向核对关闭的提醒数（该 source 下不在本次集合里的 active 提醒）。 */
  dismissed: number;
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
  /**
   * 把一个 source 的 keyed 活跃提醒集合 reconcile 成与 items 完全一致：
   * 集合内的 upsert（按 source+key 去重，内容无变化跳过写入），
   * 不在集合内的 active 提醒（含无 key 的）全部 dismiss。
   * 供周期巡查类来源（如 todo 到期巡查）全量同步：重启安全、无内存态依赖。
   */
  syncKeyedReminders(source: string, items: SyncReminderItem[]): SyncRemindersResult;
  agentUpdate(input: any): Reminder;
  agentQuery(topic: string): Reminder | null;
  agentClose(topic: string, result: 'done' | 'cancelled' | 'superseded'): Reminder;
  _agentWaiters: Map<string, any>;
  _setAgentWaiter(topic: string, resolveFn: any, timeoutMs: number): void;
}

// ===== Clipboard（剪贴板历史）=====

/** 剪贴板条目类型。文本 / 富文本(HTML) / 图片 / 文件引用。 */
export type ClipboardKind = 'text' | 'richtext' | 'image' | 'file';

/**
 * 剪贴板条目按类型携带的附加元数据（仅 richtext/image/file 有，text 为 undefined）。
 * 不入库为独立列，整体 JSON 序列化进 `meta_json`。
 */
export interface ClipboardItemMeta {
  /** richtext：原始 HTML（截断保护），回贴富文本编辑器时使用。 */
  html?: string;
  /** image：落盘图片的元数据（文件名 + 缩略图 + 尺寸 + 字节数 + mime）。 */
  image?: {
    filename: string;
    thumbFilename: string;
    width: number;
    height: number;
    sizeBytes: number;
    /** 图片 MIME，目前固定 image/png（Electron toPNG 统一编码）。 */
    mime: string;
  };
  /** file：单文件引用元数据（路径 + 名 + 大小 + 是否目录）。不复制文件内容。 */
  file?: {
    path: string;
    name: string;
    sizeBytes: number;
    isDir: boolean;
  };
}

/** 一条剪贴板历史记录（面板 / CLI 读取时返回）。 */
export interface ClipboardItem {
  id: string;
  /**
   * 文本表示，口径随 kind 变化：
   * text → 纯文本；richtext → 去格式纯文本（供搜索/预览）；image → 空串；file → 文件名（预览用）。
   */
  content: string;
  kind: ClipboardKind;
  /** 长度口径随 kind 变化：text/richtext=字符数；image=字节数；file=1。 */
  length: number;
  /** 是否置顶/收藏（置顶项不受上限清理影响）。 */
  pinned: boolean;
  /** 被复制回剪贴板的次数。 */
  copyCount: number;
  /** 首次记录时间（ISO）。 */
  createdAt: string;
  /** 最近一次被复制/复用的时间（ISO），用于排序。 */
  lastUsedAt: string;
  /** 按 kind 携带的附加元数据；text 为 undefined。 */
  meta?: ClipboardItemMeta;
}

/** 列表查询选项。 */
export interface ListClipboardOptions {
  /** 关键字模糊搜索（content LIKE %keyword%）。 */
  keyword?: string;
  /** 仅返回置顶项。 */
  pinnedOnly?: boolean;
  /** 按类型筛选。 */
  kind?: ClipboardKind;
  /** 返回条数上限，默认 100，最大 500。 */
  limit?: number;
}

/** clipboard.record 的返回值：实际写入/复用的条目，以及是否命中去重。 */
export interface RecordClipboardResult {
  item: ClipboardItem;
  deduped: boolean;
}

/** 主进程 → 渲染进程的剪贴板变更事件负载。 */
export interface ClipboardUpdatePayload {
  reason: 'record' | 'copy' | 'pin' | 'remove' | 'clear';
  /** 变更后当前总条数。 */
  total: number;
}

/** clipboard 插件对外 API。 */
export interface ClipboardApi {
  /** 记录一段纯文本（内部去重 + 上限清理 + 敏感过滤）。返回 null 表示被过滤/为空。 */
  record(content: string): RecordClipboardResult | null;
  /** 记录富文本（纯文本 + HTML），回贴时同时写 text+html。 */
  recordRichText(plain: string, html: string): RecordClipboardResult | null;
  /** 记录图片（NativeImage），落盘 + 缩略图。 */
  recordImage(image: import('electron').NativeImage): RecordClipboardResult | null;
  /** 记录单文件引用（不复制内容）。 */
  recordFile(filePath: string): RecordClipboardResult | null;
  list(options?: ListClipboardOptions): ClipboardItem[];
  get(id: string): ClipboardItem | null;
  /** 把某条内容写回系统剪贴板（按 kind 分支），并刷新 copyCount / lastUsedAt。 */
  copyToClipboard(id: string): ClipboardItem;
  /** 读取图片历史项的缩略图 data URL，非图片项返回 null。 */
  readThumbnail(id: string): string | null;
  togglePin(id: string): ClipboardItem;
  remove(id: string): void;
  /** 清空非置顶历史（含落盘图片文件清理）。 */
  clear(): number;
  count(): number;
}

// ===== Todo（事项管理）=====

/** 事项状态。 */
export type TodoStatus = 'todo' | 'doing' | 'done' | 'cancelled';

/** 子任务（整体 JSON 序列化进 todos.subtasks）。 */
export interface TodoSubtask {
  id: string;
  title: string;
  done: boolean;
}

/** 一条事项（面板 / CLI 读取时返回）。 */
export interface Todo {
  id: string;
  title: string;
  note: string | null;
  status: TodoStatus;
  /** 0 无 / 1 低 / 2 中 / 3 高。 */
  priority: number;
  /** ISO 日期或日期时间，可空；date 过滤按 date(due_at) 比较。 */
  dueAt: string | null;
  /** 所属清单；null = 收集箱。 */
  listId: string | null;
  tags: string[];
  subtasks: TodoSubtask[];
  sortOrder: number;
  completedAt: string | null;
  /** 外部系统链接，形如 multica:<issue-uuid>:<identifier>；null = 原生事项。 */
  externalRef: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 一个清单；listLists 返回时附带 openCount（未完成任务计数）。 */
export interface TodoList {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  /** 仅 listLists 返回时填充：status 为 todo/doing 的事项数。 */
  openCount?: number;
}

/** 创建事项入参。 */
export interface CreateTodoInput {
  title: string;
  note?: string;
  priority?: number;
  dueAt?: string | null;
  listId?: string | null;
  tags?: string[];
  subtasks?: TodoSubtask[];
}

/** 更新事项入参：undefined = 不动；note/dueAt/listId 传 null = 清空（listId null = 移回收集箱）。 */
export interface UpdateTodoInput {
  title?: string;
  note?: string | null;
  status?: TodoStatus;
  priority?: number;
  dueAt?: string | null;
  listId?: string | null;
  tags?: string[];
  subtasks?: TodoSubtask[];
  sortOrder?: number;
}

/** 创建清单入参。 */
export interface CreateTodoListInput {
  name: string;
  color?: string;
}

/** 更新清单入参：color 传 null = 清空。 */
export interface UpdateTodoListInput {
  name?: string;
  color?: string | null;
  sortOrder?: number;
}

/** 事项列表查询选项。 */
export interface ListTodosOptions {
  /**
   * today：未完成且 due_at 不晚于 date（默认今天，含逾期）；
   * inbox：收集箱（list_id 为空）；all：全部（默认不含 done/cancelled）；done：仅已完成。
   */
  view?: 'today' | 'inbox' | 'all' | 'done';
  /** 指定日筛选（YYYY-MM-DD）；today 视图作为基准日，其余视图按 due_at 当日精确匹配。 */
  date?: string;
  /** 按清单过滤。 */
  listId?: string;
  /** 默认排除 done/cancelled；为 true 时包含全部状态（done 视图除外）。 */
  includeDone?: boolean;
}

/**
 * 到期巡查同步给提醒中心的一条事项快照：bus `todo:due-scan` 的载荷元素。
 * reminder 插件以 (source='todo', key=id) upsert；title/body/severity 由 todo 侧组装好，
 * reminder 侧只做落库，不再加工文案。
 */
export interface TodoDueReminderItem {
  /** 事项 id，作为提醒的去重键。 */
  id: string;
  /** 提醒标题（含「已逾期：/今日到期：」前缀）。 */
  title: string;
  /** 提醒正文（截止时间 + 优先级）。 */
  body: string;
  severity: ReminderSeverity;
  dueAt: string;
  priority: number;
  /** true = 截止日早于本地今天（已逾期）；false = 本地今天到期。 */
  overdue: boolean;
}

/**
 * todo 插件到期巡查的全量快照：每次巡查广播当前「已到期且未完成」的完整集合，
 * reminder 插件据此 reconcile（集合外的本 source active 提醒全部关闭）。
 */
export interface TodoDueScanPayload {
  scannedAt: string;
  items: TodoDueReminderItem[];
}

/**
 * todo 数据变更载荷：bus `todo:changed` 与 IPC 广播 `todo:update` 共用同一形状，
 * 渲染层据此刷新列表；origin=cli 且 reason=create 时触发 COM 灯闪 + 新行滑入动效。
 */
export interface TodoUpdatePayload {
  /** 变更原因；lists = 清单增删改。 */
  reason: 'create' | 'update' | 'done' | 'reopen' | 'remove' | 'lists';
  /** 触发来源：panel = 面板 IPC；cli = 外部 CLI 写入。 */
  origin: 'panel' | 'cli';
  /** 相关事项 id（remove 为被删 id；lists 为清单 id，可空）。 */
  id?: string;
}

/** todo 插件对外 API。 */
export interface TodoApi {
  create(input: CreateTodoInput): Todo;
  get(id: string): Todo | null;
  update(id: string, patch: UpdateTodoInput): Todo;
  remove(id: string): void;
  /** todo/doing → done，写入 completedAt；其他状态抛错。 */
  done(id: string): Todo;
  /** done/cancelled → todo，清空 completedAt；其他状态抛错。 */
  reopen(id: string): Todo;
  list(options?: ListTodosOptions): Todo[];
  /**
   * 已到期且未完成（todo/doing）的事项，按 due_at 升序。
   * 「到期」以 epoch 比较：date-only（YYYY-MM-DD）按本地零点计，避免 sqlite date() 的 UTC 偏差。
   */
  listDue(now: Date): Todo[];
  /** 绑定外部链接（形如 multica:<issue-uuid>:HANJ-123）；同一 ref 已被其他事项占用时抛错。 */
  linkExternal(id: string, ref: string): Todo;
  /** 解除外部链接（externalRef 置 null）。 */
  unlinkExternal(id: string): Todo;
  /** 按外部链接精确查询（拉入防双拉的数据源）；ref 为空返回 null。 */
  getByExternalRef(ref: string): Todo | null;
  createList(input: CreateTodoListInput): TodoList;
  updateList(id: string, patch: UpdateTodoListInput): TodoList;
  /** 删除清单；清单内事项移回收集箱。 */
  removeList(id: string): void;
  listLists(): TodoList[];
}

// ===== Multica 桥接（todo × Multica 打通）=====

/** 桥接层返回的 Multica issue 摘要：投影分组与链接所需字段子集，已 camelCase 化。 */
export interface MulticaIssueSummary {
  id: string;
  /** 识别号，如 HANJ-123。 */
  identifier: string;
  title: string;
  status: string;
  /** urgent / high / medium / low / none。 */
  priority: string;
  projectId: string | null;
  /** 截止日期（YYYY-MM-DD），可空。 */
  dueAt: string | null;
  updatedAt: string;
}

/** 桥接调用结果：错误内化，永不抛出；CLI 缺失/未认证/超时一律 { ok:false, error }。 */
export type MulticaBridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** createIssue 入参（Stage 4 升级链路使用）。 */
export interface CreateMulticaIssueInput {
  title: string;
  description?: string;
  /** Multica 项目 UUID；不传走 CLI 默认落点。 */
  project?: string;
}

/**
 * multica 桥接层接口：主进程 spawn 本机 multica CLI（复用已认证凭据），
 * todo 插件经 api.ts 出口暴露；超时 ≤15s，错误内化，Multica 不可用时静默降级。
 */
export interface MulticaBridgeApi {
  /** 当前成员名下 todo/in_progress 状态的 issue（投影分组数据源）。 */
  listAssignedIssues(): Promise<MulticaBridgeResult<MulticaIssueSummary[]>>;
  getIssue(id: string): Promise<MulticaBridgeResult<MulticaIssueSummary>>;
  /** 回写评论；正文尾部统一追加「——代驾驶舱回写」标注。 */
  addComment(issueId: string, body: string): Promise<MulticaBridgeResult<null>>;
  createIssue(input: CreateMulticaIssueInput): Promise<MulticaBridgeResult<MulticaIssueSummary>>;
}

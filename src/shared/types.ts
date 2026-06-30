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
// 核心概念：管理个人关注的领域，而非任务。焦点有时间层面，会迁移变化。

/** 焦点时间层面 —— 近期核心 / 近期关注 / 远期关注 / 待观察 / 已归档 */
export type FocusHorizon = 'current_core' | 'near_term' | 'long_term' | 'watching' | 'archived';

/** 焦点状态 —— 活跃推进 / 观察中 / 暂停 / 已迁移 / 已完成/结束 */
export type FocusStatus = 'active' | 'watching' | 'paused' | 'migrated' | 'completed';

/** 焦点重要程度 */
export type FocusImportance = 'critical' | 'high' | 'medium' | 'low';

/** 焦点标签 */
export interface FocusTag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

/** 焦点迁移记录 —— 记录焦点的状态/层面变化历史 */
export interface FocusMigration {
  id: string;
  focusId: string;
  fromHorizon?: FocusHorizon;
  toHorizon?: FocusHorizon;
  fromStatus?: FocusStatus;
  toStatus?: FocusStatus;
  reason?: string;
  occurredAt: string;
}

/** 关注领域 —— 核心模型：代表一个需要持续关注的主题、项目或领域 */
export interface FocusArea {
  id: string;
  name: string;                    // 焦点名称
  description: string;             // 详细描述
  whyImportant: string;            // 为什么重要
  desiredOutcome?: string;         // 期望的结果/目标
  horizon: FocusHorizon;           // 时间层面
  status: FocusStatus;             // 状态
  importance: FocusImportance;     // 重要程度
  tagIds: string[];                // 标签
  nextReviewAt?: string;           // 下次回顾时间
  contextLinks?: string[];         // 相关链接
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** 专注会话记录 —— 作为附属功能：记录在某个焦点上投入的深度工作时间 */
export interface FocusSession {
  id: string;
  focusId: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  notes?: string;
  createdAt: string;
}

/** 焦点统计 */
export interface FocusStats {
  totalAreas: number;
  currentCore: number;
  nearTerm: number;
  longTerm: number;
  watching: number;
  completed: number;
  totalFocusMinutes: number;
  focusMinutesToday: number;
}

/** focus 插件对外暴露的 API */
export interface FocusApi {
  // 焦点管理
  createArea(name: string, description: string, whyImportant: string, horizon: FocusHorizon, status: FocusStatus, importance: FocusImportance, tagIds: string[], desiredOutcome?: string, nextReviewAt?: string, contextLinks?: string[]): { success: boolean; areaId?: string; error?: string };
  updateArea(areaId: string, name: string, description: string, whyImportant: string, horizon: FocusHorizon, status: FocusStatus, importance: FocusImportance, tagIds: string[], desiredOutcome?: string, nextReviewAt?: string, contextLinks?: string[]): { success: boolean; error?: string };
  deleteArea(areaId: string): { success: boolean; error?: string };
  getAreas(horizon?: FocusHorizon, status?: FocusStatus, tagId?: string, importance?: FocusImportance): FocusArea[];
  getAreaById(areaId: string): FocusArea | null;

  // 焦点迁移/状态变化（记录历史）
  migrateArea(areaId: string, toHorizon: FocusHorizon, reason?: string): { success: boolean; error?: string };
  changeAreaStatus(areaId: string, toStatus: FocusStatus, reason?: string): { success: boolean; error?: string };

  // 迁移历史
  getMigrations(areaId?: string): FocusMigration[];

  // 标签
  createTag(name: string, color?: string): { success: boolean; tagId?: string; error?: string };
  getTags(): FocusTag[];
  deleteTag(tagId: string): { success: boolean; error?: string };

  // 专注计时（附属功能）
  startSession(focusId: string): { success: boolean; sessionId?: string; error?: string };
  endSession(sessionId: string, notes?: string): { success: boolean; durationMinutes?: number; error?: string };
  getSessions(focusId?: string): FocusSession[];

  // 统计
  getStats(): FocusStats;
}

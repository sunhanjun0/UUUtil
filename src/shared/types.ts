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
// 核心概念：焦点不是待办条目，而是通过检视记录观察到的注意力分布。

export type FocusAttentionMode = 'deep' | 'pulse' | 'scan' | 'dormant';
export type FocusReviewCadence = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type FocusHealth = 'aligned' | 'drifting' | 'neglected' | 'cooling';
export type FocusCheckInEnergy = 'engaged' | 'neutral' | 'avoiding';
export type FocusAlertType = 'neglected' | 'weight_decay' | 'attention_drift' | 'exit_triggered';

export interface FocusTag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface FocusArea {
  id: string;
  name: string;
  description?: string;
  weight: number;
  attentionMode: FocusAttentionMode;
  expectedExit?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastDecayAt: string;
}

export interface FocusCheckIn {
  id: string;
  focusId: string;
  timestamp: string;
  energy: FocusCheckInEnergy;
  blocker?: string;
  nextAction?: string;
  notes?: string;
}

export interface FocusAreaView extends FocusArea {
  reviewCadence: FocusReviewCadence;
  health: FocusHealth;
  daysSinceLastCheckIn: number | null;
  lastCheckInAt?: string;
  recentCheckInCount: number;
  checkInCount: number;
  alerts: FocusAlert[];
}

export interface FocusAlert {
  id: string;
  focusId: string;
  type: FocusAlertType;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface FocusStats {
  totalAreas: number;
  activeAreas: number;
  modeCounts: Record<FocusAttentionMode, number>;
  healthCounts: Record<FocusHealth, number>;
  alertCount: number;
  totalCheckIns: number;
  checkInsLast7Days: number;
  averageWeight: number;
}

export interface FocusListFilters {
  minWeight?: number;
  maxWeight?: number;
  health?: FocusHealth;
  attentionMode?: FocusAttentionMode;
  tag?: string;
  includeDormant?: boolean;
}

export interface FocusCreateInput {
  name: string;
  description?: string;
  attentionMode: FocusAttentionMode;
  weight: number;
  expectedExit?: string;
  tags?: string[];
}

export interface FocusMetadataUpdateInput {
  name?: string;
  description?: string;
  expectedExit?: string;
  tags?: string[];
}

export interface FocusCheckInInput {
  focusId: string;
  energy: FocusCheckInEnergy;
  blocker?: string;
  nextAction?: string;
  notes?: string;
}

export interface FocusApi {
  create(input: FocusCreateInput): { success: boolean; focusId?: string; error?: string };
  updateMetadata(focusId: string, input: FocusMetadataUpdateInput): { success: boolean; error?: string };
  checkIn(input: FocusCheckInInput): { success: boolean; checkInId?: string; error?: string };
  get(focusId: string): FocusAreaView | null;
  list(filters?: FocusListFilters): FocusAreaView[];
  alerts(): FocusAlert[];
  checkins(focusId: string): FocusCheckIn[];
  stats(): FocusStats;
  createTag(name: string, color?: string): { success: boolean; tagId?: string; error?: string };
  updateTag(tagId: string, name: string, color?: string): { success: boolean; error?: string };
  listTags(): FocusTag[];
  deleteTag(tagId: string): { success: boolean; error?: string };
  resetAll(): { success: boolean; error?: string };
}

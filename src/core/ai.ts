/**
 * AI 核心层兼容入口。
 *
 * 具体实现位于 ai-runtime，外部模块仍从 core/ai 导入，避免影响现有 IPC 与页面调用。
 */
export {
  initAi,
  listAiProviders,
  upsertAiProvider,
  deleteAiProvider,
  getAiRuntimeConfig,
  updateAiRuntimeConfig,
  chat,
  streamChat,
} from './ai-runtime';

export type {
  AiStreamCallbacks,
  ConnectorChatRequest,
  ModelConnector,
  ModelConnectorCapability,
} from './ai-runtime';

/**
 * 核心模块统一导出
 */
export { bus } from './event-bus';
export { initDatabase, getDatabase, closeDatabase, autoSave, flushDatabase } from './db';
export { loadAllPlugins, listPlugins, getPluginCount } from './plugin-loader';
export { initLogger, closeLogger, debug, info, warn, error, openLogsDir, getLogPath, readRecentLogs, clearLogs } from './logger';
export {
  initAi,
  listAiProviders,
  upsertAiProvider,
  deleteAiProvider,
  getAiRuntimeConfig,
  updateAiRuntimeConfig,
  chat,
  streamChat,
} from './ai';
export type { Plugin, PluginManifest } from './plugin-loader';

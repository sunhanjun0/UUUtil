/**
 * 核心模块统一导出
 */
export { bus } from './event-bus';
export { initDatabase, getDatabase, closeDatabase, autoSave, flushDatabase, reloadDatabaseIfChanged } from './db';
export { loadAllPlugins, listPlugins, getPluginCount } from './plugin-loader';
export { initLogger, initLoggerAt, closeLogger, debug, info, warn, error, openLogsDir, getLogPath, readRecentLogs, clearLogs } from './logger';
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
export { getTabLayout, saveTabLayout } from './ui-settings';
export { registerCommand, listCommands, describeCommand, invokeCommand } from './command-registry';
export type { CommandDefinition, CommandParam, CommandResult } from './command-registry';
export type { Plugin, PluginManifest } from './plugin-loader';

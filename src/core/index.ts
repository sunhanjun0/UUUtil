/**
 * 核心模块统一导出
 */
export { bus } from './event-bus';
export { initDatabase, getDatabase, closeDatabase, autoSave } from './db';
export { loadAllPlugins, listPlugins, getPluginCount } from './plugin-loader';
export {
  initAi,
  listAiProviders,
  upsertAiProvider,
  deleteAiProvider,
  getAiRuntimeConfig,
  updateAiRuntimeConfig,
  chat,
} from './ai';
export type { Plugin, PluginManifest } from './plugin-loader';

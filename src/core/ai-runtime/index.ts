import { getDatabase, autoSave } from '../db';
import { registerModelConnector } from './connector-registry';
import { openAiCompatibleConnector } from './connectors/openai-compatible';

export { chat } from './chat-runtime';
export { listAiProviders, upsertAiProvider, deleteAiProvider } from './provider-store';
export { getAiRuntimeConfig, updateAiRuntimeConfig } from './runtime-config';
export { listModelConnectors, registerModelConnector } from './connector-registry';
export type { ConnectorChatRequest, ModelConnector, ModelConnectorCapability } from './types';

export function initAi(): void {
  const db = getDatabase();

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_providers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL,
      base_url    TEXT NOT NULL,
      api_key     TEXT,
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `);

  registerModelConnector(openAiCompatibleConnector);
  autoSave();
}

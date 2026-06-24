import { getDatabase, autoSave } from '../db';
import type { AiConfigResult, AiRuntimeConfig } from '../../shared/types';
import { selectRows } from './provider-store';

function now(): string {
  return new Date().toISOString();
}

export function getAiRuntimeConfig(): AiRuntimeConfig {
  const rows = selectRows(`SELECT value FROM ai_settings WHERE key = ?`, ['runtime']);
  if (rows.length === 0 || typeof rows[0][0] !== 'string') return {};

  try {
    return JSON.parse(rows[0][0]) as AiRuntimeConfig;
  } catch {
    return {};
  }
}

export function updateAiRuntimeConfig(config: AiRuntimeConfig): AiConfigResult {
  try {
    const merged = { ...getAiRuntimeConfig(), ...config };
    const db = getDatabase();
    db.run(
      `INSERT OR REPLACE INTO ai_settings (key, value, updated_at) VALUES (?, ?, ?)`,
      ['runtime', JSON.stringify(merged), now()]
    );
    autoSave();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

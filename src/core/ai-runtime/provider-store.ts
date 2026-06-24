import { getDatabase, autoSave } from '../db';
import type { AiConfigResult, AiProviderConfig } from '../../shared/types';

function now(): string {
  return new Date().toISOString();
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function selectRows(sql: string, params: any[] = []): any[][] {
  const db = getDatabase();
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const rows: any[][] = [];
    while (statement.step()) {
      rows.push(statement.get());
    }
    return rows;
  } finally {
    statement.free();
  }
}

function mapProvider(row: any[]): AiProviderConfig {
  return {
    id: row[0],
    name: row[1],
    type: row[2],
    baseUrl: row[3],
    apiKey: row[4] || undefined,
    enabled: row[5] === 1,
    createdAt: row[6],
    updatedAt: row[7],
  };
}

export function listAiProviders(): AiProviderConfig[] {
  return selectRows(
    `SELECT id, name, type, base_url, api_key, enabled, created_at, updated_at FROM ai_providers ORDER BY created_at`
  ).map(mapProvider);
}

export function upsertAiProvider(provider: Omit<AiProviderConfig, 'createdAt' | 'updatedAt'>): AiConfigResult {
  try {
    const db = getDatabase();
    const timestamp = now();
    const existing = selectRows(`SELECT created_at FROM ai_providers WHERE id = ?`, [provider.id]);
    const createdAt = existing[0]?.[0] || timestamp;

    db.run(
      `INSERT OR REPLACE INTO ai_providers (id, name, type, base_url, api_key, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        provider.id,
        provider.name,
        provider.type,
        normalizeBaseUrl(provider.baseUrl),
        provider.apiKey || null,
        provider.enabled ? 1 : 0,
        createdAt,
        timestamp,
      ]
    );
    autoSave();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export function deleteAiProvider(providerId: string): AiConfigResult {
  try {
    const db = getDatabase();
    db.run(`DELETE FROM ai_providers WHERE id = ?`, [providerId]);
    autoSave();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

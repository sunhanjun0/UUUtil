/**
 * AI 核心层 —— 统一配置与调用入口
 *
 * 插件不直接绑定具体厂商，只通过这里读取配置、发起模型调用。
 */

import { getDatabase, autoSave } from './db';
import type {
  AiChatRequest,
  AiChatResponse,
  AiConfigResult,
  AiProviderConfig,
  AiRuntimeConfig,
} from '../shared/types';

const DEFAULT_TIMEOUT_MS = 30000;

type OpenAiCompatibleResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

function now(): string {
  return new Date().toISOString();
}

function selectRows(sql: string, params: any[] = []): any[][] {
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function getRuntimeConfigValue(): AiRuntimeConfig {
  const rows = selectRows(`SELECT value FROM ai_settings WHERE key = ?`, ['runtime']);
  if (rows.length === 0 || typeof rows[0][0] !== 'string') return {};

  try {
    return JSON.parse(rows[0][0]) as AiRuntimeConfig;
  } catch {
    return {};
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

  autoSave();
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

export function getAiRuntimeConfig(): AiRuntimeConfig {
  return getRuntimeConfigValue();
}

export function updateAiRuntimeConfig(config: AiRuntimeConfig): AiConfigResult {
  try {
    const merged = { ...getRuntimeConfigValue(), ...config };
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

function resolveProvider(providerId?: string): AiProviderConfig | null {
  const runtimeConfig = getRuntimeConfigValue();
  const id = providerId || runtimeConfig.defaultProviderId;
  const providers = listAiProviders().filter((provider) => provider.enabled);
  return providers.find((provider) => provider.id === id) || providers[0] || null;
}

export async function chat(request: AiChatRequest): Promise<AiChatResponse> {
  const provider = resolveProvider(request.providerId);
  if (!provider) {
    return { success: false, error: '未配置可用的 AI Provider' };
  }

  if (provider.type !== 'openai-compatible') {
    return { success: false, providerId: provider.id, error: `暂不支持的 AI Provider 类型: ${provider.type}` };
  }

  const runtimeConfig = getRuntimeConfigValue();
  const model = request.model || runtimeConfig.defaultModel;
  if (!model) {
    return { success: false, providerId: provider.id, error: '未配置默认模型' };
  }

  const timeoutMs = request.timeoutMs || runtimeConfig.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? runtimeConfig.temperature,
        max_tokens: request.maxTokens ?? runtimeConfig.maxTokens,
      }),
      signal: controller.signal,
    });

    const data = await response.json() as OpenAiCompatibleResponse;
    if (!response.ok) {
      return {
        success: false,
        providerId: provider.id,
        model,
        error: data.error?.message || `AI 请求失败: ${response.status}`,
      };
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { success: false, providerId: provider.id, model, error: 'AI 响应为空' };
    }

    return { success: true, providerId: provider.id, model, content };
  } catch (err) {
    return {
      success: false,
      providerId: provider.id,
      model,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

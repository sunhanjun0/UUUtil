/**
 * speech 插件 —— 语音实验室对外 API
 *
 * 通过 Gen8 的 speech-gateway（OpenAI 兼容 REST）调用 ASR/TTS 能力。
 * 连接配置存 speech_config 表：baseUrl 默认 Gen8 公网地址；
 * apiKey 不内置（仓库公开，密钥不落库代码），由用户经 `speech.config` 或页面配置。
 * 网关不可达 / 未配置 Key 时各能力返回明确错误，不影响其他插件。
 */

import { getDatabase, autoSave } from '../../core/db';
import type {
  SpeechApi,
  SpeechConfig,
  SpeechGatewayHealth,
  SpeechSynthesizeInput,
  SpeechSynthesizeResult,
  SpeechTranscribeInput,
  SpeechTranscribeResult,
  SpeechVoiceItem,
} from '../../shared/types';

const DEFAULT_BASE_URL = 'http://101.43.70.89:30787';
const REQUEST_TIMEOUT_MS = 30_000;

export function ensureSpeechTables(): void {
  const db = getDatabase();
  db.run(`CREATE TABLE IF NOT EXISTS speech_config (key TEXT PRIMARY KEY, value TEXT)`);
  autoSave();
}

export function getSpeechConfig(): SpeechConfig {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT key, value FROM speech_config`);
    const rows: Record<string, string> = {};
    try {
      while (stmt.step()) {
        const row = stmt.get();
        rows[String(row[0])] = String(row[1]);
      }
    } finally {
      stmt.free();
    }
    return {
      baseUrl: rows.baseUrl || DEFAULT_BASE_URL,
      apiKey: rows.apiKey ?? '',
    };
  } catch {
    return { baseUrl: DEFAULT_BASE_URL, apiKey: '' };
  }
}

export function setSpeechConfigValue(key: 'baseUrl' | 'apiKey', value: string): void {
  const db = getDatabase();
  db.run(`INSERT INTO speech_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
  autoSave();
}

function requireKey(cfg: SpeechConfig): string | null {
  if (!cfg.apiKey) return '未配置网关 Key：请先运行 `uuutil call speech.config --json \'{"apiKey":"..."}\'` 或在页面右上角配置';
  return null;
}

async function postJson(path: string, body: unknown, cfg: SpeechConfig): Promise<{ status: number; data: unknown; raw: ArrayBuffer | null }> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return { status: res.status, data: await res.json(), raw: null };
  }
  return { status: res.status, data: null, raw: await res.arrayBuffer() };
}

async function getJson(path: string, cfg: SpeechConfig): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

function errorMessage(status: number, data: unknown): string {
  const body = (data ?? {}) as Record<string, unknown>;
  const msg = typeof body.message === 'string' ? body.message
    : typeof (body.error as Record<string, unknown> | undefined)?.message === 'string' ? String((body.error as Record<string, unknown>).message)
    : '';
  if (status === 401) return '网关鉴权失败：检查 apiKey 是否正确';
  if (status === 503) return '网关未配置上游百炼 Key（503）';
  return msg || `HTTP ${status}`;
}

export const api: SpeechApi = {
  async health(): Promise<SpeechGatewayHealth> {
    const cfg = getSpeechConfig();
    try {
      const res = await fetch(`${cfg.baseUrl}/healthz`, { signal: AbortSignal.timeout(8000) });
      const data = (await res.json()) as Record<string, unknown>;
      return {
        ok: res.ok && data.status === 'ok',
        upstreamReady: data.upstream_ready === true,
        version: typeof data.version === 'string' ? data.version : undefined,
      };
    } catch {
      return { ok: false };
    }
  },

  async listVoices(): Promise<SpeechVoiceItem[]> {
    const cfg = getSpeechConfig();
    const keyError = requireKey(cfg);
    if (keyError) return [];
    try {
      const { status, data } = await getJson('/v1/audio/voices', cfg);
      if (status !== 200) return [];
      const body = data as Record<string, unknown> | null;
      const list = Array.isArray(body?.voices) ? body.voices : Array.isArray(body) ? body : [];
      return (list as Array<Record<string, unknown>>).map((v) => ({
        id: String(v.voice_id ?? v.id ?? v.name ?? ''),
        name: String(v.name ?? v.voice_id ?? ''),
        ready: v.ready !== false,
      })).filter((v) => v.id !== '');
    } catch {
      return [];
    }
  },

  async synthesize(input: SpeechSynthesizeInput): Promise<SpeechSynthesizeResult> {
    const cfg = getSpeechConfig();
    if (!input.text.trim()) return { success: false, error: '文本为空' };
    const keyError = requireKey(cfg);
    if (keyError) return { success: false, error: keyError };
    try {
      const { status, data, raw } = await postJson('/v1/audio/speech', {
        model: input.model || 'tts-1',
        input: input.text,
        ...(input.voice ? { voice: input.voice } : {}),
        ...(input.speed ? { speed: input.speed } : {}),
        response_format: input.format || 'mp3',
        ...(input.instruction ? { instruction: input.instruction } : {}),
      }, cfg);
      if (status !== 200 || !raw) {
        return { success: false, error: errorMessage(status, data) };
      }
      const base64 = Buffer.from(raw).toString('base64');
      return {
        success: true,
        audioBase64: base64,
        format: input.format || 'mp3',
        chars: input.text.length,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  async transcribe(input: SpeechTranscribeInput): Promise<SpeechTranscribeResult> {
    const cfg = getSpeechConfig();
    if (!input.audioBase64) return { success: false, error: '音频为空' };
    const keyError = requireKey(cfg);
    if (keyError) return { success: false, error: keyError };
    try {
      const { status, data } = await postJson('/v1/audio/transcriptions', {
        model: input.model || 'qwen3-asr-flash',
        file_base64: input.audioBase64,
        file_format: input.format || 'wav',
        ...(input.durationSeconds ? { duration_seconds: input.durationSeconds } : {}),
      }, cfg);
      if (status !== 200) {
        return { success: false, error: errorMessage(status, data) };
      }
      const body = (data ?? {}) as Record<string, unknown>;
      return {
        success: true,
        text: String(body.text ?? ''),
        model: typeof body.model === 'string' ? body.model : undefined,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getConfig(): SpeechConfig {
    return getSpeechConfig();
  },
};

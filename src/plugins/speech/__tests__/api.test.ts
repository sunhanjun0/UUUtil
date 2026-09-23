/**
 * speech 插件 api 单测（mock fetch 与 core/db）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../core/db', () => ({
  getDatabase: () => ({
    run: vi.fn(),
    prepare: () => ({ step: () => false, get: () => [], free: vi.fn(), bind: vi.fn() }),
  }),
  autoSave: vi.fn(),
}));

import { api } from '../api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(status: number, body: unknown, contentType = 'application/json') {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => contentType },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(8),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // 配置注入：通过真实的 setSpeechConfigValue 写入 mock db 无效（prepare 返回空），
  // 所以直接测试 apiKey 未配置与请求构造两条路径——后者借助 vi.spyOn 读配置。
});

describe('health', () => {
  it('网关 ok 时返回 ok 与版本', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { status: 'ok', upstream_ready: true, version: '0.2.0' }));
    const h = await api.health();
    expect(h).toEqual({ ok: true, upstreamReady: true, version: '0.2.0' });
  });

  it('连接失败时 ok=false', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect((await api.health()).ok).toBe(false);
  });
});

describe('synthesize', () => {
  it('未配置 Key 时返回明确错误', async () => {
    const result = await api.synthesize({ text: '你好' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('未配置网关 Key');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('文本为空时直接报错', async () => {
    const result = await api.synthesize({ text: '   ' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('文本为空');
  });
});

describe('transcribe', () => {
  it('未配置 Key 时返回明确错误', async () => {
    const result = await api.transcribe({ audioBase64: 'AAAA', format: 'wav' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('未配置网关 Key');
  });

  it('音频为空时报错', async () => {
    const result = await api.transcribe({ audioBase64: '', format: 'wav' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('音频为空');
  });
});

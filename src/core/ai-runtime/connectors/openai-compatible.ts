import type { AiChatResponse } from '../../../shared/types';
import type { ConnectorChatRequest, ModelConnector } from '../types';

const DEFAULT_TIMEOUT_MS = 30000;

type OpenAiCompatibleResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export const openAiCompatibleConnector: ModelConnector = {
  id: 'openai-compatible',
  name: 'OpenAI Compatible',
  providerType: 'openai-compatible',
  capabilities: ['chat'],

  async chat({ provider, runtimeConfig, request }: ConnectorChatRequest): Promise<AiChatResponse> {
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
  },
};

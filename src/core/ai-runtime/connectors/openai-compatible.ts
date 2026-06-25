import type { AiChatResponse } from '../../../shared/types';
import type { AiStreamCallbacks, ConnectorChatRequest, ModelConnector } from '../types';

const DEFAULT_TIMEOUT_MS = 30000;

type OpenAiCompatibleUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenAiCompatibleResponse = {
  choices?: Array<{ message?: { content?: string; reasoning_content?: string }; finish_reason?: string }>;
  usage?: OpenAiCompatibleUsage;
  error?: { message?: string };
};

type OpenAiCompatibleStreamChunk = {
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string };
    message?: { content?: string; reasoning_content?: string };
    text?: string;
    finish_reason?: string;
  }>;
  usage?: OpenAiCompatibleUsage | null;
  error?: { message?: string };
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function createRequestBody({ runtimeConfig, request }: ConnectorChatRequest, model: string, stream = false): string {
  return JSON.stringify({
    model,
    messages: request.messages,
    temperature: request.temperature ?? runtimeConfig.temperature,
    max_tokens: request.maxTokens ?? runtimeConfig.maxTokens,
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  });
}

function toUsage(usage?: OpenAiCompatibleUsage | null): AiChatResponse['usage'] | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function estimateCompletionTokens(content: string): number {
  if (!content) return 0;
  const asciiChars = (content.match(/[\x00-\x7F]/g) || []).length;
  const nonAsciiChars = content.length - asciiChars;
  return Math.max(1, Math.ceil(asciiChars / 4 + nonAsciiChars * 0.7));
}

function estimatePromptTokens(messages: ConnectorChatRequest['request']['messages']): number {
  return Math.max(1, Math.ceil(messages.reduce((total, message) => {
    if (typeof message.content === 'string') return total + message.content.length;
    return total + message.content.reduce((sum, part) => {
      if (part.type === 'text') return sum + part.text.length;
      if (part.type === 'image_url') return sum + 800;
      return sum + 1200;
    }, 0);
  }, 0) / 3));
}

function createEstimatedUsage(request: ConnectorChatRequest['request'], content: string): AiChatResponse['usage'] {
  const promptTokens = estimatePromptTokens(request.messages);
  const completionTokens = estimateCompletionTokens(content);
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

function timeoutError(timeoutMs: number): string {
  return `AI 请求超时，已超过 ${Math.round(timeoutMs / 1000)} 秒。可以降低 maxTokens 或稍后重试。`;
}

function parseStreamPayload(payload: string): { delta?: string; reasoningDelta?: string; finishReason?: string; usage?: AiChatResponse['usage'] } {
  const chunk = JSON.parse(payload) as OpenAiCompatibleStreamChunk;
  if (chunk.error?.message) throw new Error(chunk.error.message);

  const choice = chunk.choices?.[0];
  return {
    delta: choice?.delta?.content || choice?.message?.content || choice?.text,
    reasoningDelta: choice?.delta?.reasoning_content || choice?.message?.reasoning_content,
    finishReason: choice?.finish_reason,
    usage: toUsage(chunk.usage),
  };
}

export const openAiCompatibleConnector: ModelConnector = {
  id: 'openai-compatible',
  name: 'OpenAI Compatible',
  providerType: 'openai-compatible',
  capabilities: ['chat', 'stream'],

  async chat({ provider, runtimeConfig, request }: ConnectorChatRequest): Promise<AiChatResponse> {
    const model = request.model || runtimeConfig.defaultModel;
    if (!model) {
      return { success: false, providerId: provider.id, error: '未配置默认模型' };
    }

    const timeoutMs = request.timeoutMs || runtimeConfig.timeoutMs || DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body: createRequestBody({ provider, runtimeConfig, request }, model),
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

      const choice = data.choices?.[0];
      const content = choice?.message?.content;
      if (!content) {
        return { success: false, providerId: provider.id, model, finishReason: choice?.finish_reason, error: 'AI 响应为空' };
      }

      return {
        success: true,
        providerId: provider.id,
        model,
        content,
        reasoning: choice?.message?.reasoning_content,
        finishReason: choice?.finish_reason,
        usage: toUsage(data.usage) || createEstimatedUsage(request, content),
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        providerId: provider.id,
        model,
        error: err instanceof Error && err.name === 'AbortError'
          ? timeoutError(timeoutMs)
          : message,
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  async streamChat({ provider, runtimeConfig, request, signal }: ConnectorChatRequest, callbacks: AiStreamCallbacks): Promise<AiChatResponse> {
    const model = request.model || runtimeConfig.defaultModel;
    if (!model) {
      return { success: false, providerId: provider.id, error: '未配置默认模型' };
    }

    const timeoutMs = request.timeoutMs || runtimeConfig.timeoutMs || DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    signal?.addEventListener('abort', abortHandler, { once: true });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const resetTimeout = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(), timeoutMs);
    };
    resetTimeout();
    let content = '';
    let reasoning = '';
    let finishReason: string | undefined;
    let usage: AiChatResponse['usage'];

    try {
      const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body: createRequestBody({ provider, runtimeConfig, request }, model, true),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as OpenAiCompatibleResponse | null;
        return {
          success: false,
          providerId: provider.id,
          model,
          error: data?.error?.message || `AI 请求失败: ${response.status}`,
        };
      }

      if (!response.body) {
        return { success: false, providerId: provider.id, model, error: 'AI 响应不支持流式读取' };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        resetTimeout();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          const parsed = parseStreamPayload(payload);
          if (parsed.reasoningDelta) {
            reasoning += parsed.reasoningDelta;
            callbacks.onReasoning?.(parsed.reasoningDelta);
          }
          if (parsed.delta) {
            content += parsed.delta;
            callbacks.onChunk(parsed.delta);
          }
          if (parsed.finishReason) finishReason = parsed.finishReason;
          if (parsed.usage) usage = parsed.usage;
        }
      }

      const tail = buffer.trim();
      if (tail.startsWith('data:')) {
        const payload = tail.slice(5).trim();
        if (payload && payload !== '[DONE]') {
          const parsed = parseStreamPayload(payload);
          if (parsed.reasoningDelta) {
            reasoning += parsed.reasoningDelta;
            callbacks.onReasoning?.(parsed.reasoningDelta);
          }
          if (parsed.delta) {
            content += parsed.delta;
            callbacks.onChunk(parsed.delta);
          }
          if (parsed.finishReason) finishReason = parsed.finishReason;
          if (parsed.usage) usage = parsed.usage;
        }
      }

      return {
        success: true,
        providerId: provider.id,
        model,
        content,
        reasoning: reasoning || undefined,
        finishReason,
        usage: usage || createEstimatedUsage(request, content),
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        providerId: provider.id,
        model,
        content,
        reasoning: reasoning || undefined,
        finishReason,
        usage: content ? usage || createEstimatedUsage(request, content) : usage,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error && err.name === 'AbortError'
          ? timeoutError(timeoutMs)
          : message,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener('abort', abortHandler);
    }
  },
};

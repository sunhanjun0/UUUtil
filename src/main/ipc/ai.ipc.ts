/**
 * AI 核心 IPC 模块：Provider 配置、运行时配置、普通对话与流式对话。
 *
 * 流式 chunk / reasoning 通过 event.sender.send 主动推送到渲染进程，
 * 不作为独立 ipcMain 通道注册。
 */

import {
  listAiProviders,
  upsertAiProvider,
  deleteAiProvider,
  getAiRuntimeConfig,
  updateAiRuntimeConfig,
  chat,
  streamChat,
  info as logInfo,
  warn as logWarn,
} from '../../core';
import { defineInvoke } from './types';
import type { IpcModule } from './types';
import type { AiChatRequest, AiProviderConfig, AiRuntimeConfig } from '../../shared/types';

const aiStreamControllers = new Map<string, AbortController>();

export const aiIpc: IpcModule = {
  namespace: 'core:ai',
  defs: [
    defineInvoke('core:ai:list-providers', () => listAiProviders()),
    defineInvoke('core:ai:get-runtime-config', () => getAiRuntimeConfig()),
    defineInvoke('core:ai:upsert-provider', (_event, provider: Omit<AiProviderConfig, 'createdAt' | 'updatedAt'>) =>
      upsertAiProvider(provider)),
    defineInvoke('core:ai:delete-provider', (_event, providerId: string) => deleteAiProvider(providerId)),
    defineInvoke('core:ai:update-runtime-config', (_event, config: AiRuntimeConfig) => updateAiRuntimeConfig(config)),

    defineInvoke('core:ai:chat', async (_event, request: AiChatRequest) => {
      logInfo('ai', 'chat_request_started', { messageCount: request.messages.length, model: request.model, maxTokens: request.maxTokens, timeoutMs: request.timeoutMs });
      const response = await chat(request);
      logInfo('ai', response.success ? 'chat_request_completed' : 'chat_request_failed', {
        success: response.success,
        model: response.model,
        finishReason: response.finishReason,
        durationMs: response.durationMs,
        usage: response.usage,
        error: response.error,
      });
      return response;
    }),

    defineInvoke('core:ai:chat-stream', async (event, streamId: string, request: AiChatRequest) => {
      logInfo('ai', 'chat_stream_started', { streamId, messageCount: request.messages.length, model: request.model, maxTokens: request.maxTokens, timeoutMs: request.timeoutMs });
      const controller = new AbortController();
      aiStreamControllers.set(streamId, controller);
      try {
        const response = await streamChat(request, {
          onChunk: (chunk: string) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('core:ai:chat-stream:chunk', streamId, chunk);
            }
          },
          onReasoning: (chunk: string) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('core:ai:chat-stream:reasoning', streamId, chunk);
            }
          },
        }, controller.signal);
        logInfo('ai', response.success ? 'chat_stream_completed' : 'chat_stream_failed', {
          streamId,
          success: response.success,
          model: response.model,
          finishReason: response.finishReason,
          durationMs: response.durationMs,
          usage: response.usage,
          error: response.error,
        });
        return response;
      } finally {
        aiStreamControllers.delete(streamId);
      }
    }),

    defineInvoke('core:ai:cancel-chat-stream', (_event, streamId: string) => {
      const controller = aiStreamControllers.get(streamId);
      if (!controller) return { success: false, error: '未找到正在生成的请求' };
      logWarn('ai', 'chat_stream_cancelled', { streamId });
      controller.abort();
      aiStreamControllers.delete(streamId);
      return { success: true };
    }),
  ],
};

/**
 * 语音实验室 IPC 模块：网关健康、音色目录、TTS 合成、ASR 识别、连接配置。
 */

import { defineInvoke } from './types';
import type { IpcModule } from './types';
import { api as speechApi, getSpeechConfig, setSpeechConfigValue } from '../../plugins/speech/api';
import type { SpeechSynthesizeInput, SpeechTranscribeInput } from '../../shared/types';

export const speechIpc: IpcModule = {
  namespace: 'speech',
  defs: [
    defineInvoke('speech:health', () => speechApi.health()),
    defineInvoke('speech:voices', () => speechApi.listVoices()),
    defineInvoke('speech:synthesize', (_event, input: SpeechSynthesizeInput) => speechApi.synthesize(input)),
    defineInvoke('speech:transcribe', (_event, input: SpeechTranscribeInput) => speechApi.transcribe(input)),
    defineInvoke('speech:get-config', () => {
      const cfg = getSpeechConfig();
      return { baseUrl: cfg.baseUrl, apiKeySet: cfg.apiKey !== '' };
    }),
    defineInvoke('speech:set-config', (_event, input: { baseUrl?: string; apiKey?: string }) => {
      const updated: string[] = [];
      if (typeof input?.baseUrl === 'string' && input.baseUrl !== '') {
        setSpeechConfigValue('baseUrl', input.baseUrl);
        updated.push('baseUrl');
      }
      if (typeof input?.apiKey === 'string' && input.apiKey !== '') {
        setSpeechConfigValue('apiKey', input.apiKey);
        updated.push('apiKey');
      }
      const cfg = getSpeechConfig();
      return { updated, config: { baseUrl: cfg.baseUrl, apiKeySet: cfg.apiKey !== '' } };
    }),
  ],
};

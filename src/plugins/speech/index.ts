/**
 * speech 插件 —— 语音实验室
 *
 * 通过 Gen8 speech-gateway 提供 ASR/TTS 能力，为后续语音助手铺路。
 * REST 起步；流式（WS 边生成边播 / 实时转写）为语音助手阶段的下一步。
 */

import { bus } from '../../core/event-bus';
import { registerCommand } from '../../core/command-registry';
import type { PluginManifest } from '../../core/plugin-loader';
import { api, ensureSpeechTables, getSpeechConfig, setSpeechConfigValue } from './api';

export const manifest: PluginManifest = {
  id: 'speech',
  name: '语音实验室',
  version: '0.1.0',
  description: '语音合成与识别实验室（Gen8 speech-gateway），为语音助手铺路',
};

export function activate(): void {
  console.log('[speech] 插件已激活');

  bus.on('core:ready', () => {
    ensureSpeechTables();
    console.log('[speech] 配置表已就绪');
  });

  // speech.config —— 查看/修改语音网关连接配置（apiKey 只写不回显）
  registerCommand({
    command: 'speech.config',
    description: '查看或修改语音网关配置（baseUrl / apiKey）',
    params: [
      { name: 'baseUrl', type: 'string', required: false, description: '网关地址，默认 Gen8 公网 http://101.43.70.89:30787' },
      { name: 'apiKey', type: 'string', required: false, description: '网关调用 Key，只写入不回显' },
    ],
    example: { apiKey: '<gateway key>' },
    handler: (args) => {
      const updated: string[] = [];
      if (typeof args.baseUrl === 'string' && args.baseUrl !== '') {
        setSpeechConfigValue('baseUrl', args.baseUrl);
        updated.push('baseUrl');
      }
      if (typeof args.apiKey === 'string' && args.apiKey !== '') {
        setSpeechConfigValue('apiKey', args.apiKey);
        updated.push('apiKey');
      }
      const cfg = getSpeechConfig();
      return {
        updated,
        config: { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey ? '***' : '' },
      };
    },
  });

  // speech.say —— TTS 冒烟测试：合成并返回字符数（音频经页面播放）
  registerCommand({
    command: 'speech.say',
    description: 'TTS 合成测试（返回合成结果概要，音频请用语音实验室页播放）',
    params: [
      { name: 'text', type: 'string', required: true, description: '合成文本' },
      { name: 'voice', type: 'string', required: false, description: '音色名，默认 Cherry' },
      { name: 'instruction', type: 'string', required: false, description: '情绪指令（仅 tts-1-hd）' },
    ],
    example: { text: '你好，我是语音网关', voice: 'Cherry' },
    handler: async (args) => {
      const result = await api.synthesize({
        text: String(args.text ?? ''),
        voice: typeof args.voice === 'string' ? args.voice : undefined,
        instruction: typeof args.instruction === 'string' ? args.instruction : undefined,
        model: typeof args.instruction === 'string' ? 'tts-1-hd' : 'tts-1',
      });
      return result.success
        ? { success: true, chars: result.chars, format: result.format }
        : { success: false, error: result.error };
    },
  });

  // speech.transcribe —— ASR 冒烟测试：传 base64 音频
  registerCommand({
    command: 'speech.transcribe',
    description: 'ASR 识别测试（base64 音频 → 文本）',
    params: [
      { name: 'audioBase64', type: 'string', required: true, description: '音频 base64' },
      { name: 'format', type: 'string', required: false, description: '音频格式，默认 wav' },
      { name: 'durationSeconds', type: 'number', required: false, description: '时长（秒），用于按秒计量' },
    ],
    handler: async (args) => {
      return api.transcribe({
        audioBase64: String(args.audioBase64 ?? ''),
        format: typeof args.format === 'string' ? args.format : 'wav',
        durationSeconds: typeof args.durationSeconds === 'number' ? args.durationSeconds : undefined,
      });
    },
  });
}

export function deactivate(): void {
  console.log('[speech] 插件已停用');
}

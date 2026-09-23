import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Check, Copy, Download, Key, Mic, Play, RefreshCw, Square, Upload } from 'lucide-react';
import type { SpeechGatewayHealth, SpeechSynthesizeResult, SpeechVoiceItem } from '../../src/shared/types';

const TTS_MODELS = [
  { id: 'tts-1', label: 'tts-1 // 快速播报' },
  { id: 'tts-1-hd', label: 'tts-1-hd // 情绪指令' },
];

const ASR_MODELS = [
  { id: 'qwen3-asr-flash', label: 'qwen3-asr-flash // 推荐' },
  { id: 'whisper-1', label: 'whisper-1 // 别名' },
];

/** Float32 采样 → 16-bit PCM WAV（base64），采样率 16000 便于 ASR */
function encodeWavBase64(samples: Float32Array, sampleRate: number): string {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  const bytes = new Uint8Array(44 + pcm.length * 2);
  bytes.set(new Uint8Array(header));
  bytes.set(new Uint8Array(pcm.buffer), 44);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlobUrl(base64: string, mime: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

export default function SpeechLabPage() {
  const [health, setHealth] = useState<SpeechGatewayHealth | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);

  // TTS
  const [voices, setVoices] = useState<SpeechVoiceItem[]>([]);
  const [ttsText, setTtsText] = useState('你好，我是 UUUtil 的语音实验室，语音网关已接通。');
  const [ttsModel, setTtsModel] = useState('tts-1');
  const [ttsVoice, setTtsVoice] = useState('Cherry');
  const [ttsInstruction, setTtsInstruction] = useState('');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsResult, setTtsResult] = useState<SpeechSynthesizeResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ASR
  const [asrModel, setAsrModel] = useState('qwen3-asr-flash');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [asrBusy, setAsrBusy] = useState(false);
  const [asrText, setAsrText] = useState('');
  const [asrError, setAsrError] = useState('');
  const [copied, setCopied] = useState(false);
  const recorderRef = useRef<{
    context: AudioContext;
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    processor: ScriptProcessorNode;
    chunks: Float32Array[];
  } | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshStatus = useCallback(async () => {
    const [h, cfg, v] = await Promise.all([
      window.assistant.speech.health(),
      window.assistant.speech.getConfig(),
      window.assistant.speech.voices(),
    ]);
    setHealth(h);
    setBaseUrl(cfg.baseUrl);
    setApiKeySet(cfg.apiKeySet);
    setVoices(v);
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function saveConfig() {
    await window.assistant.speech.setConfig({
      ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    });
    setApiKey('');
    setConfigOpen(false);
    await refreshStatus();
  }

  async function runSynthesize() {
    if (!ttsText.trim() || ttsBusy) return;
    setTtsBusy(true);
    setTtsResult(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    try {
      const result = await window.assistant.speech.synthesize({
        text: ttsText.trim(),
        model: ttsModel,
        voice: ttsVoice || undefined,
        speed: ttsSpeed !== 1 ? ttsSpeed : undefined,
        instruction: ttsModel === 'tts-1-hd' && ttsInstruction.trim() ? ttsInstruction.trim() : undefined,
        format: 'mp3',
      });
      setTtsResult(result);
      if (result.success && result.audioBase64) {
        setAudioUrl(base64ToBlobUrl(result.audioBase64, 'audio/mpeg'));
      }
    } finally {
      setTtsBusy(false);
    }
  }

  async function startRecording() {
    if (recording || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext({ sampleRate: 16000 });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (e) => {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(context.destination);
      recorderRef.current = { context, stream, source, processor, chunks };
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
      setRecording(true);
      setAsrText('');
      setAsrError('');
    } catch (err) {
      setAsrError(`麦克风不可用：${String(err)}`);
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setRecording(false);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recorder.processor.disconnect();
    recorder.source.disconnect();
    recorder.stream.getTracks().forEach((t) => t.stop());
    await recorder.context.close();
    recorderRef.current = null;

    const totalLength = recorder.chunks.reduce((sum, c) => sum + c.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of recorder.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    if (totalLength < 1600) {
      setAsrError('录音太短');
      return;
    }
    const wavBase64 = encodeWavBase64(samples, 16000);
    await runTranscribe(wavBase64, 'wav', totalLength / 16000);
  }

  async function runTranscribe(audioBase64: string, format: string, durationSeconds?: number) {
    setAsrBusy(true);
    setAsrError('');
    setAsrText('');
    try {
      const result = await window.assistant.speech.transcribe({ audioBase64, format, model: asrModel, durationSeconds });
      if (result.success) {
        setAsrText(result.text || '（空结果）');
      } else {
        setAsrError(result.error || '识别失败');
      }
    } finally {
      setAsrBusy(false);
    }
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const format = (file.name.split('.').pop() || 'wav').toLowerCase();
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    await runTranscribe(btoa(binary), format);
  }

  const gatewayDot = health == null ? 'var(--ink-3)' : health.ok ? 'var(--green)' : 'var(--red)';

  return (
    <div className="ck" style={{ padding: '14px 18px', gap: 12, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div className="ck-head" style={{ marginBottom: 0 }}>
        <span className="code">VOICE LAB</span>
        <span className="zh">语音实验室</span>
        <span className="sub">SPEECH GW // ASR + TTS</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: gatewayDot, boxShadow: `0 0 6px ${gatewayDot}` }} />
          {health == null ? 'CHECKING…' : health.ok ? `GW OK ${health.version ?? ''}` : 'GW DOWN'}
          {health?.upstreamReady === false && <span className="ck-warn">上游未就绪</span>}
          <button className="ck-ico" title="刷新" onClick={() => void refreshStatus()}><RefreshCw size={13} /></button>
          <button className="ck-ico" title="网关配置" onClick={() => setConfigOpen((v) => !v)}><Key size={13} /></button>
        </span>
      </div>

      {configOpen && (
        <div className="ck-panel brackets" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px' }}>
          <input className="ck-input" style={{ flex: 2, padding: '6px 10px' }} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://101.43.70.89:30787" />
          <input className="ck-input" style={{ flex: 2, padding: '6px 10px' }} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={apiKeySet ? '已配置（输入以覆盖）' : '输入网关 Key'} />
          <button className="ck-btn primary" onClick={() => void saveConfig()}>保存</button>
        </div>
      )}
      {!apiKeySet && !configOpen && (
        <div className="ck-empty" style={{ padding: '10px 14px', textAlign: 'left' }}>
          未配置网关 Key——点右上角 <Key size={11} style={{ display: 'inline', verticalAlign: -2 }} /> 配置，或运行 <code>uuutil call speech.config</code>
        </div>
      )}

      {/* TTS 合成 */}
      <div className="ck-hairline" style={{ marginTop: 4 }}>TTS // 语音合成</div>
      <div className="ck-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          value={ttsText}
          onChange={(e) => setTtsText(e.target.value)}
          rows={3}
          placeholder="输入要合成的文本…"
          style={{ background: 'rgba(4,9,18,0.6)', border: '1px solid var(--line)', borderRadius: 3, color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 10px', resize: 'vertical', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
          <span className="ck-dim" style={{ letterSpacing: '0.12em' }}>MODEL</span>
          {TTS_MODELS.map((m) => (
            <button key={m.id} className={'ck-chip' + (ttsModel === m.id ? ' on' : '')} onClick={() => setTtsModel(m.id)}>{m.label}</button>
          ))}
          <span className="ck-dim" style={{ letterSpacing: '0.12em', marginLeft: 8 }}>VOICE</span>
          <select
            value={ttsVoice}
            onChange={(e) => setTtsVoice(e.target.value)}
            style={{ background: 'rgba(4,9,18,0.6)', border: '1px solid var(--line)', borderRadius: 3, color: 'var(--ink)', fontFamily: 'inherit', fontSize: 11, padding: '3px 8px' }}
          >
            <option value="Cherry">Cherry</option>
            {voices.filter((v) => v.name !== 'Cherry').map((v) => (
              <option key={v.id} value={v.name}>{v.name}</option>
            ))}
          </select>
          <span className="ck-dim" style={{ marginLeft: 8 }}>语速 {ttsSpeed.toFixed(1)}x</span>
          <input type="range" min={0.5} max={2} step={0.1} value={ttsSpeed} onChange={(e) => setTtsSpeed(Number(e.target.value))} style={{ width: 90 }} />
        </div>
        {ttsModel === 'tts-1-hd' && (
          <input
            value={ttsInstruction}
            onChange={(e) => setTtsInstruction(e.target.value)}
            placeholder="情绪指令，如：用轻快开心的语气"
            style={{ background: 'rgba(4,9,18,0.6)', border: '1px solid var(--line)', borderRadius: 3, color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12, padding: '6px 10px', outline: 'none' }}
          />
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="ck-btn primary" onClick={() => void runSynthesize()} disabled={ttsBusy || !apiKeySet}>
            <AudioLines size={13} /> {ttsBusy ? '合成中…' : '合成语音'}
          </button>
          {audioUrl && (
            <>
              <button className="ck-btn" onClick={() => audioRef.current?.play()}><Play size={13} /> 播放</button>
              <a className="ck-btn" href={audioUrl} download="speech.mp3" style={{ textDecoration: 'none' }}><Download size={13} /> 下载</a>
              <audio ref={audioRef} src={audioUrl} style={{ display: 'none' }} />
            </>
          )}
          {ttsResult && !ttsResult.success && <span className="ck-err" style={{ fontSize: 11 }}>{ttsResult.error}</span>}
          {ttsResult?.success && <span className="ck-ok" style={{ fontSize: 11 }}>OK · {ttsResult.chars} 字符</span>}
        </div>
      </div>

      {/* ASR 识别 */}
      <div className="ck-hairline" style={{ marginTop: 8 }}>ASR // 语音识别</div>
      <div className="ck-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
          <span className="ck-dim" style={{ letterSpacing: '0.12em' }}>MODEL</span>
          {ASR_MODELS.map((m) => (
            <button key={m.id} className={'ck-chip' + (asrModel === m.id ? ' on' : '')} onClick={() => setAsrModel(m.id)}>{m.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {recording ? (
            <button className="ck-btn danger" onClick={() => void stopRecording()}>
              <Square size={13} /> 停止并识别 {recordSeconds}s
            </button>
          ) : (
            <button className="ck-btn primary" onClick={() => void startRecording()} disabled={asrBusy || !apiKeySet}>
              <Mic size={13} /> 录音识别
            </button>
          )}
          <button className="ck-btn" onClick={() => fileInputRef.current?.click()} disabled={asrBusy || !apiKeySet}>
            <Upload size={13} /> 上传音频识别
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => void handleFileSelected(e)} />
          {asrBusy && <span className="ck-dim" style={{ fontSize: 11 }}>识别中…</span>}
          {asrError && <span className="ck-err" style={{ fontSize: 11 }}>{asrError}</span>}
        </div>
        {asrText && (
          <div className="ck-term" style={{ position: 'relative' }}>
            {asrText}
            <button
              className="ck-ico"
              style={{ position: 'absolute', top: 6, right: 6 }}
              title="复制"
              onClick={() => {
                void navigator.clipboard.writeText(asrText);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', marginTop: 2 }}>
        GW → Gen8 speech-gateway → 阿里云百炼 · REST 起步，流式（边生成边播 / 实时转写）留给语音助手阶段
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';

type Tool = 'json' | 'sql' | 'base64' | 'timestamp' | 'regex' | 'uuid';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'json', label: 'JSON' },
  { id: 'sql', label: 'SQL' },
  { id: 'base64', label: 'Base64' },
  { id: 'timestamp', label: '时间戳' },
  { id: 'regex', label: '正则' },
  { id: 'uuid', label: 'UUID' },
];

const textareaStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: 12.5,
  lineHeight: 1.6,
  resize: 'vertical',
  padding: '6px 0',
};

export default function DevUtils() {
  const [active, setActive] = useState<Tool>('json');

  return (
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">TOOLKIT</span>
        <span className="zh">开发工具</span>
        <span className="sub">OPS // JSON SQL BASE64 时间戳 正则 UUID</span>
      </div>

      <div className="ck-tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={'ck-chip' + (active === t.id ? ' on' : '')}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {active === 'json' && <JsonTool />}
        {active === 'sql' && <SqlTool />}
        {active === 'base64' && <Base64Tool />}
        {active === 'timestamp' && <TimestampTool />}
        {active === 'regex' && <RegexTool />}
        {active === 'uuid' && <UuidTool />}
      </div>
    </div>
  );
}

function JsonTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState(false);

  async function format() {
    const res = await window.assistant.devUtils('jsonFormat', input);
    setOutput(res.output);
    setError(!res.success);
  }

  return (
    <div className="ck-panel brackets">
      <div className="ck-input" style={{ padding: '6px 14px', alignItems: 'stretch' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="粘贴 JSON 字符串..."
          rows={5}
          style={textareaStyle}
        />
      </div>
      <div className="ck-tools" style={{ marginTop: 8 }}>
        <button className="ck-btn primary" onClick={format}>格式化</button>
      </div>
      {output && (
        <div className="ck-term" style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto', color: error ? 'var(--red)' : undefined }}>
          {output}
        </div>
      )}
    </div>
  );
}

function SqlTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState(false);

  async function handle(action: 'sqlFormat' | 'sqlCompress') {
    try {
      const res = await window.assistant.devUtils(action, input);
      setOutput(res.output);
      setError(!res.success);
    } catch (err) {
      setOutput(String(err));
      setError(true);
    }
  }

  return (
    <div className="ck-panel brackets">
      <div className="ck-input" style={{ padding: '6px 14px', alignItems: 'stretch' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="粘贴 SQL 语句..."
          rows={5}
          style={textareaStyle}
        />
      </div>
      <div className="ck-tools" style={{ marginTop: 8 }}>
        <button className="ck-btn primary" onClick={() => handle('sqlFormat')}>美化</button>
        <button className="ck-btn" onClick={() => handle('sqlCompress')}>压缩</button>
      </div>
      {output && (
        <div className="ck-term" style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto', color: error ? 'var(--red)' : undefined }}>
          {output}
        </div>
      )}
    </div>
  );
}

function Base64Tool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<'encode' | 'decode' | 'tofile'>('encode');
  const [fileName, setFileName] = useState('');

  async function handle() {
    if (mode === 'tofile') {
      handleToFile();
      return;
    }
    const action = mode === 'encode' ? 'base64Encode' : 'base64Decode';
    const res = await window.assistant.devUtils(action, input);
    setOutput(res.output ?? res);
    setError(mode === 'decode' ? !(res as any).success : false);
  }

  function handleToFile() {
    setError(false);
    setOutput('');
    if (!input.trim()) return;

    try {
      let base64 = input;
      let mime = 'application/octet-stream';
      let ext = 'bin';

      // 解析 data URI
      const dataUriMatch = input.match(/^data:(.+?);base64,(.+)$/);
      if (dataUriMatch) {
        mime = dataUriMatch[1];
        base64 = dataUriMatch[2];
        ext = mime.split('/')[1] || 'bin';
        if (!fileName) {
          const defaultName = mime.startsWith('image/') ? `image.${ext}` :
                              mime.startsWith('audio/') ? `audio.${ext}` :
                              mime.startsWith('video/') ? `video.${ext}` :
                              mime === 'application/pdf' ? 'document.pdf' : `file.${ext}`;
          setFileName(defaultName);
        }
      }

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `file.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setOutput(`文件已下载: ${a.download} (${(blob.size / 1024).toFixed(1)} KB)`);
    } catch (e: any) {
      setError(true);
      setOutput(`转换失败: ${e.message}`);
    }
  }

  return (
    <div className="ck-panel brackets">
      <div className="ck-tools">
        <button className={'ck-chip' + (mode === 'encode' ? ' on' : '')} onClick={() => { setMode('encode'); setOutput(''); }}>编码</button>
        <button className={'ck-chip' + (mode === 'decode' ? ' on' : '')} onClick={() => { setMode('decode'); setOutput(''); }}>解码</button>
        <button className={'ck-chip' + (mode === 'tofile' ? ' on' : '')} onClick={() => { setMode('tofile'); setOutput(''); setFileName(''); }}>转文件</button>
      </div>
      {mode === 'tofile' && (
        <div className="ck-input" style={{ marginTop: 8, flex: 1 }}>
          <span className="prompt">›</span>
          <input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="文件名（可选，自动识别）"
          />
        </div>
      )}
      <div className="ck-input" style={{ marginTop: 8, padding: '6px 14px', alignItems: 'stretch' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'tofile' ? '粘贴 Base64 或 data: URI...' : mode === 'encode' ? '输入原始文本...' : '输入 Base64 字符串...'}
          rows={4}
          style={textareaStyle}
        />
      </div>
      <div className="ck-tools" style={{ marginTop: 8 }}>
        <button className="ck-btn primary" onClick={handle}>{mode === 'tofile' ? '下载文件' : mode === 'encode' ? '编码' : '解码'}</button>
      </div>
      {output && (
        <div className="ck-term" style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto', color: error ? 'var(--red)' : undefined }}>
          {output}
        </div>
      )}
    </div>
  );
}

function TimestampTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<'ts2date' | 'date2ts'>('ts2date');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentFormats = [
    { label: '毫秒时间戳', value: String(now.getTime()) },
    { label: '秒时间戳', value: String(Math.floor(now.getTime() / 1000)) },
    { label: 'ISO 8601', value: now.toISOString() },
    { label: 'UTC', value: now.toUTCString() },
    { label: '本地时间', value: now.toLocaleString('zh-CN') },
    { label: '日期', value: now.toLocaleDateString('zh-CN') },
    { label: '时间', value: now.toLocaleTimeString('zh-CN') },
  ];

  async function handle() {
    const action = mode === 'ts2date' ? 'timestampToDate' : 'dateToTimestamp';
    const res = await window.assistant.devUtils(action, input);
    setOutput(res.output);
    setError(!res.success);
  }

  function fillNow() {
    setInput(String(mode === 'ts2date' ? now.getTime() : now.toISOString()));
  }

  return (
    <div>
      <div className="ck-panel">
        <div className="ck-hairline" style={{ margin: '0 0 6px' }}>NOW // 当前时间</div>
        {currentFormats.map((item) => (
          <div key={item.label} className="ck-row">
            <span className="ck-dim" style={{ width: 72, flexShrink: 0, fontSize: 11 }}>{item.label}</span>
            <code className="ck-sub" style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', fontSize: 12 }}>{item.value}</code>
            <button className="ck-btn" onClick={() => setInput(item.value)}>填入</button>
          </div>
        ))}
      </div>

      <div className="ck-panel brackets" style={{ marginTop: 10 }}>
        <div className="ck-tools">
          <button className={'ck-chip' + (mode === 'ts2date' ? ' on' : '')} onClick={() => { setMode('ts2date'); setOutput(''); }}>时间戳 → 日期</button>
          <button className={'ck-chip' + (mode === 'date2ts' ? ' on' : '')} onClick={() => { setMode('date2ts'); setOutput(''); }}>日期 → 时间戳</button>
        </div>
        <div className="ck-tools" style={{ marginTop: 8 }}>
          <div className="ck-input" style={{ flex: 1 }}>
            <span className="prompt">›</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === 'ts2date' ? '输入时间戳（秒或毫秒）' : '输入日期（如 2024-01-01）'}
            />
          </div>
          <button className="ck-btn" onClick={fillNow}>当前</button>
          <button className="ck-btn primary" onClick={handle}>转换</button>
        </div>
        {output && (
          <div className="ck-term" style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto', color: error ? 'var(--red)' : undefined }}>
            {output}
          </div>
        )}
      </div>
    </div>
  );
}

function RegexTool() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState('');
  const [matches, setMatches] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function test() {
    setError('');
    const res = await window.assistant.devUtils('regexTest', pattern, text, flags);
    if (res.success) {
      setMatches(res.matches);
    } else {
      setMatches([]);
      setError(res.error || '未知错误');
    }
  }

  return (
    <div className="ck-panel brackets">
      <div className="ck-tools">
        <div className="ck-input" style={{ flex: 1 }}>
          <span className="prompt">/</span>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="正则表达式"
          />
          <span className="prompt">/</span>
        </div>
        <div className="ck-input" style={{ width: 90 }}>
          <input
            value={flags}
            onChange={(e) => setFlags(e.target.value)}
            placeholder="g"
          />
        </div>
      </div>
      <div className="ck-input" style={{ marginTop: 8, padding: '6px 14px', alignItems: 'stretch' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="测试文本..."
          rows={3}
          style={textareaStyle}
        />
      </div>
      <div className="ck-tools" style={{ marginTop: 8 }}>
        <button className="ck-btn primary" onClick={test}>测试</button>
      </div>
      {error && (
        <div className="ck-term" style={{ marginTop: 8, color: 'var(--red)' }}>{error}</div>
      )}
      {matches.length > 0 && (
        <div className="ck-term" style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto' }}>
          <div className="ck-dim">匹配 {matches.length} 项:</div>
          {matches.map((m, i) => (
            <div key={i} className="ck-phos">{m}</div>
          ))}
        </div>
      )}
      {matches.length === 0 && !error && (
        <div className="ck-dim" style={{ marginTop: 8, fontSize: 12 }}>无匹配结果</div>
      )}
    </div>
  );
}

function UuidTool() {
  const [uuids, setUuids] = useState<string[]>([]);
  const [version, setVersion] = useState<'v4' | 'v7'>('v4');

  async function generate() {
    const res = await window.assistant.devUtils('uuidGenerate', version);
    setUuids((prev) => [res, ...prev].slice(0, 20));
  }

  async function generateBatch(n: number) {
    const results: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await window.assistant.devUtils('uuidGenerate', version);
      results.push(res);
    }
    setUuids((prev) => [...results, ...prev].slice(0, 20));
  }

  return (
    <div className="ck-panel brackets">
      <div className="ck-tools">
        <button className={'ck-chip' + (version === 'v4' ? ' on' : '')} onClick={() => setVersion('v4')}>V4</button>
        <button className={'ck-chip' + (version === 'v7' ? ' on' : '')} onClick={() => setVersion('v7')}>V7</button>
        <div className="ck-spacer" />
        <button className="ck-btn primary" onClick={generate}>生成一个</button>
        <button className="ck-btn" onClick={() => generateBatch(5)}>生成 5 个</button>
      </div>
      {uuids.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto' }}>
          <div className="ck-hairline" style={{ margin: '0 0 4px' }}>GENERATED // 已生成 <span className="n">{uuids.length}</span></div>
          {uuids.map((u, i) => (
            <div key={i} className="ck-row">
              <code className="ck-sub" style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', fontSize: 12 }}>{u}</code>
              <button className="ck-btn" onClick={() => navigator.clipboard.writeText(u)}>复制</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import {
  Box, Button, Flex, Textarea, Input, Text, Code, Tabs, TabList, Tab, TabPanels, TabPanel,
} from '@chakra-ui/react';

type Tool = 'json' | 'sql' | 'base64' | 'timestamp' | 'regex' | 'uuid';

export default function DevUtils() {
  const [active, setActive] = useState<Tool>('json');

  return (
    <Box>
      <Tabs index={['json','sql','base64','timestamp','regex','uuid'].indexOf(active)} onChange={(i) => setActive(['json','sql','base64','timestamp','regex','uuid'][i] as Tool)} size="sm" variant="soft-rounded" colorScheme="blue" mb={1.5}>
        <TabList gap={1}>
          <Tab>JSON</Tab>
          <Tab>SQL</Tab>
          <Tab>Base64</Tab>
          <Tab>时间戳</Tab>
          <Tab>正则</Tab>
          <Tab>UUID</Tab>
        </TabList>
      </Tabs>

      <Box>
        {active === 'json' && <JsonTool />}
        {active === 'sql' && <SqlTool />}
        {active === 'base64' && <Base64Tool />}
        {active === 'timestamp' && <TimestampTool />}
        {active === 'regex' && <RegexTool />}
        {active === 'uuid' && <UuidTool />}
      </Box>
    </Box>
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
    <Box>
      <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="粘贴 JSON 字符串..." size="sm" rows={4} mb={1} fontFamily="mono" />
      <Button size="sm" colorScheme="blue" onClick={format} mb={1}>格式化</Button>
      {output && (
        <Box as="pre" mt={2} p={2} bg={error ? 'red.50' : 'gray.50'} borderRadius="md" fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-all" maxH={300} overflow="auto" color={error ? 'red.600' : undefined}>
          {output}
        </Box>
      )}
    </Box>
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
    <Box>
      <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="粘贴 SQL 语句..." size="sm" rows={5} mb={1} fontFamily="mono" />
      <Flex gap={2} mb={1}>
        <Button size="sm" colorScheme="blue" onClick={() => handle('sqlFormat')}>美化</Button>
        <Button size="sm" variant="outline" onClick={() => handle('sqlCompress')}>压缩</Button>
      </Flex>
      {output && (
        <Box as="pre" mt={2} p={2} bg={error ? 'red.50' : 'gray.50'} borderRadius="md" fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-all" maxH={300} overflow="auto" color={error ? 'red.600' : undefined}>
          {output}
        </Box>
      )}
    </Box>
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
    <Box>
      <Flex gap={2} mb={1}>
        <Button size="xs" colorScheme={mode === 'encode' ? 'blue' : 'gray'} variant={mode === 'encode' ? 'solid' : 'outline'} onClick={() => { setMode('encode'); setOutput(''); }}>编码</Button>
        <Button size="xs" colorScheme={mode === 'decode' ? 'blue' : 'gray'} variant={mode === 'decode' ? 'solid' : 'outline'} onClick={() => { setMode('decode'); setOutput(''); }}>解码</Button>
        <Button size="xs" colorScheme={mode === 'tofile' ? 'blue' : 'gray'} variant={mode === 'tofile' ? 'solid' : 'outline'} onClick={() => { setMode('tofile'); setOutput(''); setFileName(''); }}>转文件</Button>
      </Flex>
      {mode === 'tofile' && (
        <Flex gap={2} mb={1}>
          <Input size="sm" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="文件名（可选，自动识别）" flex={1} />
        </Flex>
      )}
      <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === 'tofile' ? '粘贴 Base64 或 data: URI...' : mode === 'encode' ? '输入原始文本...' : '输入 Base64 字符串...'} size="sm" rows={4} mb={1} fontFamily="mono" />
      <Button size="sm" colorScheme="blue" onClick={handle} mb={1}>{mode === 'tofile' ? '下载文件' : mode === 'encode' ? '编码' : '解码'}</Button>
      {output && (
        <Box as="pre" mt={2} p={2} bg={error ? 'red.50' : 'gray.50'} borderRadius="md" fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-all" maxH={300} overflow="auto" color={error ? 'red.600' : undefined}>
          {output}
        </Box>
      )}
    </Box>
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
    <Box>
      <Box bg="gray.50" borderRadius="md" p={2} mb={2}>
        <Text fontSize="xs" color="gray.500" mb={1}>当前时间</Text>
        {currentFormats.map((item) => (
          <Flex key={item.label} gap={2} align="center" py={0.5}>
            <Text fontSize="xs" color="gray.500" w="72px" shrink={0}>{item.label}</Text>
            <Code flex={1} fontSize="xs" whiteSpace="normal" wordBreak="break-all">{item.value}</Code>
            <Button size="xs" variant="outline" onClick={() => setInput(item.value)}>填入</Button>
          </Flex>
        ))}
      </Box>

      <Flex gap={2} mb={1}>
        <Button size="xs" colorScheme={mode === 'ts2date' ? 'blue' : 'gray'} variant={mode === 'ts2date' ? 'solid' : 'outline'} onClick={() => { setMode('ts2date'); setOutput(''); }}>时间戳 → 日期</Button>
        <Button size="xs" colorScheme={mode === 'date2ts' ? 'blue' : 'gray'} variant={mode === 'date2ts' ? 'solid' : 'outline'} onClick={() => { setMode('date2ts'); setOutput(''); }}>日期 → 时间戳</Button>
      </Flex>
      <Flex gap={2} mb={1}>
        <Input size="sm" value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === 'ts2date' ? '输入时间戳（秒或毫秒）' : '输入日期（如 2024-01-01）'} flex={1} />
        <Button size="xs" colorScheme="gray" onClick={fillNow}>当前</Button>
      </Flex>
      <Button size="sm" colorScheme="blue" onClick={handle} mb={1}>转换</Button>
      {output && (
        <Box as="pre" mt={2} p={2} bg={error ? 'red.50' : 'gray.50'} borderRadius="md" fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-all" maxH={300} overflow="auto" color={error ? 'red.600' : undefined}>
          {output}
        </Box>
      )}
    </Box>
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
    <Box>
      <Flex gap={1} mb={1} align="center">
        <Text fontSize="sm" color="gray.400" fontWeight="bold">/</Text>
        <Input size="sm" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="正则表达式" flex={1} />
        <Text fontSize="sm" color="gray.400" fontWeight="bold">/</Text>
        <Input size="sm" value={flags} onChange={(e) => setFlags(e.target.value)} placeholder="g" w="60px" />
      </Flex>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="测试文本..." size="sm" rows={3} mb={1} fontFamily="mono" />
      <Button size="sm" colorScheme="blue" onClick={test} mb={1}>测试</Button>
      {error && (
        <Box mt={2} p={2} bg="red.50" borderRadius="md" fontSize="sm" color="red.600">{error}</Box>
      )}
      {matches.length > 0 && (
        <Box mt={2} p={2} bg="gray.50" borderRadius="md" fontSize="sm" maxH={300} overflow="auto">
          <Text fontSize="xs" color="gray.500" mb={1}>匹配 {matches.length} 项:</Text>
          {matches.map((m, i) => <Code key={i} display="block" fontSize="xs" py={0.5}>{m}</Code>)}
        </Box>
      )}
      {matches.length === 0 && !error && <Text color="gray.400" fontSize="sm">无匹配结果</Text>}
    </Box>
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
    <Box>
      <Flex gap={2} mb={1} align="center">
        <Button size="xs" colorScheme={version === 'v4' ? 'blue' : 'gray'} variant={version === 'v4' ? 'solid' : 'outline'} onClick={() => setVersion('v4')}>V4</Button>
        <Button size="xs" colorScheme={version === 'v7' ? 'blue' : 'gray'} variant={version === 'v7' ? 'solid' : 'outline'} onClick={() => setVersion('v7')}>V7</Button>
        <Button size="sm" colorScheme="blue" onClick={generate}>生成一个</Button>
        <Button size="xs" colorScheme="gray" onClick={() => generateBatch(5)}>生成 5 个</Button>
      </Flex>
      {uuids.length > 0 && (
        <Box mt={2} p={2} bg="gray.50" borderRadius="md" maxH={300} overflow="auto">
          {uuids.map((u, i) => (
            <Flex key={i} align="center" gap={2} py={1}>
              <Code flex={1} fontSize="xs" wordBreak="break-all">{u}</Code>
              <Button size="xs" variant="outline" onClick={() => navigator.clipboard.writeText(u)}>复制</Button>
            </Flex>
          ))}
        </Box>
      )}
    </Box>
  );
}

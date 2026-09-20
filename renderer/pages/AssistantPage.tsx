import React, { useEffect, useRef, useState } from 'react';
import { useThemeMode } from '../theme';
import { useToast } from '@chakra-ui/react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import '@uiw/react-markdown-preview/markdown.css';
import { Brain, ChevronDown, ChevronRight, FileAudio, FileText, Image as ImageIcon, Paperclip, Plus, Send, Square, Trash2, X } from 'lucide-react';
import type { AiChatResponse, AiMessage, AiMessageContentPart, CliCommandResult } from '../../src/shared/types';

interface ChatAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  kind: 'image' | 'audio' | 'file';
}

interface PendingCliCall {
  id: string;
  command: string;
  cwd?: string;
  reason?: string;
  status: 'pending' | 'running' | 'completed' | 'rejected' | 'failed';
  result?: CliCommandResult;
}

interface ChatMessage extends AiMessage {
  id: string;
  content: string;
  reasoning?: string;
  meta?: string;
  attachments?: ChatAttachment[];
  hidden?: boolean;
  cliCall?: PendingCliCall;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
}

const SESSIONS_KEY = 'uuutil:assistant:sessions';
const ACTIVE_SESSION_KEY = 'uuutil:assistant:active-session';
const ASIDE_WIDTH_KEY = 'uuutil:assistant:aside-width';
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const CLI_TOOL_BLOCK_PATTERN = /```uuutil-cli\s*([\s\S]*?)```/i;
const ASSISTANT_SYSTEM_PROMPT = `你是 UUUtil 的桌面助手。请直接回答用户问题。若用户提供图片，请结合图片内容回答；若用户提供音频或文件，而当前模型不支持直接解析，请说明可处理的信息边界。

你可以请求调用本地 CLI 工具，但必须遵守：
1. 只有在确实需要读取项目状态、运行构建、执行查询或调用本地工具时才请求 CLI。
2. 不要请求破坏性命令、权限提升命令、后台常驻命令或联网下载安装脚本。
3. 请求 CLI 时只输出一个 JSON 工具块，格式如下：
\`\`\`uuutil-cli
{"command":"ls ~/Desktop","cwd":".","reason":"查看桌面文件"}
\`\`\`
4. 工具块会先展示给用户确认，执行结果会作为下一条消息返回给你，然后你再基于结果继续回答。
5. 默认工作目录是用户主目录；cwd 必须位于用户主目录内，可用 "~" 或相对路径（例如 "Desktop"、"~/Desktop"）。

当前系统是 macOS，命令需遵循 BSD/macOS 约定，注意与 Linux 的差异：
- 解压 gzip 文件用 \`gzcat\` 或 \`gunzip -c\`，不要用 \`zcat\`（macOS 的 zcat 只处理 .Z 文件且会自动追加 .Z 后缀，对 gzip 文件会报错）。
- 文件扩展名可能与实际格式不符，必要时先用 \`file <路径>\` 判断真实类型再选择命令。
- 查看或解包 .tar.gz / .tgz 用 \`tar -tzf\`（列内容）或 \`tar -xzf\`（解包）。
- date、sed、stat、find 等命令的参数风格与 GNU 版本不同，遇到报错时优先使用 BSD 语法。`;


function makeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createEmptySession(): ChatSession {
  return { id: makeId(), title: '新对话', messages: [], updatedAt: nowIso() };
}

function inferAttachmentKind(mime: string): ChatAttachment['kind'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

function defaultAttachmentName(mime: string): string {
  if (mime.includes('png')) return '粘贴图片.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '粘贴图片.jpg';
  if (mime.includes('webp')) return '粘贴图片.webp';
  if (mime.includes('gif')) return '粘贴图片.gif';
  if (mime.includes('wav')) return '粘贴音频.wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return '粘贴音频.mp3';
  if (mime.includes('webm')) return '粘贴音频.webm';
  if (mime.includes('ogg')) return '粘贴音频.ogg';
  return '剪贴板附件';
}

function audioFormat(mime: string): string | undefined {
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  return undefined;
}

function attachmentIcon(kind: ChatAttachment['kind']) {
  if (kind === 'image') return ImageIcon;
  if (kind === 'audio') return FileAudio;
  return FileText;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(durationMs?: number): string | undefined {
  if (durationMs === undefined) return undefined;
  return `耗时 ${(durationMs / 1000).toFixed(1)}s`;
}

function formatUsage(usage?: AiChatResponse['usage']): string | undefined {
  if (!usage) return undefined;
  const parts = [
    usage.promptTokens !== undefined ? `输入 ${usage.promptTokens}` : undefined,
    usage.completionTokens !== undefined ? `输出 ${usage.completionTokens}` : undefined,
    usage.totalTokens !== undefined ? `总计 ${usage.totalTokens}` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? `Token：${parts.join(' / ')}` : undefined;
}

function createFooterMeta(response: AiChatResponse): string | undefined {
  const stats = [formatDuration(response.durationMs), formatUsage(response.usage)].filter(Boolean).join(' · ');
  const warning = response.finishReason === 'length' ? '回答已达到模型输出长度上限，可能被截断。可以继续追问“从下一条继续”。' : undefined;
  return [stats || undefined, warning].filter(Boolean).join('\n');
}

function parsePendingCliCall(content: string): { displayContent: string; cliCall?: PendingCliCall } {
  const match = content.match(CLI_TOOL_BLOCK_PATTERN);
  if (!match) return { displayContent: content };

  try {
    const parsed = JSON.parse(match[1].trim()) as { command?: string; cwd?: string; reason?: string };
    if (!parsed.command || typeof parsed.command !== 'string') return { displayContent: content };
    return {
      displayContent: content.replace(match[0], '').trim() || '需要调用本地 CLI 工具，请确认后执行。',
      cliCall: {
        id: makeId(),
        command: parsed.command,
        cwd: parsed.cwd,
        reason: parsed.reason,
        status: 'pending',
      },
    };
  } catch {
    return { displayContent: content };
  }
}

function formatCliResultForModel(result: CliCommandResult): string {
  return [
    '[CLI 执行结果]',
    `command: ${result.command}`,
    `cwd: ${result.cwd}`,
    `success: ${result.success}`,
    `exitCode: ${result.exitCode ?? 'unknown'}`,
    `durationMs: ${result.durationMs}`,
    result.timedOut ? 'timedOut: true' : undefined,
    result.error ? `error: ${result.error}` : undefined,
    result.stdout ? `stdout:\n${result.stdout}` : 'stdout: <empty>',
    result.stderr ? `stderr:\n${result.stderr}` : 'stderr: <empty>',
  ].filter(Boolean).join('\n');
}

function ReasoningBlock({ reasoning }: { reasoning: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ck-reason">
      <button type="button" className="ck-reason-head" onClick={() => setOpen((prev) => !prev)}>
        <Brain size={12} />
        <span>思考过程</span>
        <span style={{ marginLeft: 'auto', display: 'flex' }}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
      </button>
      {open && <div className="ck-reason-body">{reasoning}</div>}
    </div>
  );
}

function MessageBubble({ message, streaming, onConfirmCliCall, onRejectCliCall }: { message: ChatMessage; streaming?: boolean; onConfirmCliCall?: (messageId: string) => void; onRejectCliCall?: (messageId: string) => void }) {
  const isUser = message.role === 'user';
  const { mode: themeMode } = useThemeMode();
  return (
    <div className={'ck-msg' + (isUser ? ' user' : '')}>
      <div className="who">{isUser ? 'YOU ›' : 'SYS ›'}</div>
      <div className="bubble">
        {message.attachments && message.attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: message.content ? 8 : 0 }}>
            {message.attachments.map((attachment) => {
              const Icon = attachmentIcon(attachment.kind);
              return (
                <div key={attachment.id} className="ck-att">
                  {attachment.kind === 'image' ? (
                    <img src={attachment.dataUrl} alt={attachment.name} style={{ maxHeight: 60, maxWidth: 140, objectFit: 'cover', borderRadius: 2 }} />
                  ) : (
                    <>
                      <Icon size={12} />
                      <span className="ck-att-name">{attachment.name}</span>
                      <span className="ck-dim" style={{ fontSize: 9 }}>{formatFileSize(attachment.size)}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        ) : (
          <>
            {message.reasoning && <ReasoningBlock reasoning={message.reasoning} />}
            {message.content && <MarkdownPreview source={message.content} skipHtml wrapperElement={{ 'data-color-mode': themeMode === 'cockpit' ? 'dark' : 'light' }} />}
          </>
        )}
        {streaming && <span className="ck-caret" style={{ height: 13, display: 'inline-block', verticalAlign: -2, marginLeft: 2 }} />}
        {message.cliCall && (
          <div className="ck-panel brackets ck-cli">
            <div className="ck-warn" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', marginBottom: 4 }}>待确认 CLI 工具调用</div>
            {message.cliCall.reason && <div className="ck-sub" style={{ fontSize: 11, marginBottom: 6 }}>{message.cliCall.reason}</div>}
            <div className="ck-term">{message.cliCall.command}</div>
            {message.cliCall.cwd && <div className="ck-dim" style={{ fontSize: 10, marginTop: 4 }}>cwd: {message.cliCall.cwd}</div>}
            {message.cliCall.result && <div className="ck-term" style={{ marginTop: 8 }}>{formatCliResultForModel(message.cliCall.result)}</div>}
            {message.cliCall.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                <button className="ck-btn" style={{ color: 'var(--green)', borderColor: 'rgba(52,211,153,0.45)', background: 'rgba(52,211,153,0.06)' }} onClick={() => onConfirmCliCall?.(message.id)}>确认执行</button>
                <button className="ck-btn danger" onClick={() => onRejectCliCall?.(message.id)}>拒绝</button>
              </div>
            )}
            {message.cliCall.status === 'running' && <div className="ck-warn" style={{ fontSize: 11, marginTop: 6 }}>命令执行中...</div>}
            {message.cliCall.status === 'rejected' && <div className="ck-dim" style={{ fontSize: 11, marginTop: 6 }}>已拒绝执行。</div>}
            {message.cliCall.status === 'failed' && <div className="ck-err" style={{ fontSize: 11, marginTop: 6 }}>执行失败。</div>}
            {message.cliCall.status === 'completed' && <div className="ck-ok" style={{ fontSize: 11, marginTop: 6 }}>执行完成，已将结果回传给助手。</div>}
          </div>
        )}
        {message.meta && (
          <div className="ck-dim" style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--line)', fontSize: 10, letterSpacing: '0.05em', whiteSpace: 'pre-wrap' }}>
            {message.meta}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]') as ChatSession[];
      return parsed.length > 0 ? parsed : [createEmptySession()];
    } catch {
      return [createEmptySession()];
    }
  });
  const [activeSessionId, setActiveSessionId] = useState(() => localStorage.getItem(ACTIVE_SESSION_KEY) || '');
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [asideWidth, setAsideWidth] = useState(() => {
    const saved = Number(localStorage.getItem(ASIDE_WIDTH_KEY));
    return saved >= 160 && saved <= 360 ? saved : 220;
  });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeStreamRef = useRef<{ cancel: () => Promise<any>; assistantId: string } | null>(null);
  const asideResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const toast = useToast();
  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0];
  const messages = activeSession?.messages || [];

  useEffect(() => {
    if (!activeSessionId && sessions[0]) setActiveSessionId(sessions[0].id);
  }, [activeSessionId, sessions]);

  useEffect(() => {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (activeSessionId) localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
  }, [activeSessionId]);

  function updateActiveSessionMessages(updater: (messages: ChatMessage[]) => ChatMessage[]) {
    setSessions((prev) => prev.map((session) => {
      if (session.id !== activeSession?.id) return session;
      const nextMessages = updater(session.messages);
      const firstUserMessage = nextMessages.find((message) => message.role === 'user');
      return {
        ...session,
        title: firstUserMessage ? firstUserMessage.content.slice(0, 24) || '附件对话' : session.title,
        messages: nextMessages,
        updatedAt: nowIso(),
      };
    }));
  }

  function createSession() {
    if (isSending) return;
    const session = createEmptySession();
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setInput('');
    setAttachments([]);
  }

  function clearCurrentSession() {
    if (isSending || !activeSession) return;
    updateActiveSessionMessages(() => []);
  }

  function switchSession(sessionId: string) {
    if (isSending) return;
    setActiveSessionId(sessionId);
    setInput('');
    setAttachments([]);
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const node = viewportRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  // 会话侧栏拖拽调宽（160–360px，localStorage 持久化）
  function startAsideResize(e: React.MouseEvent) {
    e.preventDefault();
    asideResizeRef.current = { startX: e.clientX, startWidth: asideWidth };
    function onMove(ev: MouseEvent) {
      if (!asideResizeRef.current) return;
      const next = Math.min(360, Math.max(160, asideResizeRef.current.startWidth + ev.clientX - asideResizeRef.current.startX));
      setAsideWidth(next);
    }
    function onUp() {
      asideResizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setAsideWidth((width) => {
        localStorage.setItem(ASIDE_WIDTH_KEY, String(width));
        return width;
      });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function fileToAttachment(file: File): Promise<ChatAttachment> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        id: makeId(),
        name: file.name || defaultAttachmentName(file.type || 'application/octet-stream'),
        mime: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: String(reader.result || ''),
        kind: inferAttachmentKind(file.type || 'application/octet-stream'),
      });
      reader.onerror = () => reject(new Error('附件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return;

    const oversized = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
    if (oversized) {
      toast({ title: '附件过大', description: `${oversized.name || defaultAttachmentName(oversized.type)} 超过 8MB`, status: 'warning', duration: 2500 });
      return;
    }

    try {
      const nextAttachments = await Promise.all(files.map(fileToAttachment));
      setAttachments((prev) => [...prev, ...nextAttachments]);
    } catch (error) {
      const description = error instanceof Error ? error.message : '附件读取失败';
      toast({ title: '附件读取失败', description, status: 'error', duration: 2500 });
    }
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    await addFiles(files);
  }

  function removeAttachment(attachmentId: string) {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  }

  function createModelContent(content: string, messageAttachments: ChatAttachment[]): AiMessage['content'] {
    const parts: AiMessageContentPart[] = [];
    const fileAttachments = messageAttachments.filter((attachment) => attachment.kind === 'file');
    const imageAttachments = messageAttachments.filter((attachment) => attachment.kind === 'image');
    const audioAttachments = messageAttachments.filter((attachment) => attachment.kind === 'audio');
    const fileNote = fileAttachments.length > 0
      ? `\n\n[附件文件]\n${fileAttachments.map((attachment) => `- ${attachment.name} (${attachment.mime}, ${formatFileSize(attachment.size)})`).join('\n')}`
      : '';
    parts.push({ type: 'text', text: `${content || '请分析这些附件。'}${fileNote}` });
    imageAttachments.forEach((attachment) => parts.push({ type: 'image_url', image_url: { url: attachment.dataUrl } }));
    audioAttachments.forEach((attachment) => {
      const base64 = attachment.dataUrl.split(',')[1] || '';
      parts.push({ type: 'input_audio', input_audio: { data: base64, format: audioFormat(attachment.mime) } });
    });
    return parts.length === 1 && fileAttachments.length === 0 && imageAttachments.length === 0 && audioAttachments.length === 0 ? content : parts;
  }

  function stopGeneration() {
    const stream = activeStreamRef.current;
    if (!stream) return;
    stream.cancel();
    updateActiveSessionMessages((prev) => prev.map((message) => (
      message.id === stream.assistantId
        ? { ...message, content: message.content === '' ? '已停止生成。' : message.content, meta: message.meta ? `${message.meta}\n已手动停止。` : '已手动停止。' }
        : message
    )));
    activeStreamRef.current = null;
    setStreamingId(null);
    setIsSending(false);
  }

  function createAiMessages(nextMessages: ChatMessage[]): AiMessage[] {
    return [
      { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
      ...nextMessages.map((message) => ({
        role: message.role,
        content: message.role === 'user' ? createModelContent(message.content, message.attachments || []) : message.content,
      })),
    ];
  }

  async function generateAssistantResponse(nextMessages: ChatMessage[]) {
    if (!activeSession) return;

    setIsSending(true);
    scrollToBottom();

    const assistantId = makeId();
    try {
      updateActiveSessionMessages(() => [...nextMessages, { id: assistantId, role: 'assistant', content: '' }]);
      setStreamingId(assistantId);

      const stream = window.assistant.ai.chatStream({
        messages: createAiMessages(nextMessages),
        maxTokens: 4096,
        timeoutMs: 120000,
      }, (chunk: string) => {
        updateActiveSessionMessages((prev) => prev.map((message) => (
          message.id === assistantId
            ? { ...message, content: message.content + chunk }
            : message
        )));
        scrollToBottom();
      }, (reasoningChunk: string) => {
        updateActiveSessionMessages((prev) => prev.map((message) => (
          message.id === assistantId
            ? { ...message, reasoning: (message.reasoning || '') + reasoningChunk }
            : message
        )));
        scrollToBottom();
      });
      activeStreamRef.current = { cancel: stream.cancel, assistantId };
      const response = await stream.promise as AiChatResponse;

      if (!response.success) {
        if (!activeStreamRef.current || activeStreamRef.current.assistantId !== assistantId) return;
        throw new Error(response.error || 'AI 调用失败');
      }
      updateActiveSessionMessages((prev) => prev.map((message) => {
        if (message.id !== assistantId) return message;
        const finalContent = response.content || message.content;
        const parsed = parsePendingCliCall(finalContent);
        return {
          ...message,
          content: parsed.displayContent || '模型没有返回正文。',
          reasoning: response.reasoning || message.reasoning,
          cliCall: parsed.cliCall,
          meta: createFooterMeta(response),
        };
      }));
      scrollToBottom();
    } catch (error) {
      if (!activeStreamRef.current || activeStreamRef.current.assistantId !== assistantId) return;
      const description = error instanceof Error ? error.message : 'AI 调用失败';
      toast({ title: '发送失败', description, status: 'error', duration: 3000 });
      updateActiveSessionMessages((prev) => prev.map((message) => (
        message.id === assistantId
          ? { ...message, content: message.content === '' ? `调用失败：${description}` : `${message.content}\n\n调用失败：${description}` }
          : message
      )));
      scrollToBottom();
    } finally {
      if (activeStreamRef.current?.assistantId === assistantId) activeStreamRef.current = null;
      setStreamingId(null);
      setIsSending(false);
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if ((!content && attachments.length === 0) || isSending || !activeSession) return;

    const messageAttachments = attachments;
    const userMessage: ChatMessage = { id: makeId(), role: 'user', content, attachments: messageAttachments };
    const nextMessages = [...messages, userMessage];
    updateActiveSessionMessages(() => nextMessages);
    setInput('');
    setAttachments([]);
    await generateAssistantResponse(nextMessages);
  }

  async function confirmCliCall(messageId: string) {
    if (isSending || !activeSession) return;
    const target = messages.find((message) => message.id === messageId);
    if (!target?.cliCall || target.cliCall.status !== 'pending') return;

    updateActiveSessionMessages((prev) => prev.map((message) => (
      message.id === messageId && message.cliCall ? { ...message, cliCall: { ...message.cliCall, status: 'running' } } : message
    )));

    const result = await window.assistant.cli.execute({ command: target.cliCall.command, cwd: target.cliCall.cwd });
    const resultMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: formatCliResultForModel(result),
      hidden: true,
    };
    const nextMessages = [...messages.map((message) => (
      message.id === messageId && message.cliCall ? { ...message, cliCall: { ...message.cliCall, status: result.success ? 'completed' : 'failed', result } } : message
    )), resultMessage];
    updateActiveSessionMessages(() => nextMessages);

    if (result.success) {
      await generateAssistantResponse(nextMessages);
    } else {
      toast({ title: 'CLI 执行失败', description: result.error || result.stderr || '命令返回非 0 状态码', status: 'error', duration: 3000 });
    }
  }

  function rejectCliCall(messageId: string) {
    if (isSending) return;
    updateActiveSessionMessages((prev) => prev.map((message) => (
      message.id === messageId && message.cliCall ? { ...message, cliCall: { ...message.cliCall, status: 'rejected' } } : message
    )));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const itemFiles = Array.from(event.clipboardData.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const files = itemFiles.length > 0 ? itemFiles : Array.from(event.clipboardData.files || []);
    if (files.length === 0) return;

    event.preventDefault();
    await addFiles(files);
  }

  return (
    <div className="ck" style={{ padding: '14px 16px 14px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head" style={{ marginBottom: 0 }}>
        <span className="code">UPLINK</span>
        <span className="zh">助手</span>
        <span className="sub">COMMS // 流式会话</span>
      </div>
      <style>{`
        .ck-msg .bubble .wmde-markdown{background:transparent;color:inherit;font-size:inherit;line-height:1.7;font-family:inherit}
        .ck-msg .bubble .wmde-markdown h1,.ck-msg .bubble .wmde-markdown h2,.ck-msg .bubble .wmde-markdown h3{border-bottom:0;margin:8px 0;padding:0;font-weight:700}
        .ck-msg .bubble .wmde-markdown h1{font-size:1.15em}.ck-msg .bubble .wmde-markdown h2{font-size:1.08em}.ck-msg .bubble .wmde-markdown h3{font-size:1em}
        .ck-msg .bubble .wmde-markdown p,.ck-msg .bubble .wmde-markdown ul,.ck-msg .bubble .wmde-markdown ol,.ck-msg .bubble .wmde-markdown blockquote,.ck-msg .bubble .wmde-markdown pre{margin-bottom:8px}
        .ck-msg .bubble .wmde-markdown ul,.ck-msg .bubble .wmde-markdown ol{padding-left:20px}
        .ck-msg .bubble .wmde-markdown li+li{margin-top:4px}
        .ck-msg .bubble .wmde-markdown hr{margin:12px 0;border-color:var(--line)}
        .ck-msg .bubble .wmde-markdown pre{border-radius:3px;overflow-x:auto}
        .ck-msg .bubble .wmde-markdown>:last-child{margin-bottom:0}
        /* 思考过程块（ck 面板样式） */
        .ck-reason{margin-bottom:8px;border:1px solid var(--line);border-radius:3px;background:rgba(4,9,18,0.5);overflow:hidden;font-size:11px}
        .ck-reason-head{display:flex;align-items:center;gap:6px;width:100%;padding:5px 9px;color:var(--ink-3);letter-spacing:0.1em;background:none;border:none;font-family:inherit;font-size:10px;cursor:pointer}
        .ck-reason-head:hover{color:var(--ink-2)}
        .ck-reason-body{padding:6px 9px 8px;border-top:1px solid var(--line);color:var(--ink-3);line-height:1.6;white-space:pre-wrap}
        /* 附件 chip */
        .ck-att{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:3px;padding:3px 8px;font-size:10px;color:var(--ink-2);max-width:190px}
        .ck-att-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        /* CLI 确认块（琥珀角括号面板） */
        .ck-cli{margin-top:10px;border-color:rgba(251,191,36,0.35);background:rgba(251,191,36,0.04)}
        .ck-cli::before,.ck-cli::after{border-color:var(--amber)}
        /* 侧栏拖拽手柄 */
        .uplink-resizer{width:5px;flex-shrink:0;cursor:col-resize;position:relative}
        .uplink-resizer::after{content:'';position:absolute;top:0;bottom:0;left:2px;width:1px;background:var(--line);transition:all .15s ease}
        .uplink-resizer:hover::after,.uplink-resizer.active::after{left:1px;width:3px;background:var(--line-strong);box-shadow:0 0 8px rgba(103,232,249,0.35)}
      `}</style>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div className="ck-aside" style={{ width: asideWidth, minWidth: asideWidth, borderRight: 'none', padding: '4px 2px 0 0' }}>
          <div className="ck-hairline" style={{ marginTop: 0 }}>SESSIONS</div>
          <button className="ck-btn primary" style={{ justifyContent: 'center' }} onClick={createSession} disabled={isSending}>
            <Plus size={13} /> 新对话
          </button>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sessions.map((session) => (
              <div
                key={session.id}
                className={'ck-chip' + (session.id === activeSession?.id ? ' on' : '')}
                style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: 2, width: '100%' }}
                onClick={() => switchSession(session.id)}
              >
                <span style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{session.title}</span>
                <span className="ck-dim" style={{ fontSize: 9 }}>{session.messages.length} MSGS</span>
              </div>
            ))}
          </div>
          <button className="ck-btn danger" style={{ justifyContent: 'center' }} onClick={clearCurrentSession} disabled={isSending || messages.length === 0}>
            <Trash2 size={12} /> 清空当前
          </button>
        </div>
        <div className="uplink-resizer" onMouseDown={startAsideResize} title="拖拽调整侧栏宽度" />

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', paddingLeft: 12 }}>
          <div ref={viewportRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '4px 8px 4px 2px' }}>
          {messages.length === 0 ? (
            <div className="ck-empty" style={{ margin: '48px 24px' }}>
              <div className="code">COMMS STANDBY</div>
              等待上行链路 · 通用问答 / 改写 / 总结 / 方案讨论
            </div>
          ) : (
            messages.filter((message) => !message.hidden).map((message) => (
              <MessageBubble key={message.id} message={message} streaming={message.id === streamingId} onConfirmCliCall={confirmCliCall} onRejectCliCall={rejectCliCall} />
            ))
          )}
        </div>

        <div style={{ padding: '10px 0 0', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,audio/*,.txt,.md,.json,.csv,.pdf"
            style={{ display: 'none' }}
            onChange={handleFilesSelected}
          />
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {attachments.map((attachment) => {
                const Icon = attachmentIcon(attachment.kind);
                return (
                  <div key={attachment.id} className="ck-att">
                    <Icon size={12} />
                    <span className="ck-att-name" style={{ flex: 1, minWidth: 0 }}>{attachment.name}</span>
                    <span className="ck-dim" style={{ fontSize: 9 }}>{formatFileSize(attachment.size)}</span>
                    <button className="ck-ico" style={{ width: 16, height: 16 }} title="移除附件" onClick={() => removeAttachment(attachment.id)}><X size={11} /></button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="ck-input" style={{ alignItems: 'flex-end' }}>
            <span className="prompt">›</span>
            <button className="ck-ico" title="添加附件" onClick={() => fileInputRef.current?.click()} disabled={isSending}><Paperclip size={15} /></button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="向助手提问…（Enter 发送，Shift+Enter 换行，可粘贴附件）"
              rows={2}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12.5, resize: 'none', maxHeight: 140 }}
              disabled={isSending}
            />
            <kbd>↵</kbd>
            {isSending ? (
              <button className="ck-btn danger" onClick={stopGeneration}><Square size={13} /> 停止</button>
            ) : (
              <button className="ck-btn primary" onClick={() => void sendMessage()} disabled={!input.trim() && attachments.length === 0}><Send size={14} /> 发送</button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

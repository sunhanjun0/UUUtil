import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Collapse, Flex, Heading, IconButton, Text, Textarea, useDisclosure, useToast } from '@chakra-ui/react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import '@uiw/react-markdown-preview/markdown.css';
import { Bot, Brain, ChevronDown, ChevronRight, FileAudio, FileText, Image as ImageIcon, Paperclip, Plus, Send, Square, Trash2, User, X } from 'lucide-react';
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
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: false });
  return (
    <Box mb={2} border="1px solid" borderColor="gray.200" borderRadius="md" bg="gray.50" overflow="hidden">
      <Flex
        as="button"
        type="button"
        onClick={onToggle}
        align="center"
        gap={1}
        w="100%"
        px={2}
        py={1.5}
        color="gray.500"
        fontSize="xs"
        fontWeight="medium"
        _hover={{ color: 'gray.700', bg: 'gray.100' }}
      >
        <Brain size={13} />
        <Text>思考过程</Text>
        <Box ml="auto">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Box>
      </Flex>
      <Collapse in={isOpen} animateOpacity>
        <Box px={2} pb={2} pt={1} borderTop="1px solid" borderColor="gray.200">
          <Text whiteSpace="pre-wrap" fontSize="xs" color="gray.500" lineHeight="1.6">
            {reasoning}
          </Text>
        </Box>
      </Collapse>
    </Box>
  );
}

function MessageBubble({ message, onConfirmCliCall, onRejectCliCall }: { message: ChatMessage; onConfirmCliCall?: (messageId: string) => void; onRejectCliCall?: (messageId: string) => void }) {
  const isUser = message.role === 'user';
  return (
    <Flex justify={isUser ? 'flex-end' : 'flex-start'} mb={3} gap={2}>
      {!isUser && (
        <Flex w="28px" h="28px" borderRadius="full" bg="blue.50" color="blue.600" align="center" justify="center" flexShrink={0}>
          <Bot size={15} />
        </Flex>
      )}
      <Box
        maxW={isUser ? '78%' : '88%'}
        minW={0}
        bg={isUser ? 'blue.500' : 'white'}
        color={isUser ? 'white' : 'gray.800'}
        border="1px solid"
        borderColor={isUser ? 'blue.500' : 'gray.100'}
        borderRadius="lg"
        px={3}
        py={2}
        boxShadow={isUser ? '0 8px 20px rgba(37, 99, 235, 0.18)' : '0 8px 22px rgba(15, 23, 42, 0.06)'}
        wordBreak="break-word"
        overflowWrap="anywhere"
        fontSize="sm"
        lineHeight="1.7"
        sx={{
          '.wmde-markdown': {
            bg: 'transparent',
            color: 'inherit',
            fontSize: 'inherit',
            lineHeight: '1.7',
            fontFamily: 'inherit',
          },
          '.wmde-markdown h1, .wmde-markdown h2, .wmde-markdown h3': {
            borderBottom: '0',
            mt: 2,
            mb: 2,
            pb: 0,
            fontWeight: 700,
          },
          '.wmde-markdown h1': { fontSize: '1.15em' },
          '.wmde-markdown h2': { fontSize: '1.08em' },
          '.wmde-markdown h3': { fontSize: '1em' },
          '.wmde-markdown p, .wmde-markdown ul, .wmde-markdown ol, .wmde-markdown blockquote, .wmde-markdown pre': {
            mb: 2,
          },
          '.wmde-markdown ul, .wmde-markdown ol': {
            pl: 5,
          },
          '.wmde-markdown li + li': {
            mt: 1,
          },
          '.wmde-markdown hr': {
            my: 3,
            borderColor: 'gray.200',
          },
          '.wmde-markdown code': {
            whiteSpace: 'pre-wrap',
          },
          '.wmde-markdown pre': {
            borderRadius: 'md',
            overflowX: 'auto',
          },
          '.wmde-markdown > :last-child': {
            mb: 0,
          },
        }}
      >
        {message.attachments && message.attachments.length > 0 && (
          <Flex gap={2} wrap="wrap" mb={message.content ? 2 : 0}>
            {message.attachments.map((attachment) => {
              const Icon = attachmentIcon(attachment.kind);
              return (
                <Box key={attachment.id} border="1px solid" borderColor={isUser ? 'whiteAlpha.400' : 'gray.200'} borderRadius="md" overflow="hidden" bg={isUser ? 'whiteAlpha.200' : 'gray.50'} maxW="160px">
                  {attachment.kind === 'image' ? (
                    <Box as="img" src={attachment.dataUrl} alt={attachment.name} maxH="110px" maxW="160px" objectFit="cover" />
                  ) : (
                    <Flex align="center" gap={2} px={2} py={2}>
                      <Icon size={16} />
                      <Box minW={0}>
                        <Text fontSize="xs" noOfLines={1}>{attachment.name}</Text>
                        <Text fontSize="10px" opacity={0.75}>{formatFileSize(attachment.size)}</Text>
                      </Box>
                    </Flex>
                  )}
                </Box>
              );
            })}
          </Flex>
        )}
        {isUser ? (
          <Text whiteSpace="pre-wrap">{message.content}</Text>
        ) : (
          <>
            {message.reasoning && <ReasoningBlock reasoning={message.reasoning} />}
            <MarkdownPreview source={message.content} skipHtml wrapperElement={{ 'data-color-mode': 'light' }} />
          </>
        )}
        {message.cliCall && (
          <Box mt={3} p={3} border="1px solid" borderColor="orange.200" borderRadius="md" bg="orange.50">
            <Text fontSize="xs" fontWeight="bold" color="orange.700" mb={1}>待确认 CLI 工具调用</Text>
            {message.cliCall.reason && <Text fontSize="xs" color="gray.600" mb={2}>{message.cliCall.reason}</Text>}
            <Box as="pre" p={2} bg="gray.900" color="gray.50" borderRadius="md" overflowX="auto" fontSize="xs" whiteSpace="pre-wrap">
              {message.cliCall.command}
            </Box>
            {message.cliCall.cwd && <Text fontSize="xs" color="gray.500" mt={1}>cwd: {message.cliCall.cwd}</Text>}
            {message.cliCall.result && (
              <Box as="pre" mt={2} p={2} bg="white" border="1px solid" borderColor="gray.200" borderRadius="md" overflowX="auto" fontSize="xs" whiteSpace="pre-wrap" color="gray.700">
                {formatCliResultForModel(message.cliCall.result)}
              </Box>
            )}
            {message.cliCall.status === 'pending' && (
              <Flex gap={2} mt={2}>
                <Button size="xs" colorScheme="orange" onClick={() => onConfirmCliCall?.(message.id)}>确认执行</Button>
                <Button size="xs" variant="outline" onClick={() => onRejectCliCall?.(message.id)}>拒绝</Button>
              </Flex>
            )}
            {message.cliCall.status === 'running' && <Text fontSize="xs" color="orange.700" mt={2}>命令执行中...</Text>}
            {message.cliCall.status === 'rejected' && <Text fontSize="xs" color="gray.500" mt={2}>已拒绝执行。</Text>}
            {message.cliCall.status === 'failed' && <Text fontSize="xs" color="red.600" mt={2}>执行失败。</Text>}
            {message.cliCall.status === 'completed' && <Text fontSize="xs" color="green.600" mt={2}>执行完成，已将结果回传给助手。</Text>}
          </Box>
        )}
        {message.meta && (
          <Text mt={2} pt={2} borderTop="1px solid" borderColor={isUser ? 'whiteAlpha.300' : 'gray.100'} fontSize="xs" color={isUser ? 'whiteAlpha.800' : 'gray.500'} whiteSpace="pre-wrap">
            {message.meta}
          </Text>
        )}
      </Box>
      {isUser && (
        <Flex w="28px" h="28px" borderRadius="full" bg="gray.100" color="gray.600" align="center" justify="center" flexShrink={0}>
          <User size={15} />
        </Flex>
      )}
    </Flex>
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeStreamRef = useRef<{ cancel: () => Promise<any>; assistantId: string } | null>(null);
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
        ? { ...message, content: message.content === '正在生成...' ? '已停止生成。' : message.content, meta: message.meta ? `${message.meta}\n已手动停止。` : '已手动停止。' }
        : message
    )));
    activeStreamRef.current = null;
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
      updateActiveSessionMessages(() => [...nextMessages, { id: assistantId, role: 'assistant', content: '正在生成...' }]);

      const stream = window.assistant.ai.chatStream({
        messages: createAiMessages(nextMessages),
        maxTokens: 4096,
        timeoutMs: 120000,
      }, (chunk: string) => {
        updateActiveSessionMessages((prev) => prev.map((message) => (
          message.id === assistantId
            ? { ...message, content: message.content === '正在生成...' ? chunk : message.content + chunk }
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
        const finalContent = response.content || (message.content === '正在生成...' ? '' : message.content);
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
          ? { ...message, content: message.content === '正在生成...' ? `调用失败：${description}` : `${message.content}\n\n调用失败：${description}` }
          : message
      )));
      scrollToBottom();
    } finally {
      if (activeStreamRef.current?.assistantId === assistantId) activeStreamRef.current = null;
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
    <Box h="calc(100vh - 132px)" minH="520px" bg="gray.50" borderRadius="lg" overflow="hidden" border="1px solid" borderColor="gray.100">
      <Flex h="100%" minH={0}>
        <Flex w="220px" minW="220px" direction="column" borderRight="1px solid" borderColor="gray.100" bg="white" minH={0}>
          <Box px={3} py={3} borderBottom="1px solid" borderColor="gray.100">
            <Flex align="center" gap={2} mb={3}>
              <Flex w="28px" h="28px" borderRadius="full" bg="blue.500" color="white" align="center" justify="center" flexShrink={0}>
                <Bot size={16} />
              </Flex>
              <Box minW={0}>
                <Heading size="xs">AI Assistant</Heading>
                <Text fontSize="10px" color="gray.500">会话历史</Text>
              </Box>
            </Flex>
            <Button w="100%" size="sm" colorScheme="blue" leftIcon={<Plus size={14} />} onClick={createSession} isDisabled={isSending}>新对话</Button>
          </Box>

          <Box flex={1} minH={0} overflowY="auto" p={2}>
            {sessions.map((session) => (
              <Button
                key={session.id}
                w="100%"
                justifyContent="flex-start"
                size="sm"
                variant={session.id === activeSession?.id ? 'solid' : 'ghost'}
                colorScheme={session.id === activeSession?.id ? 'blue' : 'gray'}
                onClick={() => switchSession(session.id)}
                isDisabled={isSending}
                mb={1}
                px={2}
              >
                <Box minW={0} textAlign="left">
                  <Text fontSize="xs" noOfLines={1}>{session.title}</Text>
                  <Text fontSize="10px" opacity={0.7}>{session.messages.length} 条消息</Text>
                </Box>
              </Button>
            ))}
          </Box>

          <Box p={2} borderTop="1px solid" borderColor="gray.100">
            <Button w="100%" size="xs" variant="ghost" leftIcon={<Trash2 size={13} />} onClick={clearCurrentSession} isDisabled={isSending || messages.length === 0}>清空当前对话</Button>
          </Box>
        </Flex>

        <Flex direction="column" flex={1} minW={0} minH={0}>
          <Box px={4} py={3} borderBottom="1px solid" borderColor="gray.100" bg="white">
            <Flex align="center" gap={2} minW={0}>
              <Heading size="sm" noOfLines={1}>{activeSession?.title || '新对话'}</Heading>
              <Text fontSize="xs" color="gray.500" flexShrink={0}>支持流式输出、图片/音频/文件附件</Text>
            </Flex>
          </Box>

          <Box ref={viewportRef} flex={1} minH={0} overflowY="auto" overflowX="hidden" p={4} css={{ scrollbarGutter: 'stable' }}>
          {messages.length === 0 ? (
            <Flex direction="column" align="center" justify="center" minH="260px" color="gray.500" textAlign="center" gap={2}>
              <Flex w="48px" h="48px" borderRadius="full" bg="blue.50" color="blue.500" align="center" justify="center">
                <Bot size={24} />
              </Flex>
              <Heading size="sm" color="gray.700">开始一次新的 AI 对话</Heading>
              <Text fontSize="xs" maxW="320px">可以先用于通用问答、改写、总结和方案讨论。后续会逐步接入 assistant-ui、白板与知识库上下文。</Text>
            </Flex>
          ) : (
            messages.filter((message) => !message.hidden).map((message) => <MessageBubble key={message.id} message={message} onConfirmCliCall={confirmCliCall} onRejectCliCall={rejectCliCall} />)
          )}
        </Box>

        <Box p={3} borderTop="1px solid" borderColor="gray.100" bg="white">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,audio/*,.txt,.md,.json,.csv,.pdf"
            style={{ display: 'none' }}
            onChange={handleFilesSelected}
          />
          {attachments.length > 0 && (
            <Flex gap={2} wrap="wrap" mb={2}>
              {attachments.map((attachment) => {
                const Icon = attachmentIcon(attachment.kind);
                return (
                  <Flex key={attachment.id} align="center" gap={2} bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="md" px={2} py={1} maxW="190px">
                    <Icon size={14} />
                    <Box minW={0} flex={1}>
                      <Text fontSize="xs" noOfLines={1}>{attachment.name}</Text>
                      <Text fontSize="10px" color="gray.500">{formatFileSize(attachment.size)}</Text>
                    </Box>
                    <IconButton aria-label="移除附件" icon={<X size={12} />} size="xs" variant="ghost" onClick={() => removeAttachment(attachment.id)} />
                  </Flex>
                );
              })}
            </Flex>
          )}
          <Flex gap={2} align="flex-end">
            <IconButton aria-label="添加附件" icon={<Paperclip size={16} />} h="44px" onClick={() => fileInputRef.current?.click()} isDisabled={isSending} />
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="输入问题，Enter 发送，Shift + Enter 换行；支持粘贴或上传图片、音频和文件"
              minH="44px"
              maxH="140px"
              resize="none"
              bg="gray.50"
              fontSize="sm"
              isDisabled={isSending}
            />
            {isSending ? (
              <Button colorScheme="red" h="44px" px={4} leftIcon={<Square size={14} />} onClick={stopGeneration}>
                停止
              </Button>
            ) : (
              <Button colorScheme="blue" h="44px" px={4} leftIcon={<Send size={15} />} onClick={sendMessage} isDisabled={!input.trim() && attachments.length === 0}>
                发送
              </Button>
            )}
          </Flex>
        </Box>
        </Flex>
      </Flex>
    </Box>
  );
}

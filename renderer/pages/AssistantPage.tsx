import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Heading, IconButton, Text, Textarea, useToast } from '@chakra-ui/react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import '@uiw/react-markdown-preview/markdown.css';
import { Bot, FileAudio, FileText, Image as ImageIcon, Paperclip, Plus, Send, Square, Trash2, User, X } from 'lucide-react';
import type { AiChatResponse, AiMessage, AiMessageContentPart } from '../../src/shared/types';

interface ChatAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  kind: 'image' | 'audio' | 'file';
}

interface ChatMessage extends AiMessage {
  id: string;
  content: string;
  meta?: string;
  attachments?: ChatAttachment[];
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

function MessageBubble({ message }: { message: ChatMessage }) {
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
          <MarkdownPreview source={message.content} skipHtml wrapperElement={{ 'data-color-mode': 'light' }} />
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
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: String(reader.result || ''),
        kind: inferAttachmentKind(file.type || 'application/octet-stream'),
      });
      reader.onerror = () => reject(new Error('附件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const oversized = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
    if (oversized) {
      toast({ title: '附件过大', description: `${oversized.name} 超过 8MB`, status: 'warning', duration: 2500 });
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

  async function sendMessage() {
    const content = input.trim();
    if ((!content && attachments.length === 0) || isSending || !activeSession) return;

    const messageAttachments = attachments;
    const userMessage: ChatMessage = { id: makeId(), role: 'user', content, attachments: messageAttachments };
    const nextMessages = [...messages, userMessage];
    updateActiveSessionMessages(() => nextMessages);
    setInput('');
    setAttachments([]);
    setIsSending(true);
    scrollToBottom();

    const assistantId = makeId();
    try {
      updateActiveSessionMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '正在生成...' }]);

      const stream = window.assistant.ai.chatStream({
        messages: [
          {
            role: 'system',
            content: '你是 UUUtil 的桌面助手。请直接回答用户问题。若用户提供图片，请结合图片内容回答；若用户提供音频或文件，而当前模型不支持直接解析，请说明可处理的信息边界。',
          },
          ...nextMessages.map((message) => ({
            role: message.role,
            content: message.role === 'user' ? createModelContent(message.content, message.attachments || []) : message.content,
          })),
        ],
        maxTokens: 4096,
        timeoutMs: 120000,
      }, (chunk: string) => {
        updateActiveSessionMessages((prev) => prev.map((message) => (
          message.id === assistantId
            ? { ...message, content: message.content === '正在生成...' ? chunk : message.content + chunk }
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
        return {
          ...message,
          content: finalContent || '模型没有返回正文。',
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

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
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
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
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
              placeholder="输入问题，Enter 发送，Shift + Enter 换行；可添加图片、音频或文件"
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

import React, { useEffect, useRef, useState } from 'react';
import { Box, Flex, IconButton, Input, Text } from '@chakra-ui/react';
import { Plus, X } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TermSession {
  id: string;
  title: string;
  term: Terminal;
  fitAddon: FitAddon;
  ptyId: string | null;
  opened: boolean;
  dispose: () => void;
}

function makeId(): string {
  return `term-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 模块级会话存储：跨 TerminalPage 挂载/卸载存活，切换工具不会重置终端
const store: { sessions: TermSession[]; activeId: string } = { sessions: [], activeId: '' };

function createSession(title: string): TermSession {
  const term = new Terminal({
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4' },
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);

  const session: TermSession = {
    id: makeId(),
    title,
    term,
    fitAddon,
    ptyId: null,
    opened: false,
    dispose: () => term.dispose(),
  };

  const api = window.assistant?.terminal;
  if (!api) return session;

  let offData: (() => void) | null = null;
  let offExit: (() => void) | null = null;
  let disposed = false;

  (async () => {
    const id = await api.create({ cols: term.cols, rows: term.rows });
    if (disposed) {
      api.dispose(id);
      return;
    }
    session.ptyId = id;
    offData = api.onData(id, (data) => term.write(data));
    offExit = api.onExit(id, (code) => {
      term.write(`\r\n\x1b[33m[进程已退出，退出码 ${code}]\x1b[0m\r\n`);
    });
    term.onData((data) => api.write(id, data));
    term.onResize(({ cols, rows }) => api.resize(id, cols, rows));
    api.resize(id, term.cols, term.rows);
  })();

  session.dispose = () => {
    disposed = true;
    offData?.();
    offExit?.();
    if (session.ptyId) api.dispose(session.ptyId);
    term.dispose();
  };

  return session;
}

function ensureInitialSession() {
  if (store.sessions.length === 0) {
    const session = createSession('终端 1');
    store.sessions.push(session);
    store.activeId = session.id;
  }
}

export default function TerminalPage() {
  const [, setVersion] = useState(() => {
    ensureInitialSession();
    return 0;
  });
  const refresh = () => setVersion((n) => n + 1);
  const containersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const outerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const sessions = store.sessions;
  const activeId = store.activeId;

  // 挂载 / 重挂载：把每个会话的 xterm 元素 attach 到对应容器（首次 open，之后移动节点复用）
  useEffect(() => {
    for (const session of sessions) {
      const container = containersRef.current.get(session.id);
      if (!container) continue;
      if (!session.opened) {
        session.term.open(container);
        session.opened = true;
      } else if (session.term.element && session.term.element.parentElement !== container) {
        container.appendChild(session.term.element);
      }
    }
  });

  // 激活标签变化时适配尺寸并聚焦（隐藏期间容器尺寸为 0）
  useEffect(() => {
    const active = sessions.find((s) => s.id === activeId);
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      try {
        active.fitAddon.fit();
      } catch { /* ignore */ }
      active.term.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [activeId, sessions.length]);

  // 面板尺寸变化时适配当前终端
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const observer = new ResizeObserver(() => {
      const active = store.sessions.find((s) => s.id === store.activeId);
      if (!active) return;
      try {
        active.fitAddon.fit();
      } catch { /* ignore */ }
    });
    observer.observe(outer);
    return () => observer.disconnect();
  }, []);

  function addTab() {
    const session = createSession(`终端 ${store.sessions.length + 1}`);
    store.sessions.push(session);
    store.activeId = session.id;
    refresh();
  }

  function selectTab(id: string) {
    store.activeId = id;
    refresh();
  }

  function startRename(session: TermSession, event: React.MouseEvent) {
    event.stopPropagation();
    setDraft(session.title);
    setEditingId(session.id);
  }

  function commitRename() {
    if (!editingId) return;
    const session = store.sessions.find((s) => s.id === editingId);
    const name = draft.trim();
    if (session && name) session.title = name;
    setEditingId(null);
    refresh();
  }

  function cancelRename() {
    setEditingId(null);
  }

  function closeTab(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    const idx = store.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    store.sessions[idx].dispose();
    containersRef.current.delete(id);
    store.sessions.splice(idx, 1);
    if (store.sessions.length === 0) {
      const session = createSession('终端 1');
      store.sessions.push(session);
      store.activeId = session.id;
    } else if (store.activeId === id) {
      store.activeId = store.sessions[Math.min(idx, store.sessions.length - 1)].id;
    }
    refresh();
  }

  return (
    <Flex direction="column" h="100%" minH={0} bg="#1e1e1e" overflow="hidden">
      <Box ref={outerRef} flex={1} minH={0} minW={0} position="relative" overflow="hidden">
        {sessions.map((session) => (
          <Box
            key={session.id}
            ref={(el: HTMLDivElement | null) => {
              if (el) containersRef.current.set(session.id, el);
            }}
            position="absolute"
            inset={0}
            overflow="hidden"
            display={session.id === activeId ? 'block' : 'none'}
            p={2}
            sx={{
              boxSizing: 'border-box',
              '.xterm': { height: '100% !important', width: '100% !important' },
              '.xterm-viewport': { height: '100% !important' },
            }}
          />
        ))}
      </Box>
      <Flex
        align="center"
        bg="#252526"
        px={1}
        flexShrink={0}
        overflowX="auto"
        sx={{ '&::-webkit-scrollbar': { height: '0px' } }}
      >
        {sessions.map((session) => {
          const isActive = session.id === activeId;
          const isEditing = session.id === editingId;
          return (
            <Flex
              key={session.id}
              align="center"
              gap={1}
              pl={3}
              pr={1}
              py={1.5}
              maxW="160px"
              flexShrink={0}
              cursor="pointer"
              bg={isActive ? '#1e1e1e' : 'transparent'}
              color={isActive ? 'gray.100' : 'gray.400'}
              borderBottom="2px solid"
              borderColor={isActive ? 'blue.400' : 'transparent'}
              _hover={{ color: 'gray.100' }}
              onClick={() => selectTab(session.id)}
            >
              {isEditing ? (
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    else if (e.key === 'Escape') cancelRename();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  variant="unstyled"
                  fontSize="xs"
                  h="18px"
                  px={1}
                  flex={1}
                  bg="whiteAlpha.200"
                  borderRadius="sm"
                  color="gray.100"
                />
              ) : (
                <Text
                  fontSize="xs"
                  noOfLines={1}
                  flex={1}
                  onDoubleClick={(e) => startRename(session, e)}
                >
                  {session.title}
                </Text>
              )}
              <IconButton
                aria-label="关闭终端"
                icon={<X size={12} />}
                size="xs"
                variant="ghost"
                color="inherit"
                minW="18px"
                h="18px"
                _hover={{ bg: 'whiteAlpha.300' }}
                onClick={(e) => closeTab(session.id, e)}
              />
            </Flex>
          );
        })}
        <IconButton
          aria-label="新建终端"
          icon={<Plus size={14} />}
          size="xs"
          variant="ghost"
          color="gray.400"
          ml={1}
          flexShrink={0}
          _hover={{ bg: 'whiteAlpha.300', color: 'gray.100' }}
          onClick={addTab}
        />
      </Flex>
    </Flex>
  );
}

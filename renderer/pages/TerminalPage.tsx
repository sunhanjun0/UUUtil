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
  tmuxName: string | null;
  opened: boolean;
  dispose: () => void;
}

function makeId(): string {
  return `term-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 模块级会话存储：跨 TerminalPage 挂载/卸载存活，切换工具不会重置终端
const store: { sessions: TermSession[]; activeId: string } = { sessions: [], activeId: '' };
// 启动恢复只执行一次（store 模块级存活，重挂载不应重复恢复）
let restoreStarted = false;

/** 将当前标签集（含 tmux 名/标题/顺序）全量写入持久化，渲染进程为唯一真源。 */
function persistSessions() {
  const api = window.assistant?.terminal;
  if (!api?.save) return;
  const list = store.sessions
    .filter((s) => s.tmuxName)
    .map((s, index) => ({ tmuxName: s.tmuxName as string, title: s.title, sortOrder: index }));
  void api.save(list);
}

function createSession(title: string, restoreTmuxName?: string): TermSession {
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
    tmuxName: null,
    opened: false,
    dispose: () => term.dispose(),
  };

  const api = window.assistant?.terminal;
  if (!api) return session;

  let offData: (() => void) | null = null;
  let offExit: (() => void) | null = null;
  let disposed = false;

  (async () => {
    const result = await api.create({ cols: term.cols, rows: term.rows, restoreTmuxName });
    if (disposed) {
      api.dispose(result.id);
      return;
    }
    session.ptyId = result.id;
    session.tmuxName = result.tmuxName;
    // 恢复模式下若 tmux 不可用（tmuxName 为空），会话内容无法恢复，给出行内提示（不阻断使用）。
    if (restoreTmuxName && !result.tmuxName) {
      term.write('\r\n\x1b[33m[tmux 不可用，已降级为新终端，历史会话未恢复]\x1b[0m\r\n');
    }
    offData = api.onData(result.id, (data) => term.write(data));
    offExit = api.onExit(result.id, (code) => {
      term.write(`\r\n\x1b[33m[进程已退出，退出码 ${code}]\x1b[0m\r\n`);
    });
    term.onData((data) => api.write(result.id, data));
    term.onResize(({ cols, rows }) => api.resize(result.id, cols, rows));
    api.resize(result.id, term.cols, term.rows);
    // tmux 名到手后回写持久化（降级为普通 shell 时 tmuxName 为 null，不持久化）
    if (session.tmuxName) persistSessions();
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

/** 启动时恢复已持久化的标签；无历史则新建「终端 1」。仅执行一次。 */
function restoreOrInit(onDone: () => void) {
  if (restoreStarted || store.sessions.length > 0) return;
  restoreStarted = true;

  const api = window.assistant?.terminal;
  const initFresh = () => {
    const session = createSession('终端 1');
    store.sessions.push(session);
    store.activeId = session.id;
    onDone();
  };

  if (!api?.list) {
    initFresh();
    return;
  }

  (async () => {
    try {
      const persisted = await api.list();
      if (persisted.length > 0) {
        for (const item of persisted) {
          const session = createSession(item.title, item.tmuxName);
          store.sessions.push(session);
        }
        store.activeId = store.sessions[0].id;
        onDone();
        return;
      }
    } catch { /* 恢复失败则降级为新建 */ }
    initFresh();
  })();
}

export default function TerminalPage() {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((n) => n + 1);
  const containersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const outerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const sessions = store.sessions;
  const activeId = store.activeId;

  // 启动时恢复持久化标签（异步），仅首次；已有会话则跳过
  useEffect(() => {
    if (store.sessions.length === 0 && !restoreStarted) {
      restoreOrInit(refresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (session && name) {
      session.title = name;
      persistSessions();
    }
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
    persistSessions();
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
            sx={{
              boxSizing: 'border-box',
              // padding 放在 .xterm 元素上，FitAddon 会正确扣除它计算行/列数；
              // 若放在外层容器上，FitAddon 读不到，会多算一行导致底部光标被裁切。
              '.xterm': {
                height: '100%',
                width: '100%',
                padding: '6px 8px',
                boxSizing: 'border-box',
              },
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

/**
 * 渲染进程 —— 悬浮球 / 面板视图（通过 role prop 区分）
 * 面板内容通过路由模块异步加载
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Flex, Tabs, TabList, Tab, IconButton } from '@chakra-ui/react';
import { routes, RouteRenderer } from './router';

declare global {
  interface Window {
    assistant: {
      expandBall: () => void;
      collapseBall: () => void;
      showBallContextMenu: () => void;
      quitBall: () => void;
      moveWindow: (dx: number, dy: number) => void;
      panelReady: () => void;
      listPlugins: () => Promise<any[]>;
      greet: (name: string) => Promise<{ success: boolean }>;
      calculate: (expression: string) => Promise<string>;
      devUtils: (action: string, ...args: any[]) => Promise<any>;
      getNotes: (categoryId?: string, tagId?: string) => Promise<any[]>;
      searchNotes: (keyword: string) => Promise<any>;
      createNote: (title: string, content: string, categoryId: string, tagIds: string[]) => Promise<any>;
      updateNote: (noteId: string, title: string, content: string, categoryId: string, tagIds: string[]) => Promise<any>;
      deleteNote: (noteId: string) => Promise<any>;
      getCategories: () => Promise<any[]>;
      createCategory: (name: string, color?: string) => Promise<any>;
      deleteCategory: (categoryId: string) => Promise<any>;
      getTags: () => Promise<any[]>;
      createTag: (name: string) => Promise<any>;
      deleteTag: (tagId: string) => Promise<any>;
      getVersion: () => string;
      openDevTools: () => void;
    };
  }
}

interface Props {
  role: 'ball' | 'panel';
}

export default function App({ role }: Props) {
  const [path, setPath] = useState(routes[0].path);
  const [flipped, setFlipped] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // 每隔 1 分钟翻转显示时间
  useEffect(() => {
    if (role !== 'ball') return;
    function flip() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setTimeStr(`${hh}:${mm}`);
      setFlipped(true);
      // 3 秒后翻回来
      setTimeout(() => setFlipped(false), 3000);
    }
    // 首次延迟到下一个整分钟
    const msToNextMin = (60 - new Date().getSeconds()) * 1000;
    const firstTimer = setTimeout(() => {
      flip();
      setInterval(flip, 60000);
    }, msToNextMin);
    return () => clearTimeout(firstTimer);
  }, [role]);

  // 拖拽处理（球和面板共用）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    didDrag.current = false;
    lastPos.current = { x: e.screenX, y: e.screenY };
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const dx = e.screenX - lastPos.current.x;
      const dy = e.screenY - lastPos.current.y;
      if (dx !== 0 || dy !== 0) didDrag.current = true;
      lastPos.current = { x: e.screenX, y: e.screenY };
      try { window.assistant.moveWindow(dx, dy); } catch { /* browser */ }
    }
    function onMouseUp() { dragging.current = false; }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // 面板挂载后通知主进程播放动画
  useEffect(() => {
    if (role === 'panel') {
      try { window.assistant.panelReady(); } catch { /* browser */ }
    }
  }, [role]);

  function handleExpand() {
    if (didDrag.current) return;
    try {
      window.assistant.expandBall();
    } catch { /* browser */ }
  }

  function handleCollapse() {
    if (didDrag.current) return;
    try {
      window.assistant.collapseBall();
    } catch { /* browser */ }
  }

  function handleBallContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    try {
      window.assistant.showBallContextMenu();
    } catch { /* browser */ }
  }

  // ========== 悬浮球视图 ==========
  if (role === 'ball') {
    return (
      <div
        style={ballStyles.wrapper}
        onContextMenu={handleBallContextMenu}
      >
        <div
          style={ballStyles.glowRing}
          onMouseDown={handleMouseDown}
          onClick={handleExpand}
        >
          <div style={{
            ...ballStyles.flipContainer,
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}>
          {/* 正面：图标 */}
          <div style={ballStyles.ball}>
            <img src="./assets/ball-icon.png" style={ballStyles.icon} alt="展开面板" />
          </div>
          {/* 背面：时间 */}
          <div style={ballStyles.ballBack}>
            <span style={ballStyles.timeText}>{timeStr}</span>
          </div>
        </div>
        </div>
      </div>
    );
  }

  // ========== 面板视图 ==========
  return (
    <Flex
      direction="column"
      w="100vw"
      h="100vh"
      bg="transparent"
      overflow="hidden"
    >
      {/* 导航栏 */}
      <Flex
        as="nav"
        align="center"
        bg="transparent"
        backdropFilter="none"
        sx={{ WebkitAppRegion: 'drag' } as any}
        onMouseDown={handleMouseDown}
      >
        <Tabs
          index={routes.findIndex((r) => r.path === path)}
          onChange={(i) => setPath(routes[i].path)}
          variant="unstyled"
          size="sm"
          flex={1}
          sx={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <TabList pl={3} py={1} border="none" gap={1}>
            {routes.map((r) => (
              <Tab key={r.path} fontSize={13} fontWeight={500} borderRadius="md" px={4} py={1.5}
                border="none" outline="none" boxShadow="none"
                _selected={{ bg: 'blue.500', color: 'white', border: 'none', boxShadow: 'none', outline: 'none' }}
                _focus={{ boxShadow: 'none', outline: 'none', border: 'none' }}
                _focusVisible={{ boxShadow: 'none', outline: 'none', border: 'none' }}
                _active={{ border: 'none', boxShadow: 'none' }}
                _hover={{ bg: 'whiteAlpha.900', color: 'gray.900', border: 'none' }}
                bg="whiteAlpha.700" color="gray.800"
                transition="all 0.15s"
                sx={{ '&[data-selected]': { border: 'none', boxShadow: 'none' } }}
              >
                {r.icon} {r.label}
              </Tab>
            ))}
          </TabList>
        </Tabs>

        <Flex gap={1} pr={2} sx={{ WebkitAppRegion: 'no-drag' } as any}>
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="打开控制台"
            icon={<span style={{ fontSize: 12 }}>🐛</span>}
            onClick={() => { try { window.assistant.openDevTools(); } catch { /* browser */ } }}
          />
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="关闭面板"
            icon={<span style={{ fontSize: 14, lineHeight: 1 }}>×</span>}
            onClick={handleCollapse}
          />
        </Flex>
      </Flex>

      {/* 内容区 —— 路由异步渲染 */}
      <Flex flex={1} overflow="auto" px={3} py={2} minH={0}>
        <RouteRenderer path={path} />
      </Flex>
    </Flex>
  );
}

// ========== 悬浮球样式 ==========
const ballStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitAppRegion: 'drag' as any,
    userSelect: 'none',
    background: 'transparent',
    perspective: 800,
    position: 'relative',
  },
  glowRing: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    overflow: 'visible',
    cursor: 'pointer',
    WebkitAppRegion: 'no-drag' as any,
  },
  flipContainer: {
    width: 44,
    height: 44,
    position: 'relative',
    transformStyle: 'preserve-3d',
    transition: 'transform 3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  ball: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    backfaceVisibility: 'hidden',
    WebkitAppRegion: 'no-drag' as any,
    overflow: 'hidden',
    top: 0,
    left: 0,
  },
  ballBack: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    backfaceVisibility: 'hidden',
    transform: 'rotateY(180deg)',
    top: 0,
    left: 0,
  },
  icon: {
    width: 34,
    height: 34,
    pointerEvents: 'none',
    objectFit: 'contain',
  },
  timeText: {
    color: '#4a5568',
    fontSize: 10,
    fontWeight: 800,
    fontFamily: 'monospace',
    letterSpacing: '0.5px',
  },
};

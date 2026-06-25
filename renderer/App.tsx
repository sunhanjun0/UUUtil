/**
 * 渲染进程 —— 悬浮球 / 面板视图（通过 role prop 区分）
 * 面板内容通过路由模块异步加载
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, Tabs, TabList, Tab, IconButton } from '@chakra-ui/react';
import { Bug, Droplets, Maximize2, Minimize2, Settings, X } from 'lucide-react';
import { backgroundRoutes, foregroundRoutes, routes, RouteRenderer } from './router';
import type { RouteConfig } from './router';
import '../src/shared/assistant-api';

interface Props {
  role: 'ball' | 'panel';
}

export default function App({ role }: Props) {
  const [panelSide, setPanelSide] = useState<'front' | 'back'>('front');
  const [panelMaximized, setPanelMaximized] = useState(false);
  const [frostedPanel, setFrostedPanel] = useState(() => localStorage.getItem('uuutil:frosted-panel') === '1');
  const [frontPath, setFrontPath] = useState(foregroundRoutes[0].path);
  const [frontDisplayPath, setFrontDisplayPath] = useState(foregroundRoutes[0].path);
  const [frontPreviousPath, setFrontPreviousPath] = useState<string | null>(null);
  const [frontSlideDirection, setFrontSlideDirection] = useState<1 | -1>(1);
  const [backPath, setBackPath] = useState(backgroundRoutes[0]?.path || foregroundRoutes[0].path);
  const [backDisplayPath, setBackDisplayPath] = useState(backgroundRoutes[0]?.path || foregroundRoutes[0].path);
  const [backPreviousPath, setBackPreviousPath] = useState<string | null>(null);
  const [backSlideDirection, setBackSlideDirection] = useState<1 | -1>(1);
  const activeRoutes = panelSide === 'front' ? foregroundRoutes : backgroundRoutes;
  const activePath = panelSide === 'front' ? frontPath : backPath;
  const [flipped, setFlipped] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem('uuutil:frosted-panel', frostedPanel ? '1' : '0');
  }, [frostedPanel]);

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
    let intervalTimer: ReturnType<typeof setInterval> | null = null;
    const firstTimer = setTimeout(() => {
      flip();
      intervalTimer = setInterval(flip, 60000);
    }, msToNextMin);
    return () => {
      clearTimeout(firstTimer);
      if (intervalTimer) clearInterval(intervalTimer);
    };
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

  async function handleToggleMaximize() {
    try {
      const maximized = await window.assistant.togglePanelMaximize();
      setPanelMaximized(maximized);
    } catch { /* browser */ }
  }

  function navigateTo(nextPath: string) {
    if (nextPath === activePath) return;
    const currentIndex = activeRoutes.findIndex((route) => route.path === activePath);
    const nextIndex = activeRoutes.findIndex((route) => route.path === nextPath);
    const direction = nextIndex >= currentIndex ? 1 : -1;

    if (panelSide === 'front') {
      setFrontSlideDirection(direction);
      setFrontPreviousPath(frontDisplayPath);
      setFrontDisplayPath(nextPath);
      setFrontPath(nextPath);
    } else {
      setBackSlideDirection(direction);
      setBackPreviousPath(backDisplayPath);
      setBackDisplayPath(nextPath);
      setBackPath(nextPath);
    }
  }

  function flipPanelSide() {
    setPanelSide((side) => side === 'front' ? 'back' : 'front');
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
      bg={frostedPanel ? 'rgba(248, 250, 252, 0.68)' : 'transparent'}
      borderRadius="4px"
      overflow="hidden"
      position="relative"
      border={frostedPanel ? '1px solid rgba(255, 255, 255, 0.45)' : 'none'}
      boxShadow={frostedPanel ? '0 18px 60px rgba(15, 23, 42, 0.18), inset 0 1px 0 rgba(255,255,255,0.38)' : 'none'}
      backdropFilter={frostedPanel ? 'blur(22px) saturate(1.35)' : 'none'}
      p={2}
      sx={panelTransitionStyles}
    >
      {/* 导航栏 */}
      <Flex
        as="nav"
        align="center"
        bg="transparent"
        backdropFilter="none"
        gap={2}
        mb={1}
        sx={{ WebkitAppRegion: 'drag' } as any}
        onMouseDown={handleMouseDown}
      >
        <Box flex={1} sx={{ WebkitAppRegion: 'no-drag' } as any} className="panel-nav-flip-scene">
          <Box className="panel-nav-flip-card" transform={panelSide === 'back' ? 'rotateY(180deg)' : 'rotateY(0deg)'}>
            <Box className="panel-nav-flip-face panel-nav-flip-front">
              <RouteTabs routes={foregroundRoutes} activePath={frontPath} onNavigate={navigateTo} />
            </Box>
            <Box className="panel-nav-flip-face panel-nav-flip-back">
              <RouteTabs routes={backgroundRoutes} activePath={backPath} onNavigate={navigateTo} />
            </Box>
          </Box>
        </Box>

        <Flex
          gap={1}
          px={1}
          py={1}
          bg="whiteAlpha.700"
          borderRadius="sm"
          sx={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <IconButton
            size="xs"
            variant="ghost"
            color={panelSide === 'back' ? 'blue.600' : 'gray.800'}
            borderRadius="sm"
            _hover={{ bg: 'whiteAlpha.500', color: panelSide === 'back' ? 'blue.700' : 'gray.900' }}
            aria-label={panelSide === 'front' ? '切换到后台配置' : '切换到前台工具'}
            title={panelSide === 'front' ? '切换到后台配置' : '切换到前台工具'}
            icon={<Settings size={15} strokeWidth={1.8} />}
            onClick={flipPanelSide}
          />
          <IconButton
            size="xs"
            variant="ghost"
            color={frostedPanel ? 'blue.600' : 'gray.800'}
            borderRadius="sm"
            _hover={{ bg: 'whiteAlpha.500', color: frostedPanel ? 'blue.700' : 'gray.900' }}
            aria-label={frostedPanel ? '关闭磨砂背景' : '开启磨砂背景'}
            title={frostedPanel ? '关闭磨砂背景' : '开启磨砂背景'}
            icon={<Droplets size={15} strokeWidth={1.8} />}
            onClick={() => setFrostedPanel((enabled) => !enabled)}
          />
          <IconButton
            size="xs"
            variant="ghost"
            color="gray.800"
            borderRadius="sm"
            _hover={{ bg: 'whiteAlpha.500', color: 'gray.900' }}
            aria-label="打开控制台"
            icon={<Bug size={15} strokeWidth={1.8} />}
            onClick={() => { try { window.assistant.openDevTools(); } catch { /* browser */ } }}
          />
          <IconButton
            size="xs"
            variant="ghost"
            color="gray.800"
            borderRadius="sm"
            _hover={{ bg: 'whiteAlpha.500', color: 'gray.900' }}
            aria-label={panelMaximized ? '还原窗口' : '最大化窗口'}
            title={panelMaximized ? '还原窗口' : '最大化窗口'}
            icon={panelMaximized ? <Minimize2 size={15} strokeWidth={1.8} /> : <Maximize2 size={15} strokeWidth={1.8} />}
            onClick={handleToggleMaximize}
          />
          <IconButton
            size="xs"
            variant="ghost"
            color="gray.800"
            borderRadius="sm"
            _hover={{ bg: 'whiteAlpha.500', color: 'gray.900' }}
            aria-label="关闭面板"
            icon={<X size={15} strokeWidth={1.8} />}
            onClick={handleCollapse}
          />
        </Flex>
      </Flex>

      {/* 内容区 —— 前台 / 后台双面翻转 */}
      <Flex flex={1} overflow="hidden" minH={0} sx={panelTransitionStyles}>
        <Box className="panel-flip-scene">
          <Box className="panel-flip-card" transform={panelSide === 'back' ? 'rotateY(180deg)' : 'rotateY(0deg)'}>
            <Box className="panel-flip-face panel-flip-front">
              <RouteStack
                displayPath={frontDisplayPath}
                previousPath={frontPreviousPath}
                slideDirection={frontSlideDirection}
                onRouteAnimationEnd={() => setFrontPreviousPath(null)}
              />
            </Box>
            <Box className="panel-flip-face panel-flip-back">
              <RouteStack
                displayPath={backDisplayPath}
                previousPath={backPreviousPath}
                slideDirection={backSlideDirection}
                onRouteAnimationEnd={() => setBackPreviousPath(null)}
              />
            </Box>
          </Box>
        </Box>
      </Flex>

      <div style={panelStyles.bottomMarker} aria-hidden="true" />
    </Flex>
  );
}

function RouteTabs({
  routes,
  activePath,
  onNavigate,
}: {
  routes: RouteConfig[];
  activePath: string;
  onNavigate: (path: string) => void;
}) {
  const activeTabIndex = routes.findIndex((route) => route.path === activePath);

  return (
    <Tabs
      index={activeTabIndex >= 0 ? activeTabIndex : -1}
      onChange={(i) => {
        const route = routes[i];
        if (route) onNavigate(route.path);
      }}
      variant="unstyled"
      size="sm"
      h="100%"
    >
      <TabList border="none" gap={1} h="100%" alignItems="center">
        {routes.map((r) => {
          const Icon = r.icon;
          return (
            <Tab key={r.path} fontSize={13} fontWeight={500} borderRadius="sm" px={4} py={1.5}
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
              <Flex align="center" gap={1.5}>
                <Icon size={15} strokeWidth={1.8} />
                {r.label}
              </Flex>
            </Tab>
          );
        })}
      </TabList>
    </Tabs>
  );
}

function RouteStack({
  displayPath,
  previousPath,
  slideDirection,
  onRouteAnimationEnd,
}: {
  displayPath: string;
  previousPath: string | null;
  slideDirection: 1 | -1;
  onRouteAnimationEnd: () => void;
}) {
  return (
    <Box position="relative" w="100%" h="100%" minH={0}>
      {previousPath && (
        <Box
          position="absolute"
          inset={0}
          overflow="auto"
          className={slideDirection === 1 ? 'panel-route-out-left' : 'panel-route-out-right'}
        >
          <Box className="panel-route-content">
            <RouteRenderer path={previousPath} />
          </Box>
        </Box>
      )}
      <Box
        key={displayPath}
        position="absolute"
        inset={0}
        overflow="auto"
        className={previousPath ? (slideDirection === 1 ? 'panel-route-in-right' : 'panel-route-in-left') : undefined}
        onAnimationEnd={(event) => {
          if (event.currentTarget === event.target) onRouteAnimationEnd();
        }}
      >
        <Box className="panel-route-content">
          <RouteRenderer path={displayPath} />
        </Box>
      </Box>
    </Box>
  );
}

const panelTransitionStyles = {
  '.panel-nav-flip-scene': {
    height: '32px',
    perspective: '1200px',
    overflow: 'hidden',
  },
  '.panel-nav-flip-card': {
    position: 'relative',
    width: '100%',
    height: '100%',
    transformStyle: 'preserve-3d',
    transition: 'transform 720ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
  '.panel-nav-flip-face': {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  },
  '.panel-nav-flip-front': {
    transform: 'rotateY(0deg)',
  },
  '.panel-nav-flip-back': {
    transform: 'rotateY(180deg)',
  },
  '.panel-flip-scene': {
    width: '100%',
    height: '100%',
    minHeight: 0,
    perspective: '1600px',
    overflow: 'hidden',
  },
  '.panel-flip-card': {
    position: 'relative',
    width: '100%',
    height: '100%',
    transformStyle: 'preserve-3d',
    transition: 'transform 720ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
  '.panel-flip-face': {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    minHeight: 0,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    overflow: 'hidden',
  },
  '.panel-flip-front': {
    transform: 'rotateY(0deg)',
  },
  '.panel-flip-back': {
    transform: 'rotateY(180deg)',
  },
  '.panel-route-content': {
    height: '100%',
  },
  '.panel-route-content > div': {
    height: '100%',
  },
  '.panel-route-in-right': {
    animation: 'panelSlideInRight 560ms cubic-bezier(0.16, 1, 0.3, 1) both',
  },
  '.panel-route-in-left': {
    animation: 'panelSlideInLeft 560ms cubic-bezier(0.16, 1, 0.3, 1) both',
  },
  '.panel-route-out-left': {
    animation: 'panelSlideOutLeft 560ms cubic-bezier(0.45, 0, 0.55, 1) both',
  },
  '.panel-route-out-right': {
    animation: 'panelSlideOutRight 560ms cubic-bezier(0.45, 0, 0.55, 1) both',
  },
  '.panel-route-in-right .panel-route-content > div > div, .panel-route-in-right .panel-route-content > div > div > div': {
    animation: 'cardSlideInRight 460ms cubic-bezier(0.16, 1, 0.3, 1) both',
  },
  '.panel-route-in-left .panel-route-content > div > div, .panel-route-in-left .panel-route-content > div > div > div': {
    animation: 'cardSlideInLeft 460ms cubic-bezier(0.16, 1, 0.3, 1) both',
  },
  '.panel-route-out-left .panel-route-content > div > div, .panel-route-out-left .panel-route-content > div > div > div': {
    animation: 'cardSlideOutLeft 360ms cubic-bezier(0.45, 0, 0.55, 1) both',
  },
  '.panel-route-out-right .panel-route-content > div > div, .panel-route-out-right .panel-route-content > div > div > div': {
    animation: 'cardSlideOutRight 360ms cubic-bezier(0.45, 0, 0.55, 1) both',
  },
  '.panel-route-content > div > div:nth-of-type(1), .panel-route-content > div > div > div:nth-of-type(1)': {
    animationDelay: '70ms',
  },
  '.panel-route-content > div > div:nth-of-type(2), .panel-route-content > div > div > div:nth-of-type(2)': {
    animationDelay: '140ms',
  },
  '.panel-route-content > div > div:nth-of-type(3), .panel-route-content > div > div > div:nth-of-type(3)': {
    animationDelay: '210ms',
  },
  '.panel-route-content > div > div:nth-of-type(4), .panel-route-content > div > div > div:nth-of-type(4)': {
    animationDelay: '280ms',
  },
  '.panel-route-content > div > div:nth-of-type(n + 5), .panel-route-content > div > div > div:nth-of-type(n + 5)': {
    animationDelay: '350ms',
  },
  '@keyframes panelSlideInRight': {
    from: { opacity: 0, transform: 'translateX(100%) scale(0.94)' },
    to: { opacity: 1, transform: 'translateX(0) scale(1)' },
  },
  '@keyframes panelSlideInLeft': {
    from: { opacity: 0, transform: 'translateX(-100%) scale(0.94)' },
    to: { opacity: 1, transform: 'translateX(0) scale(1)' },
  },
  '@keyframes panelSlideOutLeft': {
    from: { opacity: 1, transform: 'translateX(0) scale(1)' },
    to: { opacity: 0, transform: 'translateX(-100%) scale(0.95)' },
  },
  '@keyframes panelSlideOutRight': {
    from: { opacity: 1, transform: 'translateX(0) scale(1)' },
    to: { opacity: 0, transform: 'translateX(100%) scale(0.95)' },
  },
  '@keyframes cardSlideInRight': {
    from: { opacity: 0, transform: 'translateX(72vw) scale(0.92)' },
    to: { opacity: 1, transform: 'translateX(0) scale(1)' },
  },
  '@keyframes cardSlideInLeft': {
    from: { opacity: 0, transform: 'translateX(-72vw) scale(0.92)' },
    to: { opacity: 1, transform: 'translateX(0) scale(1)' },
  },
  '@keyframes cardSlideOutLeft': {
    from: { opacity: 1, transform: 'translateX(0) scale(1)' },
    to: { opacity: 0, transform: 'translateX(-72vw) scale(0.94)' },
  },
  '@keyframes cardSlideOutRight': {
    from: { opacity: 1, transform: 'translateX(0) scale(1)' },
    to: { opacity: 0, transform: 'translateX(72vw) scale(0.94)' },
  },
};

const panelStyles: Record<string, React.CSSProperties> = {
  bottomMarker: {
    position: 'absolute',
    left: '50%',
    bottom: 6,
    width: 48,
    height: 3,
    borderRadius: 999,
    transform: 'translateX(-50%)',
    background: '#39ff14',
    boxShadow: '0 0 5px rgba(57, 255, 20, 0.65)',
    opacity: 0.65,
    pointerEvents: 'none',
  },
};

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

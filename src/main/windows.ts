/**
 * 窗口管理 —— 悬浮球 + 面板双窗口、系统托盘、右键菜单、滑入/滑出与最大化动画。
 *
 * 透明无边框窗口在 macOS 上不支持原生 setBounds(animate) 动画，
 * 因此所有缩放/位移都用 setTimeout 逐帧手动插值，圆角 shape 随帧更新。
 */

import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, nativeImage, Tray } from 'electron';
import fs from 'fs';
import path from 'path';
import { closeDatabase, info as logInfo, warn as logWarn } from '../core';
import {
  BALL_MENU_ITEM_RADIUS,
  BALL_MENU_RING_RADIUS,
  BALL_MENU_SIZE,
} from '../shared/ball-menu';
import type { BallMenuGeometry } from '../shared/ball-menu';

// ---------- 尺寸常量 ----------
const BALL_SIZE = 96;
const PANEL_RADIUS = 3;

// ---------- 窗口状态 ----------
let ballWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let savedBallPos: { x: number; y: number } | null = null;
// 悬浮球环形菜单状态。球窗口恒为 BALL_MENU_SIZE、不做 resize（避免透明窗口缩放的旧帧残影）。
// 命中测试不依赖 setShape / mousemove forward（均在透明窗口上不可靠，electron#30808）：
// 菜单关闭时整窗 setIgnoreMouseEvents(true) 点击穿透，主进程轮询屏幕光标，
// 接近球心 BALL_HOVER_ENTER px 内切回可交互，离开 BALL_HOVER_LEAVE px 恢复穿透；菜单打开时整窗可交互。
let ballMenuOpen = false;
let ballMouseIgnored = false;
let ballMenuBlurTimer: NodeJS.Timeout | null = null;
let ballCursorTimer: NodeJS.Timeout | null = null;
const BALL_HOVER_ENTER = 30;
const BALL_HOVER_LEAVE = 36;
const BALL_CURSOR_POLL_MS = 50;
// 球窗口左上角与「球的视觉位置」（旧 96 窗口左上角）的固定偏移
const BALL_WINDOW_OFFSET = (BALL_MENU_SIZE - BALL_SIZE) / 2;
let savedPanelPos: { x: number; y: number } | null = null;
let savedPanelSize: { width: number; height: number } | null = null;
let panelAnimating = false;
let panelVisible = false;
let panelMaximized = false;
let preMaximizeBounds: { x: number; y: number; width: number; height: number } | null = null;
let maximizeAnimTimer: NodeJS.Timeout | null = null;

type PanelBounds = { x: number; y: number; width: number; height: number };

// ---------- 加载页面（开发 / 生产） ----------
function loadWindow(win: BrowserWindow, hash: string): void {
  if (process.env.NODE_ENV === 'development') {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5273';
    win.loadURL(`${devServerUrl}/#${hash}`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { hash });
  }
}

function resolveBallIconPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.join(__dirname, '..', '..', 'renderer', 'assets', 'ball-icon.png');
  }

  const rendererAssetsDir = path.join(__dirname, '..', 'renderer', 'assets');
  const stablePath = path.join(rendererAssetsDir, 'ball-icon.png');
  if (fs.existsSync(stablePath)) return stablePath;

  try {
    const hashedIcon = fs.readdirSync(rendererAssetsDir).find((file) => /^ball-icon-.*\.png$/.test(file));
    if (hashedIcon) return path.join(rendererAssetsDir, hashedIcon);
  } catch {
    // ignore and return stable path fallback
  }

  return stablePath;
}

function getPanelSize(): { width: number; height: number } {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.round(workAreaSize.width * 0.7);
  const height = Math.round(workAreaSize.height * 0.6);
  return { width, height };
}

// ---------- 窗口形状 ----------
// 球窗口恒为 BALL_MENU_SIZE，球心永远位于窗口中心
const BALL_WINDOW_CENTER = BALL_MENU_SIZE / 2;

function makeRoundedRectShape(width: number, height: number, radius: number): Electron.Rectangle[] {
  const rects: Electron.Rectangle[] = [];
  for (let y = 0; y < height; y++) {
    let inset = 0;
    if (y < radius) {
      const dy = radius - y - 0.5;
      inset = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - dy * dy)));
    } else if (y >= height - radius) {
      const dy = y - (height - radius) + 0.5;
      inset = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - dy * dy)));
    }
    rects.push({ x: inset, y, width: Math.max(0, width - inset * 2), height: 1 });
  }
  return rects;
}

function updatePanelShape(): void {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const [width, height] = panelWindow.getSize();
  panelWindow.setShape(makeRoundedRectShape(width, height, PANEL_RADIUS));
}

// ---------- 悬浮球窗口 ----------
export function createBallWindow(): void {
  const { workAreaSize } = screen.getPrimaryDisplay();

  // savedBallPos 记录的是「球的视觉位置」（旧 96 窗口左上角），窗口需向前偏移固定量
  let x = (savedBallPos?.x ?? Math.round(workAreaSize.width / 2 - BALL_SIZE / 2)) - BALL_WINDOW_OFFSET;
  let y = (savedBallPos?.y ?? Math.round(workAreaSize.height / 2 - BALL_SIZE / 2)) - BALL_WINDOW_OFFSET;

  // 确保悬浮球始终在屏幕可见区域内
  if (x + BALL_MENU_SIZE > workAreaSize.width) x = workAreaSize.width - BALL_MENU_SIZE - 8;
  if (y + BALL_MENU_SIZE > workAreaSize.height) y = workAreaSize.height - BALL_MENU_SIZE - 8;
  if (x < 0) x = 8;
  if (y < 0) y = 8;

  ballWindow = new BrowserWindow({
    width: BALL_MENU_SIZE,
    height: BALL_MENU_SIZE,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ballWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 菜单关闭时整窗点击穿透，光标轮询负责在光标接近球体时切回可交互
  setBallMouseIgnored(true);
  startBallCursorWatch();
  // floating 级别高于普通 alwaysOnTop，确保始终不会被面板或其他应用窗口覆盖
  ballWindow.setAlwaysOnTop(true, 'screen-saver');
  loadWindow(ballWindow, 'ball');

  ballWindow.on('move', () => {
    if (!ballWindow) return;
    const [x, y] = ballWindow.getPosition();
    savedBallPos = { x: x + BALL_WINDOW_OFFSET, y: y + BALL_WINDOW_OFFSET };
  });

  // 失焦（点击窗口外任意处）收起环形菜单。
  // 先通知渲染层收拢隐藏，由它回调 setBallMenuOpen(false) 恢复穿透；500ms 无响应兜底。
  ballWindow.on('blur', () => {
    if (!ballMenuOpen) return;
    ballWindow?.webContents.send('ball:menu-closed');
    if (ballMenuBlurTimer) clearTimeout(ballMenuBlurTimer);
    ballMenuBlurTimer = setTimeout(() => {
      ballMenuBlurTimer = null;
      setBallMenuOpen(false);
    }, 500);
  });

  ballWindow.on('closed', () => {
    ballWindow = null;
    ballMenuOpen = false;
    ballMouseIgnored = false;
    stopBallCursorWatch();
    if (ballMenuBlurTimer) {
      clearTimeout(ballMenuBlurTimer);
      ballMenuBlurTimer = null;
    }
  });
}

/**
 * 切换球窗口点击穿透。菜单打开时强制可交互；关闭时由光标轮询驱动。
 */
function setBallMouseIgnored(ignore: boolean): void {
  if (!ballWindow || ballWindow.isDestroyed()) return;
  const effective = ballMenuOpen ? false : ignore;
  if (effective === ballMouseIgnored) return;
  ballMouseIgnored = effective;
  ballWindow.setIgnoreMouseEvents(effective);
}

// 主进程光标轮询：穿透状态下不依赖渲染层事件，直接读屏幕光标位置决定激活/穿透。
// 球拖拽时会跟随光标，距离始终小于 BALL_HOVER_LEAVE，不会拖到一半变穿透。
function startBallCursorWatch(): void {
  if (ballCursorTimer) return;
  ballCursorTimer = setInterval(() => {
    if (!ballWindow || ballWindow.isDestroyed() || ballMenuOpen) return;
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = ballWindow.getPosition();
    const dist = Math.hypot(cursor.x - (wx + BALL_WINDOW_CENTER), cursor.y - (wy + BALL_WINDOW_CENTER));
    if (dist <= BALL_HOVER_ENTER) setBallMouseIgnored(false);
    else if (dist >= BALL_HOVER_LEAVE) setBallMouseIgnored(true);
  }, BALL_CURSOR_POLL_MS);
}

function stopBallCursorWatch(): void {
  if (!ballCursorTimer) return;
  clearInterval(ballCursorTimer);
  ballCursorTimer = null;
}

export function isBallWindowAlive(): boolean {
  return ballWindow !== null;
}

// ---------- 悬浮球环形菜单 ----------
/**
 * 打开/关闭环形菜单。窗口尺寸恒定，只切换命中状态：
 * 打开时整窗可交互（点空白可收起菜单），关闭时恢复点击穿透（光标接近球体由渲染层动态激活）。
 * 返回固定菜单几何信息给渲染层摆放菜单项。幂等：重复打开/关闭直接返回当前状态。
 */
export function setBallMenuOpen(open: boolean): BallMenuGeometry | null {
  if (!ballWindow || ballWindow.isDestroyed()) return null;

  if (ballMenuBlurTimer) {
    clearTimeout(ballMenuBlurTimer);
    ballMenuBlurTimer = null;
  }

  if (open) {
    if (!ballMenuOpen) {
      ballMenuOpen = true;
      setBallMouseIgnored(false);
      logInfo('window', 'ball_menu_open');
    }
    return {
      size: BALL_MENU_SIZE,
      centerX: BALL_WINDOW_CENTER,
      centerY: BALL_WINDOW_CENTER,
      ringRadius: BALL_MENU_RING_RADIUS,
      itemRadius: BALL_MENU_ITEM_RADIUS,
    };
  }

  if (!ballMenuOpen) return null;
  ballMenuOpen = false;
  setBallMouseIgnored(true);
  logInfo('window', 'ball_menu_close');
  return null;
}

// ---------- 面板窗口 ----------
export function showPanelWindow(): void {
  if (panelWindow && !panelWindow.isDestroyed()) {
    if (panelVisible) {
      logInfo('window', 'show_panel_focus_existing');
      panelWindow.focus();
      return;
    }

    logInfo('window', 'show_panel_reuse');
    const { workAreaSize } = screen.getPrimaryDisplay();
    const defaultPanelSize = getPanelSize();
    const PW = savedPanelSize?.width ?? defaultPanelSize.width;
    const PH = savedPanelSize?.height ?? defaultPanelSize.height;
    let targetX = savedPanelPos?.x ?? panelWindow.getPosition()[0];
    let targetY = savedPanelPos?.y ?? panelWindow.getPosition()[1];
    // 确保复用位置也在屏幕内
    if (targetX + PW > workAreaSize.width) targetX = workAreaSize.width - PW - 16;
    if (targetY + PH > workAreaSize.height) targetY = workAreaSize.height - PH - 16;
    if (targetX < 0) targetX = 16;
    if (targetY < 0) targetY = 16;
    const startX = workAreaSize.width;
    panelWindow.setPosition(startX, targetY);
    panelWindow.setOpacity(0);
    updatePanelShape();
    panelWindow.show();
    panelWindow.focus();
    panelVisible = true;
    updateTrayMenu(true);
    slideWindow(panelWindow, startX, targetX, 0, 1, 300, 'ease-out', 0.2, 300, 'ease-out', () => {
      // 面板每次显示后确保悬浮球仍在最上层
      if (ballWindow && !ballWindow.isDestroyed()) {
        ballWindow.setAlwaysOnTop(true, 'screen-saver');
      }
    });
    return;
  }

  // 保存球位置（面板从球附近弹出）
  if (ballWindow) {
    const [bx, by] = ballWindow.getPosition();
    savedBallPos = { x: bx, y: by };
  }

  let targetX: number;
  let targetY: number;
  const { workAreaSize } = screen.getPrimaryDisplay();
  const defaultPanelSize = getPanelSize();
  const PW = savedPanelSize?.width ?? defaultPanelSize.width;
  const PH = savedPanelSize?.height ?? defaultPanelSize.height;

  if (savedPanelPos) {
    targetX = savedPanelPos.x;
    targetY = savedPanelPos.y;
    if (targetX + PW > workAreaSize.width) targetX = workAreaSize.width - PW - 16;
    if (targetY + PH > workAreaSize.height) targetY = workAreaSize.height - PH - 16;
    if (targetX < 0) targetX = 16;
    if (targetY < 0) targetY = 16;
  } else {
    // 默认居中
    targetX = Math.round((workAreaSize.width - PW) / 2);
    targetY = Math.round((workAreaSize.height - PH) / 2);
  }

  // 从屏幕右边缘外起始
  const startX = workAreaSize.width;

  logInfo('window', 'show_panel_create', { targetX, targetY, width: PW, height: PH });

  panelWindow = new BrowserWindow({
    width: PW,
    height: PH,
    x: startX,
    y: Math.round(targetY),
    frame: false,
    transparent: true,
    roundedCorners: false,
    alwaysOnTop: true,
    resizable: true,
    minWidth: 480,
    minHeight: 360,
    hasShadow: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    opacity: 0,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const panelWebContentsId = panelWindow.webContents.id;
  let enterAnimationPlayed = false;
  const playEnterAnimation = () => {
    if (enterAnimationPlayed || !panelWindow || panelWindow.isDestroyed() || panelWindow.webContents.id !== panelWebContentsId) return;
    enterAnimationPlayed = true;
    logInfo('window', 'panel_enter_animation');
    slideWindow(panelWindow, startX, targetX, 0, 1, 400, 'ease-out', 0.3, 400, 'ease-out', () => {
      savedPanelPos = { x: targetX, y: targetY };
      // 面板动画结束后确保悬浮球仍在最上层
      if (ballWindow && !ballWindow.isDestroyed()) {
        ballWindow.setAlwaysOnTop(true, 'screen-saver');
      }
    });
  };

  const handlePanelReady = (event: Electron.IpcMainEvent) => {
    if (event.sender.id !== panelWebContentsId) return;
    logInfo('window', 'panel_ready_received');
    ipcMain.off('panel:ready', handlePanelReady);
    playEnterAnimation();
  };

  ipcMain.on('panel:ready', handlePanelReady);
  panelWindow.webContents.once('did-finish-load', () => {
    logInfo('window', 'panel_did_finish_load');
    setTimeout(playEnterAnimation, 50);
  });
  panelWindow.once('closed', () => ipcMain.off('panel:ready', handlePanelReady));

  panelWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logWarn('window', 'panel_did_fail_load', { errorCode, errorDescription, validatedURL });
  });

  const loadUrl = process.env.NODE_ENV === 'development'
    ? (process.env.VITE_DEV_SERVER_URL || 'http://localhost:5273')
    : 'file';
  logInfo('window', 'panel_load', { loadUrl });
  loadWindow(panelWindow, 'panel');

  panelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  updatePanelShape();

  panelWindow.on('move', () => {
    if (!panelWindow || panelWindow.isDestroyed() || panelAnimating) return;
    const [x, y] = panelWindow.getPosition();
    savedPanelPos = { x, y };
  });

  panelWindow.on('resize', () => {
    if (!panelWindow || panelWindow.isDestroyed()) return;
    const [width, height] = panelWindow.getSize();
    savedPanelSize = { width, height };
    updatePanelShape();
  });

  panelWindow.on('closed', () => {
    panelWindow = null;
    panelVisible = false;
    panelMaximized = false;
    preMaximizeBounds = null;
  });

  panelVisible = true;
  updateTrayMenu(true);
}

export function hidePanelWindow(): void {
  if (!panelWindow || panelWindow.isDestroyed() || !panelVisible) return;
  const [x, y] = panelWindow.getPosition();
  savedPanelPos = { x, y };

  // 滑出到屏幕右边缘 + 淡出
  const endX = screen.getPrimaryDisplay().workAreaSize.width;
  slideWindow(panelWindow, x, endX, panelWindow.getOpacity(), 0, 300, 'ease-in', 0, 200, 'ease-in', () => {
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.hide();
      panelWindow.setOpacity(1);
    }
    panelVisible = false;
    updateTrayMenu(false);
  });
}

export function togglePanelWindow(): void {
  const alive = Boolean(panelWindow && !panelWindow.isDestroyed());
  logInfo('window', 'toggle_panel', { panelVisible, panelWindowAlive: alive });
  if (panelVisible && panelWindow && !panelWindow.isDestroyed()) {
    hidePanelWindow();
  } else {
    showPanelWindow();
  }
}

export function registerGlobalShortcuts(): void {
  const shortcuts = ['Control+Shift+U', 'Alt+Space'];
  shortcuts.forEach((shortcut) => {
    const registered = globalShortcut.register(shortcut, togglePanelWindow);
    if (!registered) console.warn(`[Main] 全局快捷键注册失败: ${shortcut}`);
  });
}

// 窗口滑动 + 透明度动画（位移和渐隐可独立控制）
function slideWindow(
  win: BrowserWindow,
  fromX: number,
  toX: number,
  fromOpacity: number,
  toOpacity: number,
  duration: number,
  posEasing: 'ease-out' | 'ease-in',
  fadeDelay: number,
  fadeDuration: number,
  fadeEasing: 'ease-out' | 'ease-in',
  onDone?: () => void,
): void {
  const y = win.getPosition()[1];
  panelAnimating = true;
  const start = Date.now();
  const step = () => {
    if (win.isDestroyed()) return;
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    // 位移
    const tPos = posEasing === 'ease-in'
      ? progress * progress * progress
      : 1 - Math.pow(1 - progress, 3);
    // 渐隐
    const fadeStart = fadeDelay;
    const fadeEnd = fadeDelay + fadeDuration / duration;
    let tFade: number;
    if (progress < fadeStart) {
      tFade = 0;
    } else if (progress >= fadeEnd) {
      tFade = 1;
    } else {
      const fp = (progress - fadeStart) / (fadeEnd - fadeStart);
      tFade = fadeEasing === 'ease-in' ? fp * fp * fp : 1 - Math.pow(1 - fp, 3);
    }
    const x = Math.round(fromX + (toX - fromX) * tPos);
    win.setPosition(x, y);
    win.setOpacity(fromOpacity + (toOpacity - fromOpacity) * tFade);
    if (progress < 1) {
      setTimeout(step, 16);
    } else {
      panelAnimating = false;
      onDone?.();
    }
  };
  step();
}

// ---------- 系统托盘 ----------
export function createTray(): void {
  const iconPath = resolveBallIconPath();
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('个人辅助');
  tray.on('click', togglePanelWindow);

  updateTrayMenu(false);
}

function updateTrayMenu(panelVisibleState: boolean): void {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: `${panelVisibleState ? '关闭面板' : '展开面板'}  Ctrl+Shift+U`, click: togglePanelWindow },
    { type: 'separator' },
    { label: '退出', click: () => { closeDatabase(); app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

// ---------- 右键菜单（悬浮球上） ----------
export function showBallContextMenu(): void {
  if (!ballWindow) return;
  const panelOpen = panelVisible && panelWindow && !panelWindow.isDestroyed();
  const menu = Menu.buildFromTemplate([
    { label: `${panelOpen ? '关闭面板' : '展开面板'}  Ctrl+Shift+U`, click: togglePanelWindow },
    { label: '开发者工具', click: () => ballWindow?.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: '退出', click: () => { closeDatabase(); app.quit(); } },
  ]);
  menu.popup({ window: ballWindow });
}

// ---------- 面板最大化 ----------
function clearMaximizeAnimation(): void {
  if (!maximizeAnimTimer) return;
  clearTimeout(maximizeAnimTimer);
  maximizeAnimTimer = null;
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function animatePanelBoundsTimeline(
  win: BrowserWindow,
  from: PanelBounds,
  to: PanelBounds,
  timing: {
    moveDelay: number;
    moveDuration: number;
    widthDelay: number;
    widthDuration: number;
    heightDelay: number;
    heightDuration: number;
  },
): void {
  clearMaximizeAnimation();
  const totalDuration = Math.max(
    timing.moveDelay + timing.moveDuration,
    timing.widthDelay + timing.widthDuration,
    timing.heightDelay + timing.heightDuration,
  );
  const start = Date.now();
  const valueAt = (elapsed: number, delay: number, duration: number, startValue: number, endValue: number) => {
    if (elapsed <= delay) return startValue;
    const progress = Math.min((elapsed - delay) / duration, 1);
    return Math.round(startValue + (endValue - startValue) * easeOutCubic(progress));
  };
  const step = () => {
    if (win.isDestroyed()) {
      maximizeAnimTimer = null;
      return;
    }
    const elapsed = Date.now() - start;
    win.setBounds({
      x: valueAt(elapsed, timing.moveDelay, timing.moveDuration, from.x, to.x),
      y: valueAt(elapsed, timing.moveDelay, timing.moveDuration, from.y, to.y),
      width: valueAt(elapsed, timing.widthDelay, timing.widthDuration, from.width, to.width),
      height: valueAt(elapsed, timing.heightDelay, timing.heightDuration, from.height, to.height),
    });
    if (elapsed < totalDuration) {
      maximizeAnimTimer = setTimeout(step, 16);
    } else {
      win.setBounds(to);
      updatePanelShape();
      maximizeAnimTimer = null;
    }
  };
  step();
}

export function togglePanelMaximize(): boolean {
  if (!panelWindow || panelWindow.isDestroyed()) return false;
  const { workArea } = screen.getPrimaryDisplay();
  const [x, y] = panelWindow.getPosition();
  const [width, height] = panelWindow.getSize();
  const from: PanelBounds = { x, y, width, height };
  if (panelMaximized) {
    if (preMaximizeBounds) {
      animatePanelBoundsTimeline(panelWindow, from, preMaximizeBounds, {
        moveDelay: 0,
        moveDuration: 220,
        widthDelay: 0,
        widthDuration: 220,
        heightDelay: 0,
        heightDuration: 220,
      });
    }
    panelMaximized = false;
  } else {
    preMaximizeBounds = from;
    const maxWidth = Math.round(workArea.width * 0.96);
    const maxHeight = Math.round(workArea.height * 0.96);
    const maxX = workArea.x + Math.round((workArea.width - maxWidth) / 2);
    const maxY = workArea.y + Math.round((workArea.height - maxHeight) / 2);
    animatePanelBoundsTimeline(panelWindow, from, { x: maxX, y: maxY, width: maxWidth, height: maxHeight }, {
      moveDelay: 0,
      moveDuration: 220,
      widthDelay: 0,
      widthDuration: 220,
      heightDelay: 0,
      heightDuration: 220,
    });
    panelMaximized = true;
  }
  return panelMaximized;
}

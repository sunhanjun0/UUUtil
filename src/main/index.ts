/**
 * Electron 主进程入口 —— 悬浮球 + 面板双窗口模式
 */

import { app, BrowserWindow, ipcMain, Menu, screen, nativeImage, Tray } from 'electron';
import path from 'path';
import { initDatabase, closeDatabase, bus } from '../core';
import { loadAllPlugins, listPlugins } from '../core/plugin-loader';

// ---------- 尺寸常量 ----------
const BALL_SIZE = 96;
const BALL_CIRCLE_RADIUS = 22; // 视觉球半径 (44/2)，setShape 只裁切球体区域，光晕超出部分可见

function getPanelSize(): { width: number; height: number } {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const width = Math.round(workAreaSize.width * 0.4);
  const height = Math.round(workAreaSize.height * 0.6);
  return { width, height };
}

// 预计算圆形窗口 shape（一组水平矩形条近似圆形）
function makeCircleShape(): Electron.Rectangle[] {
  const rects: Electron.Rectangle[] = [];
  for (let y = 0; y < BALL_SIZE; y++) {
    const dy = y - BALL_SIZE / 2 + 0.5;
    const halfWidth = Math.sqrt(Math.max(0, BALL_CIRCLE_RADIUS * BALL_CIRCLE_RADIUS - dy * dy));
    const x = Math.floor(BALL_SIZE / 2 - halfWidth);
    const w = Math.floor(halfWidth * 2);
    if (w > 0) rects.push({ x, y, width: w, height: 1 });
  }
  return rects;
}
const CIRCLE_SHAPE = makeCircleShape();

let ballWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let savedBallPos: { x: number; y: number } | null = null;
let savedPanelPos: { x: number; y: number } | null = null;
let panelAnimating = false;

// ---------- 加载页面（开发 / 生产） ----------
function loadWindow(win: BrowserWindow, hash: string): void {
  if (process.env.NODE_ENV === 'development') {
    win.loadURL(`http://localhost:5173/#${hash}`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { hash });
  }
}

// ---------- 创建悬浮球窗口 ----------
function createBallWindow(): void {
  const { workAreaSize } = screen.getPrimaryDisplay();

  const x = savedBallPos?.x ?? workAreaSize.width - BALL_SIZE - 8;
  const y = savedBallPos?.y ?? Math.round(workAreaSize.height / 2 - BALL_SIZE / 2);

  ballWindow = new BrowserWindow({
    width: BALL_SIZE,
    height: BALL_SIZE,
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
  ballWindow.setShape(CIRCLE_SHAPE);
  loadWindow(ballWindow, 'ball');

  ballWindow.on('move', () => {
    if (!ballWindow) return;
    const [x, y] = ballWindow.getPosition();
    savedBallPos = { x, y };
  });

  ballWindow.on('closed', () => {
    ballWindow = null;
  });
}

// ---------- 创建 / 显示面板窗口 ----------
function showPanelWindow(): void {
  // 如果已存在则聚焦
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.show();
    panelWindow.focus();
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
  const { width: PW, height: PH } = getPanelSize();

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

  panelWindow = new BrowserWindow({
    width: PW,
    height: PH,
    x: startX,
    y: Math.round(targetY),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    opacity: 0,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadWindow(panelWindow, 'panel');

  panelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  panelWindow.on('move', () => {
    if (!panelWindow || panelWindow.isDestroyed() || panelAnimating) return;
    const [x, y] = panelWindow.getPosition();
    savedPanelPos = { x, y };
  });

  panelWindow.on('closed', () => {
    panelWindow = null;
  });

  // 等渲染进程准备好后再播放滑入动画（渐隐滞后位移）
  ipcMain.once('panel:ready', () => {
    slideWindow(panelWindow!, startX, targetX, 0, 1, 400, 'ease-out', 0.3, 400, 'ease-out', () => {
      savedPanelPos = { x: targetX, y: targetY };
    });
  });

  updateTrayMenu(true);
}

function hidePanelWindow(): void {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const [x, y] = panelWindow.getPosition();
  savedPanelPos = { x, y };

  // 滑出到屏幕右边缘 + 淡出
  const endX = screen.getPrimaryDisplay().workAreaSize.width;
  slideWindow(panelWindow, x, endX, panelWindow.getOpacity(), 0, 300, 'ease-in', 0, 200, 'ease-in', () => {
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.close();
    }
    panelWindow = null;
    updateTrayMenu(false);
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
function createTray(): void {
  const iconPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '..', '..', 'renderer', 'assets', 'ball-icon.png')
    : path.join(__dirname, '..', 'renderer', 'assets', 'ball-icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('个人辅助');
  tray.on('click', () => {
    if (panelWindow && !panelWindow.isDestroyed()) {
      hidePanelWindow();
    } else {
      showPanelWindow();
    }
  });

  updateTrayMenu(false);
}

function updateTrayMenu(panelVisible: boolean): void {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: panelVisible ? '关闭面板' : '展开面板', click: () => (panelVisible ? hidePanelWindow() : showPanelWindow()) },
    { type: 'separator' },
    { label: '退出', click: () => { closeDatabase(); app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

// ---------- 右键菜单（悬浮球上） ----------
function showBallContextMenu(): void {
  if (!ballWindow) return;
  const panelOpen = panelWindow && !panelWindow.isDestroyed();
  const menu = Menu.buildFromTemplate([
    { label: panelOpen ? '关闭面板' : '展开面板', click: () => (panelOpen ? hidePanelWindow() : showPanelWindow()) },
    { label: '开发者工具', click: () => ballWindow?.webContents.openDevTools({ mode: 'detach' }) },
    { type: 'separator' },
    { label: '退出', click: () => { closeDatabase(); app.quit(); } },
  ]);
  menu.popup({ window: ballWindow });
}

// ---------- IPC 处理 ----------
ipcMain.on('ball:expand', () => {
  if (panelWindow && !panelWindow.isDestroyed()) {
    hidePanelWindow();
  } else {
    showPanelWindow();
  }
});
ipcMain.on('ball:collapse', () => hidePanelWindow());
ipcMain.on('panel:open-devtools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.webContents.openDevTools({ mode: 'detach' });
});
ipcMain.on('ball:context-menu', () => showBallContextMenu());
ipcMain.on('ball:quit', () => { closeDatabase(); app.quit(); });

// 通用窗口移动（根据 event.sender 判断是哪个窗口）
ipcMain.on('window:move', (event, dx: number, dy: number) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
});

// ---------- 插件 IPC ----------
ipcMain.handle('core:list-plugins', () => listPlugins());

ipcMain.handle('plugin:hello-world:greet', (_event, name: string) => {
  bus.emit('hello-world:greet', name);
  return { success: true };
});

ipcMain.handle('plugin:calculator:calculate', (_event, expression: string) => {
  return new Promise((resolve) => {
    bus.on('calculator:result', function handler(data: { expression: string; result: string }) {
      bus.off('calculator:result', handler);
      resolve(data.result);
    });
    bus.emit('calculator:calculate', expression);
  });
});

ipcMain.handle('plugin:dev-utils:invoke', (_event, action: string, ...args: any[]) => {
  return new Promise((resolve) => {
    bus.on('dev-utils:result', function handler(data: { action: string; result: any }) {
      if (data.action === action) {
        bus.off('dev-utils:result', handler);
        resolve(data.result);
      }
    });
    bus.emit('dev-utils:invoke', action, ...args);
  });
});

// 知识库 IPC
ipcMain.handle('plugin:knowledge-base:getNotes', (_event, categoryId?: string, tagId?: string) => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'getNotes') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:getNotes', categoryId, tagId);
  });
});

ipcMain.handle('plugin:knowledge-base:searchNotes', (_event, keyword: string) => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'searchNotes') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:searchNotes', keyword);
  });
});

ipcMain.handle('plugin:knowledge-base:createNote', (_event, title: string, content: string, categoryId: string, tagIds: string[]) => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'createNote') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:createNote', title, content, categoryId, tagIds);
  });
});

ipcMain.handle('plugin:knowledge-base:updateNote', (_event, noteId: string, title: string, content: string, categoryId: string, tagIds: string[]) => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'updateNote') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:updateNote', noteId, title, content, categoryId, tagIds);
  });
});

ipcMain.handle('plugin:knowledge-base:deleteNote', (_event, noteId: string) => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'deleteNote') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:deleteNote', noteId);
  });
});

ipcMain.handle('plugin:knowledge-base:getCategories', () => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'getCategories') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:getCategories');
  });
});

ipcMain.handle('plugin:knowledge-base:createCategory', (_event, name: string, color?: string) => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'createCategory') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:createCategory', name, color);
  });
});

ipcMain.handle('plugin:knowledge-base:deleteCategory', (_event, categoryId: string) => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'deleteCategory') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:deleteCategory', categoryId);
  });
});

ipcMain.handle('plugin:knowledge-base:getTags', () => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'getTags') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:getTags');
  });
});

ipcMain.handle('plugin:knowledge-base:createTag', (_event, name: string) => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'createTag') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:createTag', name);
  });
});

ipcMain.handle('plugin:knowledge-base:deleteTag', (_event, tagId: string) => {
  return new Promise((resolve) => {
    bus.on('knowledge-base:result', function handler(data: { action: string; result: any }) {
      if (data.action === 'deleteTag') { bus.off('knowledge-base:result', handler); resolve(data.result); }
    });
    bus.emit('knowledge-base:deleteTag', tagId);
  });
});

// ---------- 启动 ----------
async function bootstrap(): Promise<void> {
  await initDatabase();
  console.log('[Main] 数据库已初始化');

  await loadAllPlugins();

  bus.emit('core:ready');
  console.log('[Main] 核心已就绪');

  createBallWindow();
  createTray();
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // 有托盘时不退出
});

app.on('activate', () => {
  if (ballWindow === null) {
    createBallWindow();
  } else {
    showPanelWindow();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});

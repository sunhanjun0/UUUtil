/**
 * Electron 主进程入口 —— 悬浮球 + 面板双窗口模式
 */

import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, nativeImage, Tray } from 'electron';
import path from 'path';
import {
  initDatabase,
  closeDatabase,
  getDatabase,
  autoSave,
  bus,
  initAi,
  listAiProviders,
  upsertAiProvider,
  deleteAiProvider,
  getAiRuntimeConfig,
  updateAiRuntimeConfig,
  chat,
} from '../core';
import { loadAllPlugins, listPlugins } from '../core/plugin-loader';
import type { AiChatRequest, AiProviderConfig, AiRuntimeConfig } from '../shared/types';

// ---------- 尺寸常量 ----------
const BALL_SIZE = 96;
const BALL_CIRCLE_RADIUS = 22; // 视觉球半径 (44/2)，setShape 只裁切球体区域，光晕超出部分可见
const PANEL_RADIUS = 3;
const PLUGIN_RESPONSE_TIMEOUT = 5000;

interface PluginResultMessage<T = any> {
  action: string;
  result: T;
}

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

let ballWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let savedBallPos: { x: number; y: number } | null = null;
let savedPanelPos: { x: number; y: number } | null = null;
let savedPanelSize: { width: number; height: number } | null = null;
let panelAnimating = false;
let panelVisible = false;

// ---------- 加载页面（开发 / 生产） ----------
function loadWindow(win: BrowserWindow, hash: string): void {
  if (process.env.NODE_ENV === 'development') {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    win.loadURL(`${devServerUrl}/#${hash}`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), { hash });
  }
}

function waitForPluginEvent<T>(
  event: string,
  emitEvent: string,
  args: any[],
  match?: (data: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      bus.off(event, handler);
      reject(new Error(`插件事件超时: ${event}`));
    }, PLUGIN_RESPONSE_TIMEOUT);

    const handler = (data: T) => {
      if (match && !match(data)) return;
      clearTimeout(timeout);
      bus.off(event, handler);
      resolve(data);
    };

    bus.on(event, handler);
    bus.emit(emitEvent, ...args);
  });
}

async function invokeActionPlugin<T>(responseEvent: string, action: string, emitEvent: string, args: any[]): Promise<T> {
  const data = await waitForPluginEvent<PluginResultMessage<T>>(
    responseEvent,
    emitEvent,
    args,
    (message) => message.action === action,
  );
  return data.result;
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
  if (panelWindow && !panelWindow.isDestroyed()) {
    if (panelVisible) {
      panelWindow.focus();
      return;
    }

    const { workAreaSize } = screen.getPrimaryDisplay();
    const currentPanelPos = panelWindow.getPosition();
    const targetX = savedPanelPos?.x ?? currentPanelPos[0];
    const targetY = savedPanelPos?.y ?? currentPanelPos[1];
    const startX = workAreaSize.width;
    panelWindow.setPosition(startX, targetY);
    panelWindow.setOpacity(0);
    updatePanelShape();
    panelWindow.show();
    panelWindow.focus();
    panelVisible = true;
    updateTrayMenu(true);
    slideWindow(panelWindow, startX, targetX, 0, 1, 300, 'ease-out', 0.2, 300, 'ease-out');
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
  });

  const panelWebContentsId = panelWindow.webContents.id;
  const playEnterAnimation = () => {
    if (!panelWindow || panelWindow.isDestroyed() || panelWindow.webContents.id !== panelWebContentsId) return;
    slideWindow(panelWindow, startX, targetX, 0, 1, 400, 'ease-out', 0.3, 400, 'ease-out', () => {
      savedPanelPos = { x: targetX, y: targetY };
    });
  };

  const handlePanelReady = (event: Electron.IpcMainEvent) => {
    if (event.sender.id !== panelWebContentsId) return;
    ipcMain.off('panel:ready', handlePanelReady);
    playEnterAnimation();
  };

  ipcMain.on('panel:ready', handlePanelReady);
  panelWindow.once('closed', () => ipcMain.off('panel:ready', handlePanelReady));

  panelVisible = true;
  updateTrayMenu(true);
}

function hidePanelWindow(): void {
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

function togglePanelWindow(): void {
  if (panelVisible && panelWindow && !panelWindow.isDestroyed()) {
    hidePanelWindow();
  } else {
    showPanelWindow();
  }
}

function registerGlobalShortcuts(): void {
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
function createTray(): void {
  const iconPath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, '..', '..', 'renderer', 'assets', 'ball-icon.png')
    : path.join(__dirname, '..', 'renderer', 'assets', 'ball-icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('个人辅助');
  tray.on('click', togglePanelWindow);

  updateTrayMenu(false);
}

function updateTrayMenu(panelVisible: boolean): void {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: `${panelVisible ? '关闭面板' : '展开面板'}  Ctrl+Shift+U`, click: togglePanelWindow },
    { type: 'separator' },
    { label: '退出', click: () => { closeDatabase(); app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

// ---------- 右键菜单（悬浮球上） ----------
function showBallContextMenu(): void {
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

// ---------- IPC 处理 ----------
ipcMain.on('ball:expand', togglePanelWindow);
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

ipcMain.handle('core:whiteboard:get-state', () => {
  const db = getDatabase();
  const statement = db.prepare(`SELECT value FROM whiteboard_state WHERE key = ?`);
  try {
    statement.bind(['default']);
    if (statement.step()) return statement.get()[0] as string;
    return null;
  } finally {
    statement.free();
  }
});

ipcMain.handle('core:whiteboard:save-state', (_event, state: string) => {
  const db = getDatabase();
  db.run(
    `INSERT INTO whiteboard_state (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ['default', state],
  );
  autoSave();
  return { success: true };
});

ipcMain.handle('plugin:hello-world:greet', (_event, name: string) => {
  bus.emit('hello-world:greet', name);
  return { success: true };
});

ipcMain.handle('plugin:calculator:calculate', async (_event, expression: string) => {
  const data = await waitForPluginEvent<{ expression: string; result: string }>(
    'calculator:result',
    'calculator:calculate',
    [expression],
    (message) => message.expression === expression,
  );
  return data.result;
});

ipcMain.handle('plugin:dev-utils:invoke', (_event, action: string, ...args: any[]) => {
  return invokeActionPlugin('dev-utils:result', action, 'dev-utils:invoke', [action, ...args]);
});

// 知识库 IPC
ipcMain.handle('plugin:knowledge-base:getNotes', (_event, categoryId?: string, tagId?: string) => {
  return invokeActionPlugin('knowledge-base:result', 'getNotes', 'knowledge-base:getNotes', [categoryId, tagId]);
});

ipcMain.handle('plugin:knowledge-base:searchNotes', (_event, keyword: string) => {
  return invokeActionPlugin('knowledge-base:result', 'searchNotes', 'knowledge-base:searchNotes', [keyword]);
});

ipcMain.handle('plugin:knowledge-base:createNote', (_event, title: string, content: string, categoryId: string, tagIds: string[]) => {
  return invokeActionPlugin('knowledge-base:result', 'createNote', 'knowledge-base:createNote', [title, content, categoryId, tagIds]);
});

ipcMain.handle('plugin:knowledge-base:updateNote', (_event, noteId: string, title: string, content: string, categoryId: string, tagIds: string[]) => {
  return invokeActionPlugin('knowledge-base:result', 'updateNote', 'knowledge-base:updateNote', [noteId, title, content, categoryId, tagIds]);
});

ipcMain.handle('plugin:knowledge-base:deleteNote', (_event, noteId: string) => {
  return invokeActionPlugin('knowledge-base:result', 'deleteNote', 'knowledge-base:deleteNote', [noteId]);
});

ipcMain.handle('plugin:knowledge-base:getCategories', () => {
  return invokeActionPlugin('knowledge-base:result', 'getCategories', 'knowledge-base:getCategories', []);
});

ipcMain.handle('plugin:knowledge-base:createCategory', (_event, name: string, color?: string) => {
  return invokeActionPlugin('knowledge-base:result', 'createCategory', 'knowledge-base:createCategory', [name, color]);
});

ipcMain.handle('plugin:knowledge-base:deleteCategory', (_event, categoryId: string) => {
  return invokeActionPlugin('knowledge-base:result', 'deleteCategory', 'knowledge-base:deleteCategory', [categoryId]);
});

ipcMain.handle('plugin:knowledge-base:getTags', () => {
  return invokeActionPlugin('knowledge-base:result', 'getTags', 'knowledge-base:getTags', []);
});

ipcMain.handle('plugin:knowledge-base:createTag', (_event, name: string) => {
  return invokeActionPlugin('knowledge-base:result', 'createTag', 'knowledge-base:createTag', [name]);
});

ipcMain.handle('plugin:knowledge-base:deleteTag', (_event, tagId: string) => {
  return invokeActionPlugin('knowledge-base:result', 'deleteTag', 'knowledge-base:deleteTag', [tagId]);
});

// ---------- AI 核心 IPC ----------
ipcMain.handle('core:ai:list-providers', () => listAiProviders());
ipcMain.handle('core:ai:get-runtime-config', () => getAiRuntimeConfig());
ipcMain.handle('core:ai:upsert-provider', (_event, provider: Omit<AiProviderConfig, 'createdAt' | 'updatedAt'>) => {
  return upsertAiProvider(provider);
});
ipcMain.handle('core:ai:delete-provider', (_event, providerId: string) => deleteAiProvider(providerId));
ipcMain.handle('core:ai:update-runtime-config', (_event, config: AiRuntimeConfig) => updateAiRuntimeConfig(config));
ipcMain.handle('core:ai:chat', (_event, request: AiChatRequest) => chat(request));

// ---------- 启动 ----------
async function bootstrap(): Promise<void> {
  await initDatabase(path.join(app.getPath('userData'), 'assistant.db'));
  console.log('[Main] 数据库已初始化');

  initAi();
  console.log('[Main] AI 核心已初始化');

  await loadAllPlugins();

  bus.emit('core:ready');
  console.log('[Main] 核心已就绪');

  createBallWindow();
  createTray();
  registerGlobalShortcuts();
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

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  closeDatabase();
});

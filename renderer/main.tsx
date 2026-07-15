import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import App from './App';
import './global.css';
import { chakraThemeConfig } from './theme';

const theme = extendTheme(chakraThemeConfig);
const originalConsoleError = console.error.bind(console);
let reportingGlobalError = false;

// ===== 全局错误捕获：记录所有未捕获异常到日志系统 =====
function logGlobalError(level: 'error' | 'warn', scope: string, message: string, error?: Error | null) {
  if (reportingGlobalError) return;
  reportingGlobalError = true;

  try {
    const result = window.assistant.log?.(level, scope, message, {
      stack: error?.stack,
      name: error?.name,
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
    result?.catch((err) => originalConsoleError('日志上报失败:', err));
  } catch (e) {
    originalConsoleError('日志上报失败:', e);
  } finally {
    reportingGlobalError = false;
  }
}

// JS 运行时错误
window.onerror = function(message, source, lineno, colno, error) {
  console.error('[Global Error]', message, source, lineno, colno);
  logGlobalError('error', 'global', String(message), error || null);
  return false; // 继续默认处理（显示在控制台）
};

// Promise 未捕获拒绝
window.onunhandledrejection = function(event) {
  console.error('[Unhandled Rejection]', event.reason);
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
  logGlobalError('error', 'promise', `Unhandled Promise Rejection: ${message}`, event.reason instanceof Error ? event.reason : null);
};

// React 错误边界捕获（在控制台显示，但 UI 不崩溃）
console.error = function(...args) {
  originalConsoleError(...args);
  try {
    const message = args.map(a => String(a)).join(' ');
    if (message.includes('React') || message.includes('Error') || message.includes('error')) {
      logGlobalError('error', 'react', message);
    }
  } catch {}
};

// 根据 URL hash 判断角色：/#ball → 悬浮球，/#panel → 面板
// 浏览器开发模式默认显示面板
const hash = window.location.hash.replace('#', '');
const role: 'ball' | 'panel' = (hash === 'ball' || hash === 'panel') ? hash : 'panel';

// 浏览器开发模式 mock（Electron 环境中 preload 会覆盖此对象）
const mockData = { notes: [], categories: [], tags: [] };

if (!window.assistant) {
  window.assistant = {
    expandBall: () => console.log('[mock] expand'),
    collapseBall: () => console.log('[mock] collapse'),
    showBallContextMenu: () => console.log('[mock] context menu'),
    quitBall: () => console.log('[mock] quit'),
    moveWindow: (_dx: number, _dy: number) => {},
    panelReady: () => {},
    openDevTools: () => console.log('[mock] open devtools'),
    listPlugins: async () => [
      { id: 'hello-world', name: 'Hello World', version: '0.1.0', description: '验证插件机制的示例插件 (mock)' },
      { id: 'calculator', name: 'Calculator', version: '0.1.0', description: '简单计算器插件 (mock)' },
      { id: 'dev-utils', name: 'Dev Utils', version: '0.1.0', description: '开发工具集 (mock)' },
    ],
    greet: async (_name: string) => ({ success: true }),
    calculate: async (expression: string) => {
      try {
        const result = Function(`"use strict"; return (${expression})`)();
        return String(Math.round(result * 1e10) / 1e10);
      } catch {
        return 'Error';
      }
    },
    devUtils: async (action: string, ...args: any[]) => {
      const input = args[0] as string;
      switch (action) {
        case 'jsonFormat': {
          try { return { success: true, output: JSON.stringify(JSON.parse(input), null, 2) }; }
          catch (e: any) { return { success: false, output: `JSON 解析失败: ${e.message}` }; }
        }
        case 'base64Encode': return btoa(unescape(encodeURIComponent(input)));
        case 'base64Decode': {
          try { return { success: true, output: decodeURIComponent(escape(atob(input))) }; }
          catch { return { success: false, output: 'Base64 解码失败' }; }
        }
        case 'timestampToDate': {
          const num = Number(input);
          if (isNaN(num)) return { success: false, output: '无效的时间戳' };
          const ms = input.length <= 10 ? num * 1000 : num;
          return { success: true, output: new Date(ms).toLocaleString('zh-CN') + '\n' + new Date(ms).toISOString() };
        }
        case 'dateToTimestamp': {
          const ts = Date.parse(input);
          return isNaN(ts) ? { success: false, output: '无效日期' } : { success: true, output: String(ts) };
        }
        case 'regexTest': {
          const [pattern, text, flags] = args as [string, string, string];
          try {
            const re = new RegExp(pattern, flags);
            const matches: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null) { matches.push(m[0]); if (!re.global) break; }
            return { success: true, matches };
          } catch (e: any) { return { success: false, matches: [], error: e.message }; }
        }
        case 'uuidGenerate': {
          const version = args[0] as string;
          if (version === 'v4') {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
            });
          }
          const ts = Date.now().toString(16).padStart(12, '0');
          const rand = Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
          return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${rand.slice(0, 3)}-${rand.slice(3, 7)}-${rand.slice(7, 19)}`;
        }
        default: return null;
      }
    },
    getNotes: async () => mockData.notes,
    searchNotes: async (keyword: string) => ({ notes: mockData.notes.filter(n => n.title.includes(keyword) || n.content.includes(keyword)), total: 0 }),
    createNote: async (title: string, content: string, categoryId: string, tagIds: string[]) => {
      const id = Date.now().toString();
      const now = new Date().toISOString();
      mockData.notes.push({ id, title, content, categoryId, tagIds, createdAt: now, updatedAt: now });
      return { success: true, noteId: id };
    },
    updateNote: async (noteId: string, title: string, content: string, categoryId: string, tagIds: string[]) => {
      const note = mockData.notes.find(n => n.id === noteId);
      if (note) {
        note.title = title;
        note.content = content;
        note.categoryId = categoryId;
        note.tagIds = tagIds;
        note.updatedAt = new Date().toISOString();
      }
      return { success: true };
    },
    deleteNote: async (noteId: string) => {
      mockData.notes = mockData.notes.filter(n => n.id !== noteId);
      return { success: true };
    },
    getCategories: async () => mockData.categories.length === 0 ? [{ id: '1', name: '默认', color: '#2563eb' }] : mockData.categories,
    createCategory: async (name: string, color?: string) => {
      const id = Date.now().toString();
      mockData.categories.push({ id, name, color: color || '#999999' });
      return { success: true, categoryId: id };
    },
    deleteCategory: async (categoryId: string) => {
      mockData.categories = mockData.categories.filter(c => c.id !== categoryId);
      return { success: true };
    },
    getTags: async () => mockData.tags,
    createTag: async (name: string) => {
      const id = Date.now().toString();
      mockData.tags.push({ id, name });
      return { success: true, tagId: id };
    },
    deleteTag: async (tagId: string) => {
      mockData.tags = mockData.tags.filter(t => t.id !== tagId);
      return { success: true };
    },
    getVersion: () => '0.1.0 (browser)',
    log: (level: string, scope: string, message: string, meta?: any) => {
      console.log(`[${level}]`, scope, message, meta || '');
    },
    openLogsDir: () => console.log('[mock] openLogsDir'),
    getLogPath: () => '/tmp/mock.log',
    readRecentLogs: async (lines?: number) => [],
    getLatestMcpActivity: async () => null,
    clearLogs: async () => {},
    takeScreenshot: async () => {
      console.log('[mock] takeScreenshot');
      return { success: true, filePath: '/mock/screenshot.png' };
    },
    focus: {
      ingest: async () => ({ ok: true, data: { status: 'accepted', deduplicated: false, decision: 'skip', focusId: null, runId: 'mock-run', reason: null, lowConfidence: false } }),
      ingestBatch: async () => ({ ok: true, data: { status: 'accepted', accepted: 0, duplicates: 0, failed: 0, results: [] } }),
      listFocuses: async () => ({ ok: true, data: [] }),
      listRuns: async () => ({ ok: true, data: [] }),
      getRun: async () => ({ ok: false, error: 'mock: run_not_found' }),
      trend: async () => ({ ok: true, data: [] }),
      health: async () => ({ ok: true, data: { ok: true, service: 'mock-fie' } }),
    },
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <App role={role} />
    </ChakraProvider>
  </React.StrictMode>
);

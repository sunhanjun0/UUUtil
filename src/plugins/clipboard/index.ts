/**
 * clipboard 插件 —— 剪贴板历史
 *
 * 阶段 1：监听系统剪贴板变化（主进程 Electron clipboard + 定时轮询，无原生事件），
 *          文本历史记录到 SQLite，面板支持搜索 / 时间排序 / 点击复制回剪贴板 / 置顶 / 清理。
 *
 * 运行进程：主进程（plugin-loader 通过 require 加载，Node 上下文），
 *           因此可直接使用 Electron 的 clipboard 模块读写系统剪贴板。
 */

import { clipboard } from 'electron';
import { bus } from '../../core/event-bus';
import { registerCommand } from '../../core/command-registry';
import { info, error } from '../../core/logger';
import type { PluginManifest } from '../../core/plugin-loader';
import {
  api,
  ensureClipboardTable,
  getLastSeenText,
  setLastSeenText,
} from './api';
import type { ListClipboardOptions } from '../../shared/types';

/** 轮询间隔（ms）。Electron 无剪贴板变化原生事件，只能轮询。 */
const POLL_INTERVAL_MS = 1000;

let pollTimer: ReturnType<typeof setInterval> | null = null;

/** core:ready 监听引用，deactivate 时移除，避免禁用后仍响应内核就绪事件 */
let coreReadyHandler: (() => void) | null = null;

export const manifest: PluginManifest = {
  id: 'clipboard',
  name: '剪贴板历史',
  version: '0.1.0',
  description: '监听系统剪贴板变化，记录文本复制历史，支持搜索 / 一键复制回剪贴板 / 置顶',
};

export function activate(): void {
  info('clipboard', '插件已激活');

  coreReadyHandler = () => {
    // 隔离建表与监听启动：任一失败不拖累另一个，且都记录根因日志
    try {
      ensureClipboardTable();
      info('clipboard', '剪贴板历史表已就绪');
    } catch (err) {
      error('clipboard', '建表失败，剪贴板监听未启动', {
        error: err instanceof Error ? err.message : String(err),
      });
      return; // 表未就绪，监听无意义
    }
    try {
      startMonitor();
    } catch (err) {
      error('clipboard', '剪贴板监听启动失败', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
  bus.on('core:ready', coreReadyHandler);

  // ===== CLI 命令 =====

  registerCommand({
    command: 'clipboard.list',
    description: '列出剪贴板历史（默认按置顶 + 最近使用排序，limit=100）',
    params: [
      { name: 'keyword', type: 'string', required: false, description: '关键字模糊搜索' },
      { name: 'pinnedOnly', type: 'boolean', required: false, description: '仅返回置顶项' },
      { name: 'limit', type: 'number', required: false, description: '返回条数上限，默认 100，最大 500' },
    ],
    example: { keyword: '', limit: 50 },
    handler: (args) => {
      const options: ListClipboardOptions = {};
      if (typeof args.keyword === 'string') options.keyword = args.keyword;
      if (args.pinnedOnly === true) options.pinnedOnly = true;
      if (args.limit !== undefined && args.limit !== null) {
        const n = Number(args.limit);
        if (Number.isFinite(n)) options.limit = Math.trunc(n);
      }
      return api.list(options);
    },
  });

  registerCommand({
    command: 'clipboard.get',
    description: '按 id 取一条剪贴板历史详情',
    params: [{ name: 'id', type: 'string', required: true, description: '记录 id，形如 clip_xxx' }],
    example: { id: 'clip_xxxxxxxx' },
    handler: (args) => {
      const item = api.get(String(args.id));
      if (!item) throw new Error(`剪贴板记录不存在：${args.id}`);
      return item;
    },
  });

  registerCommand({
    command: 'clipboard.copy',
    description: '把某条历史内容写回系统剪贴板',
    params: [{ name: 'id', type: 'string', required: true, description: '记录 id' }],
    example: { id: 'clip_xxxxxxxx' },
    handler: (args) => {
      const item = api.copyToClipboard(String(args.id));
      bus.emit('clipboard:changed', { reason: 'copy', total: api.count() });
      return item;
    },
  });

  registerCommand({
    command: 'clipboard.pin',
    description: '置顶 / 取消置顶一条历史（置顶项不受上限清理影响）',
    params: [{ name: 'id', type: 'string', required: true, description: '记录 id' }],
    example: { id: 'clip_xxxxxxxx' },
    handler: (args) => {
      const item = api.togglePin(String(args.id));
      bus.emit('clipboard:changed', { reason: 'pin', total: api.count() });
      return item;
    },
  });

  registerCommand({
    command: 'clipboard.remove',
    description: '删除一条剪贴板历史',
    params: [{ name: 'id', type: 'string', required: true, description: '记录 id' }],
    example: { id: 'clip_xxxxxxxx' },
    handler: (args) => {
      api.remove(String(args.id));
      bus.emit('clipboard:changed', { reason: 'remove', total: api.count() });
      return { removed: 1 };
    },
  });

  registerCommand({
    command: 'clipboard.clear',
    description: '清空所有非置顶的剪贴板历史',
    params: [],
    example: {},
    handler: () => {
      const cleared = api.clear();
      bus.emit('clipboard:changed', { reason: 'clear', total: api.count() });
      return { cleared };
    },
  });

  bus.emit('clipboard:activated', { version: manifest.version });
}

/** 启动系统剪贴板轮询监听。 */
function startMonitor(): void {
  if (pollTimer) return;
  // 以当前剪贴板内容作为基线，避免把启动前就已存在的内容当成新复制记录下来
  try {
    setLastSeenText(clipboard.readText() || null);
  } catch (err) {
    error('clipboard', '读取初始剪贴板失败', { error: err instanceof Error ? err.message : String(err) });
  }

  pollTimer = setInterval(() => {
    try {
      const text = clipboard.readText();
      if (!text || text === getLastSeenText()) return;
      setLastSeenText(text);
      const result = api.record(text);
      if (result) {
        bus.emit('clipboard:changed', { reason: 'record', total: api.count() });
      }
    } catch (err) {
      error('clipboard', '轮询剪贴板失败', { error: err instanceof Error ? err.message : String(err) });
    }
  }, POLL_INTERVAL_MS);

  info('clipboard', '剪贴板监听已启动（轮询间隔 1s）');
}

function stopMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    info('clipboard', '剪贴板监听已停止');
  }
}

export function deactivate(): void {
  stopMonitor();
  if (coreReadyHandler) {
    bus.off('core:ready', coreReadyHandler);
    coreReadyHandler = null;
  }
  info('clipboard', '插件已停用');
  bus.emit('clipboard:deactivated');
}

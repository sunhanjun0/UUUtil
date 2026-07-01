/**
 * 日志 IPC 模块：渲染进程上报日志、读取/打开/清空日志。
 */

import { defineInvoke } from './types';
import type { IpcModule } from './types';
import {
  info as logInfo,
  warn as logWarn,
  error as logError,
  openLogsDir,
  getLogPath,
  readRecentLogs,
  getLatestMcpActivity,
  clearLogs,
} from '../../core';

export const logsIpc: IpcModule = {
  namespace: 'core:logs',
  defs: [
    defineInvoke('core:logs:write', (_event, level: string, scope: string, message: string, meta?: Record<string, unknown>) => {
      const safeScope = `renderer:${scope || 'unknown'}`;
      if (level === 'error') logError(safeScope, message, meta);
      else if (level === 'warn') logWarn(safeScope, message, meta);
      else logInfo(safeScope, message, meta);
      return { success: true };
    }),
    defineInvoke('core:logs:open-dir', () => ({ success: openLogsDir() })),
    defineInvoke('core:logs:get-path', () => getLogPath()),
    defineInvoke('core:logs:recent', (_event, lines?: number) => readRecentLogs(lines)),
    defineInvoke('core:logs:latest-mcp-activity', () => getLatestMcpActivity()),
    defineInvoke('core:logs:clear', () => ({ success: clearLogs() })),
  ],
};

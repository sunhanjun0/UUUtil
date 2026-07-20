/**
 * 统一日志框架 —— JSON Lines 格式，文件轮转
 *
 * 日志级别: debug < info < warn < error
 * 输出位置: app.getPath('userData')/logs/uuutil.log
 * 文件轮转: 每 5MB 轮转一次，最多保留 5 个历史文件
 *
 * 安全规则:
 *   - log() 始终不记录 API Key、完整 dataUrl、完整 prompt 正文。
 *   - 业务模块负责过滤敏感字段再传入 meta。
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';


const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LogEntry {
  time: string;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_LOG_FILES = 5;
const LOG_FILENAME = 'uuutil.log';

let logDir: string | null = null;
let logPath: string | null = null;
let writeStream: fs.WriteStream | null = null;
let minLevel: LogLevel = 'debug';

/** 初始化日志目录与文件流 */
export function initLogger(level: LogLevel = 'debug'): void {
  try {
    initLoggerAt(path.join(app.getPath('userData'), 'logs'), level);
    info('logger', '日志系统已初始化', { path: logPath, level });
  } catch (err) {
    // 初始化失败时 fallback 到 console
    console.error('[Logger] 初始化失败:', err);
  }
}

/** 初始化指定日志目录，用于 Electron 外的独立进程（例如 MCP Server） */
export function initLoggerAt(directory: string, level: LogLevel = 'debug'): void {
  if (writeStream) closeLogger();

  logDir = directory;
  fs.mkdirSync(logDir, { recursive: true });
  logPath = path.join(logDir, LOG_FILENAME);
  minLevel = level;
  tryRotate();
  writeStream = fs.createWriteStream(logPath, { flags: 'a' });
}

/** 关闭日志流 */
export function closeLogger(): void {
  if (writeStream) {
    writeStream.end();
    writeStream = null;
  }
}

/** 检查文件大小并轮转 */
function tryRotate(): void {
  if (!logPath) return;
  try {
    const stats = fs.statSync(logPath);
    if (stats.size < MAX_LOG_SIZE) return;
  } catch {
    return; // 文件不存在则跳过
  }

  // 删除最旧文件
  const oldest = path.join(logDir!, `${LOG_FILENAME}.${MAX_LOG_FILES}`);
  try { fs.unlinkSync(oldest); } catch { /* 忽略 */ }

  // 滚动
  for (let index = MAX_LOG_FILES - 1; index >= 1; index--) {
    const oldFile = path.join(logDir!, `${LOG_FILENAME}.${index}`);
    const newFile = path.join(logDir!, `${LOG_FILENAME}.${index + 1}`);
    try { fs.renameSync(oldFile, newFile); } catch { /* 忽略 */ }
  }

  try {
    fs.renameSync(logPath!, path.join(logDir!, `${LOG_FILENAME}.1`));
  } catch { /* 忽略 */ }
}

/** 写入日志条目 */
function writeLog(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const entry: LogEntry = {
    time: new Date().toISOString(),
    level,
    scope,
    message,
    meta,
  };

  const line = JSON.stringify(entry) + '\n';

  if (writeStream) {
    writeStream.write(line, (err) => {
      if (err) console.error('[Logger] 写入失败:', err);
    });
  }

  // 开发模式也输出到控制台。stdout/stderr 管道可能已经断开（例如父进程 concurrently
  // 早退，只剩孤儿主进程），此时直写会抛 EPIPE 冒泡到 Electron 的 uncaughtException 弹窗，
  // 因此这里整体套 try/catch 静默丢弃，日志文件的落盘不受影响。
  if (process.env.NODE_ENV === 'development') {
    const prefix = `[${entry.time}] [${level.toUpperCase()}] [${scope}]`;
    try {
      if (level === 'error') {
        console.error(prefix, message, meta || '');
      } else if (level === 'warn') {
        console.warn(prefix, message, meta || '');
      } else {
        console.log(prefix, message, meta || '');
      }
    } catch { /* pipe closed / EPIPE 等，忽略 */ }
  }
}

/** 打开日志目录 */
export function openLogsDir(): boolean {
  if (!logDir) return false;
  try {
    const { shell } = require('electron');
    shell.openPath(logDir);
    return true;
  } catch {
    return false;
  }
}

/** 获取日志文件路径 */
export function getLogPath(): string | null {
  return logPath;
}

/** 读取最近日志（按行反转取最新） */
export function readRecentLogs(linesCount = 200): string[] {
  if (!logPath) return [];
  try {
    const content = fs.readFileSync(logPath, 'utf8').trim();
    if (!content) return [];
    const lines = content.split('\n');
    return lines.slice(-linesCount);
  } catch {
    return [];
  }
}


/** 清空当前日志和轮转日志 */
export function clearLogs(): boolean {
  if (!logDir || !logPath) return false;
  try {
    if (writeStream) {
      writeStream.end();
      writeStream = null;
    }

    for (let index = 1; index <= MAX_LOG_FILES; index++) {
      try { fs.unlinkSync(path.join(logDir, `${LOG_FILENAME}.${index}`)); } catch { /* 忽略 */ }
    }
    fs.writeFileSync(logPath, '');
    writeStream = fs.createWriteStream(logPath, { flags: 'a' });
    info('logger', '日志已清空');
    return true;
  } catch (err) {
    console.error('[Logger] 清空日志失败:', err);
    return false;
  }
}

// ---------- 快捷函数 ----------

export function debug(scope: string, message: string, meta?: Record<string, unknown>): void {
  writeLog('debug', scope, message, meta);
}

export function info(scope: string, message: string, meta?: Record<string, unknown>): void {
  writeLog('info', scope, message, meta);
}

export function warn(scope: string, message: string, meta?: Record<string, unknown>): void {
  writeLog('warn', scope, message, meta);
}

export function error(scope: string, message: string, meta?: Record<string, unknown>): void {
  writeLog('error', scope, message, meta);
}

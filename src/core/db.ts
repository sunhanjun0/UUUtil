/**
 * 数据库层 —— 基于 sql.js (WebAssembly SQLite)
 *
 * 所有插件通过此模块操作数据库，不直接访问 SQLite 连接
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { error as logError } from './logger';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let SQLModule: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let lastLoadedMtimeMs = 0;
let hasPendingWrites = false;

// 事件日志写入计数：每累计 TRIM_BATCH 次才做一次 COUNT 预检，避免每次 INSERT 都全表扫描
let eventsSinceTrim = 0;

const AUTO_SAVE_DEBOUNCE_MS = 500;

// 事件日志清理策略：行数上限 + 时间窗口双保险，避免 _events_log 无限增长
// 拖慢 db.export() / autoSave()（sql.js 每次落盘都要全量导出内存库）。
const EVENTS_LOG_MAX_ROWS = 5000;
const EVENTS_LOG_RETENTION_DAYS = 30;
// 滞回批量：超出上限这么多行才触发一次裁剪，裁回上限；
// 避免「超 1 行删 1 行」退化成每次写入都 DELETE。
const EVENTS_LOG_TRIM_BATCH = 500;

export function getDbPath(): string {
  // Electron app.getPath 在初始化时可能不可用，用备用路径
  const userDataPath = path.join(process.cwd(), '.data');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'assistant.db');
}

export async function initDatabase(customPath?: string): Promise<SqlJsDatabase> {
  if (db) return db;

  dbPath = customPath || getDbPath();

  SQLModule = await initSqlJs();

  // 从已有文件加载，没有则创建
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQLModule.Database(buffer);
    lastLoadedMtimeMs = fs.statSync(dbPath).mtimeMs;
  } else {
    db = new SQLModule.Database();
    lastLoadedMtimeMs = 0;
  }

  db.run('PRAGMA foreign_keys = ON');

  // 系统表：插件注册信息
  db.run(`
    CREATE TABLE IF NOT EXISTS _plugins (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      version     TEXT NOT NULL DEFAULT '0.1.0',
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 事件日志表
  db.run(`
    CREATE TABLE IF NOT EXISTS _events_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event       TEXT NOT NULL,
      payload     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 白板状态表
  db.run(`
    CREATE TABLE IF NOT EXISTS whiteboard_state (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 终端会话元数据表（tmux 持久化后端的标签恢复信息，不含命令内容）
  db.run(`
    CREATE TABLE IF NOT EXISTS terminal_sessions (
      tmux_name   TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    )
  `);

  // 界面设置表（KV 存 JSON，如 TAB 栏显隐与排序）
  db.run(`
    CREATE TABLE IF NOT EXISTS ui_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 核心元数据表（KV）：存放一次性迁移标记等，不放业务数据
  db.run(`
    CREATE TABLE IF NOT EXISTS _meta (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  pruneEventsLog(db);

  saveToDisk();
  return db;
}

/**
 * 事件日志清理：时间窗口（超过 RETENTION_DAYS 天）+ 行数上限（保留最新 MAX_ROWS 条）。
 * - 启动时调用一次，消化存量无限增长的数据；
 * - 运行时由 recordEvent() 在超出上限一个批量时触发裁剪。
 */
function pruneEventsLog(database: SqlJsDatabase): void {
  try {
    database.run(`DELETE FROM _events_log WHERE created_at < datetime('now', ?)`, [
      `-${EVENTS_LOG_RETENTION_DAYS} days`,
    ]);
    trimEventsLog(database, EVENTS_LOG_MAX_ROWS);
    eventsSinceTrim = 0; // 启动时已裁剪到上限，计数归零
  } catch (err) {
    logError('db', 'events_log_prune_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * 删除最旧的行，仅保留最新 keepRows 条（不足则什么都不删）。
 * 子查询取「第 keepRows+1 新」的 id（OFFSET 从 0 计），删除它及更旧的全部行。
 */
function trimEventsLog(database: SqlJsDatabase, keepRows: number): void {
  database.run(
    `DELETE FROM _events_log WHERE id <= (SELECT id FROM _events_log ORDER BY id DESC LIMIT 1 OFFSET ?)`,
    [keepRows]
  );
}

function countEventsLog(database: SqlJsDatabase): number {
  const stmt = database.prepare(`SELECT COUNT(*) FROM _events_log`);
  try {
    return stmt.step() ? Number(stmt.get()[0]) : 0;
  } finally {
    stmt.free();
  }
}

export function getDatabase(): SqlJsDatabase {
  if (!db) throw new Error('数据库未初始化，请先调用 initDatabase()');
  return db;
}

/** 将内存数据持久化到磁盘 */
function saveToDisk(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  if (!db || !dbPath || !hasPendingWrites) return;
  try {
    if (fs.existsSync(dbPath)) {
      const currentMtimeMs = fs.statSync(dbPath).mtimeMs;
      if (currentMtimeMs > lastLoadedMtimeMs) {
        console.warn('[DB] 检测到外部数据库更新，跳过本次保存以避免覆盖新数据');
        hasPendingWrites = false;
        return;
      }
    }

    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    lastLoadedMtimeMs = fs.statSync(dbPath).mtimeMs;
    hasPendingWrites = false;
  } catch (err) {
    console.error('[DB] 写入磁盘失败:', err);
  }
}

/** 如果数据库文件被外部进程修改，重新加载内存数据库 */
export function reloadDatabaseIfChanged(): boolean {
  if (!db || !dbPath || !SQLModule || !fs.existsSync(dbPath)) return false;
  if (saveTimer) return false;

  const mtimeMs = fs.statSync(dbPath).mtimeMs;
  if (mtimeMs <= lastLoadedMtimeMs) return false;

  const buffer = fs.readFileSync(dbPath);
  db.close();
  db = new SQLModule.Database(buffer);
  db.run('PRAGMA foreign_keys = ON');
  lastLoadedMtimeMs = mtimeMs;
  hasPendingWrites = false;
  return true;
}

/** 在每次写操作后自动保存 */
export function autoSave(): void {
  hasPendingWrites = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveToDisk();
  }, AUTO_SAVE_DEBOUNCE_MS);
}

/** 立即保存待写入的数据，用于应用退出或关键同步点 */
export function flushDatabase(): void {
  saveToDisk();
}

export function closeDatabase(): void {
  if (db) {
    flushDatabase();
    db.close();
    db = null;
  }
}

/**
 * 事件日志统一入口：写入 _events_log 并负责清理与持久化。
 * 各插件不要再自己 INSERT _events_log + autoSave()，一律走这里。
 *
 * - payload 为 null/undefined 存 NULL，字符串原样存，其余 JSON 序列化；
 * - 行数超过上限一个批量（MAX_ROWS + TRIM_BATCH）时裁回上限，平时不做删除；
 * - 写失败只记日志、不抛异常：事件日志属于旁路记录，不能把业务流程带挂。
 */
export function recordEvent(event: string, payload?: unknown): void {
  try {
    const database = getDatabase();
    const serialized =
      payload == null ? null : typeof payload === 'string' ? payload : JSON.stringify(payload);
    database.run(`INSERT INTO _events_log (event, payload) VALUES (?, ?)`, [event, serialized]);

    // 计数预检：每累计一个批量才 COUNT 一次，避免每次 INSERT 都全表扫描
    eventsSinceTrim++;
    if (eventsSinceTrim >= EVENTS_LOG_TRIM_BATCH) {
      eventsSinceTrim = 0;
      if (countEventsLog(database) > EVENTS_LOG_MAX_ROWS + EVENTS_LOG_TRIM_BATCH) {
        trimEventsLog(database, EVENTS_LOG_MAX_ROWS);
      }
    }
    autoSave();
  } catch (err) {
    logError('db', 'events_log_record_failed', {
      event,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 读取核心元数据（_meta KV 表），不存在返回 null */
export function getMeta(key: string): string | null {
  const database = getDatabase();
  const stmt = database.prepare(`SELECT value FROM _meta WHERE key = ?`);
  try {
    stmt.bind([key]);
    if (!stmt.step()) return null;
    const value = stmt.get()[0];
    return typeof value === 'string' ? value : null;
  } finally {
    stmt.free();
  }
}

/** 写入核心元数据（_meta KV 表）并立即落盘 */
export function setMeta(key: string, value: string): void {
  const database = getDatabase();
  database.run(
    `INSERT INTO _meta (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, value]
  );
  autoSave();
}

/**
 * 数据库层 —— 基于 sql.js (WebAssembly SQLite)
 *
 * 所有插件通过此模块操作数据库，不直接访问 SQLite 连接
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

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

  const SQL = await initSqlJs();

  // 从已有文件加载，没有则创建
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
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

  saveToDisk();
  return db;
}

export function getDatabase(): SqlJsDatabase {
  if (!db) throw new Error('数据库未初始化，请先调用 initDatabase()');
  return db;
}

/** 将内存数据持久化到磁盘 */
function saveToDisk(): void {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('[DB] 写入磁盘失败:', err);
  }
}

/** 在每次写操作后自动保存 */
export function autoSave(): void {
  saveToDisk();
}

export function closeDatabase(): void {
  if (db) {
    saveToDisk();
    db.close();
    db = null;
  }
}

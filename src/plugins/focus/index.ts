/**
 * focus 插件 —— 个人关注焦点管理
 */

import { bus } from '../../core/event-bus';
import { getDatabase, autoSave } from '../../core/db';
import type { PluginManifest } from '../../core/plugin-loader';
import { api } from './api';

export const manifest: PluginManifest = {
  id: 'focus',
  name: 'Focus 关注管理',
  version: '0.2.0',
  description: '个人关注焦点管理：时间层面、状态迁移、历史追踪',
};

export function activate(): void {
  console.log('[focus] 插件已激活');

  bus.on('core:ready', () => {
    console.log('[focus] 核心已就绪，执行初始化');
    initializeDatabase();
  });

  // 焦点管理
  bus.on('focus:create-area', (payload) => {
    const result = api.createArea(
      payload.name,
      payload.description,
      payload.whyImportant,
      payload.horizon,
      payload.status,
      payload.importance,
      payload.tagIds,
      payload.desiredOutcome,
      payload.nextReviewAt,
      payload.contextLinks
    );
    bus.emit('focus:area-created', result);
  });

  bus.on('focus:update-area', (payload) => {
    const result = api.updateArea(
      payload.areaId,
      payload.name,
      payload.description,
      payload.whyImportant,
      payload.horizon,
      payload.status,
      payload.importance,
      payload.tagIds,
      payload.desiredOutcome,
      payload.nextReviewAt,
      payload.contextLinks
    );
    bus.emit('focus:area-updated', result);
  });

  bus.on('focus:delete-area', (areaId) => {
    const result = api.deleteArea(areaId);
    bus.emit('focus:area-deleted', result);
  });

  bus.on('focus:get-areas', (filter) => {
    const areas = api.getAreas(filter?.horizon, filter?.status, filter?.tagId, filter?.importance);
    bus.emit('focus:areas-loaded', areas);
  });

  bus.on('focus:get-area-by-id', (areaId) => {
    const area = api.getAreaById(areaId);
    bus.emit('focus:area-loaded', area);
  });

  // 焦点迁移/状态变化
  bus.on('focus:migrate-area', (payload) => {
    const result = api.migrateArea(payload.areaId, payload.toHorizon, payload.reason);
    bus.emit('focus:area-migrated', result);
  });

  bus.on('focus:change-area-status', (payload) => {
    const result = api.changeAreaStatus(payload.areaId, payload.toStatus, payload.reason);
    bus.emit('focus:area-status-changed', result);
  });

  // 迁移历史
  bus.on('focus:get-migrations', (areaId) => {
    const migrations = api.getMigrations(areaId);
    bus.emit('focus:migrations-loaded', migrations);
  });

  // 标签
  bus.on('focus:create-tag', (payload) => {
    const result = api.createTag(payload.name, payload.color);
    bus.emit('focus:tag-created', result);
  });

  bus.on('focus:get-tags', () => {
    const tags = api.getTags();
    bus.emit('focus:tags-loaded', tags);
  });

  bus.on('focus:delete-tag', (tagId) => {
    const result = api.deleteTag(tagId);
    bus.emit('focus:tag-deleted', result);
  });

  // 专注计时（附属功能）
  bus.on('focus:start-session', (focusId) => {
    const result = api.startSession(focusId);
    bus.emit('focus:session-started', result);
  });

  bus.on('focus:end-session', (payload) => {
    const result = api.endSession(payload.sessionId, payload.notes);
    bus.emit('focus:session-ended', result);
  });

  bus.on('focus:get-sessions', (focusId) => {
    const sessions = api.getSessions(focusId);
    bus.emit('focus:sessions-loaded', sessions);
  });

  // 统计
  bus.on('focus:get-stats', () => {
    const stats = api.getStats();
    bus.emit('focus:stats-loaded', stats);
  });

  bus.emit('focus:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[focus] 插件已停用');
  bus.emit('focus:deactivated');
}

function initializeDatabase(): void {
  const db = getDatabase();

  // 标签表
  db.run(`
    CREATE TABLE IF NOT EXISTS focus_tags (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT NOT NULL DEFAULT '#6366f1',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 焦点领域表（新表）
  db.run(`
    CREATE TABLE IF NOT EXISTS focus_areas (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      why_important   TEXT NOT NULL DEFAULT '',
      desired_outcome TEXT,
      horizon         TEXT NOT NULL DEFAULT 'near_term',
      status          TEXT NOT NULL DEFAULT 'active',
      importance      TEXT NOT NULL DEFAULT 'medium',
      tag_ids         TEXT NOT NULL DEFAULT '[]',
      next_review_at  TEXT,
      context_links   TEXT NOT NULL DEFAULT '[]',
      completed_at    TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 迁移历史表
  db.run(`
    CREATE TABLE IF NOT EXISTS focus_migrations (
      id           TEXT PRIMARY KEY,
      focus_id     TEXT NOT NULL,
      from_horizon TEXT,
      to_horizon   TEXT,
      from_status  TEXT,
      to_status    TEXT,
      reason       TEXT,
      occurred_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (focus_id) REFERENCES focus_areas(id) ON DELETE CASCADE
    )
  `);

  // 专注会话表 - 更新列名（item_id -> focus_id）
  db.run(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id                TEXT PRIMARY KEY,
      focus_id          TEXT NOT NULL,
      start_time        TEXT NOT NULL,
      end_time          TEXT,
      duration_minutes  INTEGER,
      notes             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (focus_id) REFERENCES focus_areas(id) ON DELETE CASCADE
    )
  `);

  // 尝试迁移旧数据：旧表 focus_items 数据迁移到新表 focus_areas
  try {
    const oldTableExists = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='focus_items'");
    if (oldTableExists.length > 0 && oldTableExists[0].values.length > 0) {
      const oldData = db.exec('SELECT * FROM focus_items LIMIT 1');
      if (oldData.length > 0 && oldData[0].values.length > 0) {
        console.log('[focus] 检测到旧数据，跳过自动迁移，请手动迁移或重新创建');
      }
    }
  } catch (e) {
    console.log('[focus] 旧数据迁移检查跳过');
  }

  autoSave();
  console.log('[focus] 数据库表初始化完成');
}

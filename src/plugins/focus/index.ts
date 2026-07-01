/**
 * focus 插件 —— 注意力观察系统
 */

import { bus } from '../../core/event-bus';
import { autoSave, getDatabase } from '../../core/db';
import type { PluginManifest } from '../../core/plugin-loader';
import { api } from './api';

export const manifest: PluginManifest = {
  id: 'focus',
  name: 'Focus 注意力观察',
  version: '0.2.0',
  description: '基于检视记录观察注意力分布、衰减和异动',
};

export function activate(): void {
  console.log('[focus] 插件已激活');

  bus.on('core:ready', () => {
    console.log('[focus] 核心已就绪，执行初始化');
    initializeDatabase();
  });

  bus.on('focus:create', (payload) => {
    bus.emit('focus:created', api.create(payload));
  });

  bus.on('focus:update-metadata', (payload) => {
    bus.emit('focus:metadata-updated', api.updateMetadata(payload.focusId, payload.input));
  });

  bus.on('focus:check-in', (payload) => {
    bus.emit('focus:checked-in', api.checkIn(payload));
  });

  bus.on('focus:get', (focusId) => {
    bus.emit('focus:loaded', api.get(focusId));
  });

  bus.on('focus:list', (filters) => {
    bus.emit('focus:list-loaded', api.list(filters));
  });

  bus.on('focus:alerts', () => {
    bus.emit('focus:alerts-loaded', api.alerts());
  });

  bus.on('focus:checkins', (focusId) => {
    bus.emit('focus:checkins-loaded', api.checkins(focusId));
  });

  bus.on('focus:stats', () => {
    bus.emit('focus:stats-loaded', api.stats());
  });

  bus.emit('focus:activated', { version: manifest.version });
}

export function deactivate(): void {
  console.log('[focus] 插件已停用');
  bus.emit('focus:deactivated');
}

export function initializeDatabase(): void {
  const db = getDatabase();
  const schemaVersion = 'attention-v1';

  db.run(`
    CREATE TABLE IF NOT EXISTS _focus_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const versionResult = db.exec("SELECT value FROM _focus_meta WHERE key = 'schema_version'");
  const currentVersion = versionResult[0]?.values[0]?.[0] as string | undefined;
  const shouldRebuild = currentVersion !== schemaVersion;

  if (shouldRebuild) {
    db.run('DROP TABLE IF EXISTS focus_migrations');
    db.run('DROP TABLE IF EXISTS focus_sessions');
    db.run('DROP TABLE IF EXISTS focus_areas');
    db.run('DROP TABLE IF EXISTS focus_checkins');
    db.run('DROP TABLE IF EXISTS focus_tags');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS focus_areas (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      description     TEXT,
      weight          INTEGER NOT NULL,
      attention_mode  TEXT NOT NULL,
      expected_exit   TEXT,
      tags_json       TEXT NOT NULL DEFAULT '[]',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      last_decay_at   TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS focus_checkins (
      id           TEXT PRIMARY KEY,
      focus_id     TEXT NOT NULL,
      timestamp    TEXT NOT NULL,
      energy       TEXT NOT NULL,
      blocker      TEXT,
      next_action  TEXT,
      notes        TEXT,
      FOREIGN KEY (focus_id) REFERENCES focus_areas(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS focus_tags (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      color       TEXT NOT NULL DEFAULT '#6366f1',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `);

  if (shouldRebuild) {
    db.run(
      "INSERT OR REPLACE INTO _focus_meta (key, value) VALUES ('schema_version', ?)",
      [schemaVersion]
    );
    autoSave();
  }

  console.log('[focus] 数据库表初始化完成');
}

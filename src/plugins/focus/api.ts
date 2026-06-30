/**
 * focus 插件 —— 对外 API
 *
 * 铁律：这是插件暴露给外部的唯一合法访问入口
 * 其他地方禁止 import 此插件内部实现的任何文件
 */

import { getDatabase, autoSave } from '../../core/db';
import type {
  FocusApi,
  FocusArea,
  FocusTag,
  FocusSession,
  FocusStats,
  FocusMigration,
  FocusHorizon,
  FocusStatus,
  FocusImportance,
} from '../../shared/types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function getNowIso(): string {
  return new Date().toISOString();
}

type FocusAreaRow = Record<string, any>;

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function mapAreaRow(row: FocusAreaRow): FocusArea {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    whyImportant: row.why_important,
    desiredOutcome: row.desired_outcome,
    horizon: row.horizon as FocusHorizon,
    status: row.status as FocusStatus,
    importance: row.importance as FocusImportance,
    tagIds: parseJsonArray(row.tag_ids),
    nextReviewAt: row.next_review_at,
    contextLinks: parseJsonArray(row.context_links),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export const api: FocusApi = {
  createArea(name, description, whyImportant, horizon, status, importance, tagIds, desiredOutcome, nextReviewAt, contextLinks) {
    try {
      const db = getDatabase();
      const id = generateId();
      const now = getNowIso();

      db.run(
        `INSERT INTO focus_areas (
          id, name, description, why_important, desired_outcome,
          horizon, status, importance, tag_ids, next_review_at,
          context_links, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, name, description, whyImportant, desiredOutcome || null,
          horizon, status, importance, JSON.stringify(tagIds), nextReviewAt || null,
          JSON.stringify(contextLinks || []), now, now
        ]
      );
      autoSave();

      return { success: true, areaId: id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  updateArea(areaId, name, description, whyImportant, horizon, status, importance, tagIds, desiredOutcome, nextReviewAt, contextLinks) {
    try {
      const db = getDatabase();
      const now = getNowIso();

      db.run(
        `UPDATE focus_areas SET
          name = ?, description = ?, why_important = ?, desired_outcome = ?,
          horizon = ?, status = ?, importance = ?, tag_ids = ?,
          next_review_at = ?, context_links = ?, updated_at = ?
         WHERE id = ?`,
        [
          name, description, whyImportant, desiredOutcome || null,
          horizon, status, importance, JSON.stringify(tagIds),
          nextReviewAt || null, JSON.stringify(contextLinks || []), now, areaId
        ]
      );
      autoSave();

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  deleteArea(areaId) {
    try {
      const db = getDatabase();
      db.run('DELETE FROM focus_areas WHERE id = ?', [areaId]);
      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getAreas(horizon, status, tagId, importance) {
    const db = getDatabase();
    let sql = 'SELECT * FROM focus_areas WHERE 1=1';
    const params: any[] = [];

    if (horizon) {
      sql += ' AND horizon = ?';
      params.push(horizon);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (importance) {
      sql += ' AND importance = ?';
      params.push(importance);
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = db.prepare(sql);
    stmt.bind(params);

    const areas: FocusArea[] = [];
    try {
      while (stmt.step()) {
        areas.push(mapAreaRow(stmt.getAsObject()));
      }
    } finally {
      stmt.free();
    }

    if (tagId) {
      return areas.filter(area => area.tagIds.includes(tagId));
    }

    return areas;
  },

  getAreaById(areaId) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM focus_areas WHERE id = ?');
    stmt.bind([areaId]);

    try {
      if (stmt.step()) return mapAreaRow(stmt.getAsObject());
    } finally {
      stmt.free();
    }

    return null;
  },

  migrateArea(areaId, toHorizon, reason) {
    try {
      const db = getDatabase();
      const now = getNowIso();

      // 获取当前 horizon
      const currentStmt = db.prepare('SELECT horizon FROM focus_areas WHERE id = ?');
      currentStmt.bind([areaId]);
      let fromHorizon: FocusHorizon | undefined;
      if (currentStmt.step()) {
        fromHorizon = currentStmt.getAsObject().horizon as FocusHorizon;
      }
      currentStmt.free();

      if (!fromHorizon) {
        return { success: false, error: '焦点不存在' };
      }

      // 更新
      db.run(
        'UPDATE focus_areas SET horizon = ?, updated_at = ? WHERE id = ?',
        [toHorizon, now, areaId]
      );

      // 记录迁移历史
      const migrationId = generateId();
      db.run(
        `INSERT INTO focus_migrations (id, focus_id, from_horizon, to_horizon, reason, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [migrationId, areaId, fromHorizon, toHorizon, reason || null, now]
      );

      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  changeAreaStatus(areaId, toStatus, reason) {
    try {
      const db = getDatabase();
      const now = getNowIso();

      // 获取当前 status
      const currentStmt = db.prepare('SELECT status FROM focus_areas WHERE id = ?');
      currentStmt.bind([areaId]);
      let fromStatus: FocusStatus | undefined;
      if (currentStmt.step()) {
        fromStatus = currentStmt.getAsObject().status as FocusStatus;
      }
      currentStmt.free();

      if (!fromStatus) {
        return { success: false, error: '焦点不存在' };
      }

      // 更新
      const completedAt = toStatus === 'completed' ? now : null;
      db.run(
        'UPDATE focus_areas SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?',
        [toStatus, now, completedAt, areaId]
      );

      // 记录迁移历史
      const migrationId = generateId();
      db.run(
        `INSERT INTO focus_migrations (id, focus_id, from_status, to_status, reason, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [migrationId, areaId, fromStatus, toStatus, reason || null, now]
      );

      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getMigrations(areaId) {
    const db = getDatabase();
    let sql = 'SELECT * FROM focus_migrations';
    const params: any[] = [];

    if (areaId) {
      sql += ' WHERE focus_id = ?';
      params.push(areaId);
    }

    sql += ' ORDER BY occurred_at DESC';

    const stmt = db.prepare(sql);
    stmt.bind(params);

    const migrations: FocusMigration[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      migrations.push({
        id: row.id,
        focusId: row.focus_id,
        fromHorizon: row.from_horizon as FocusHorizon | undefined,
        toHorizon: row.to_horizon as FocusHorizon | undefined,
        fromStatus: row.from_status as FocusStatus | undefined,
        toStatus: row.to_status as FocusStatus | undefined,
        reason: row.reason,
        occurredAt: row.occurred_at,
      });
    }
    stmt.free();

    return migrations;
  },

  createTag(name, color) {
    try {
      const db = getDatabase();
      const id = generateId();
      const now = getNowIso();
      const tagColor = color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

      db.run(
        'INSERT INTO focus_tags (id, name, color, created_at) VALUES (?, ?, ?, ?)',
        [id, name, tagColor, now]
      );
      autoSave();

      return { success: true, tagId: id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getTags() {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM focus_tags ORDER BY created_at DESC');

    const tags: FocusTag[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      tags.push({
        id: row.id,
        name: row.name,
        color: row.color,
        createdAt: row.created_at,
      });
    }
    stmt.free();

    return tags;
  },

  deleteTag(tagId) {
    try {
      const db = getDatabase();
      db.run('DELETE FROM focus_tags WHERE id = ?', [tagId]);
      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  startSession(focusId) {
    try {
      const db = getDatabase();
      const id = generateId();
      const now = getNowIso();

      const activeStmt = db.prepare('SELECT id FROM focus_sessions WHERE end_time IS NULL LIMIT 1');
      try {
        if (activeStmt.step()) return { success: false, error: '已有进行中的专注会话，请先结束当前会话' };
      } finally {
        activeStmt.free();
      }

      db.run(
        'INSERT INTO focus_sessions (id, focus_id, start_time, created_at) VALUES (?, ?, ?, ?)',
        [id, focusId, now, now]
      );
      autoSave();

      return { success: true, sessionId: id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  endSession(sessionId, notes) {
    try {
      const db = getDatabase();
      const now = getNowIso();

      const stmt = db.prepare('SELECT start_time FROM focus_sessions WHERE id = ?');
      stmt.bind([sessionId]);

      let startTime: string | null = null;
      if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        startTime = row.start_time;
      }
      stmt.free();

      if (!startTime) {
        return { success: false, error: '会话不存在' };
      }

      const start = new Date(startTime);
      const end = new Date(now);
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

      db.run(
        'UPDATE focus_sessions SET end_time = ?, duration_minutes = ?, notes = ? WHERE id = ?',
        [now, durationMinutes, notes || null, sessionId]
      );
      autoSave();

      return { success: true, durationMinutes };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getSessions(focusId) {
    const db = getDatabase();
    let sql = 'SELECT * FROM focus_sessions';
    const params: any[] = [];

    if (focusId) {
      sql += ' WHERE focus_id = ?';
      params.push(focusId);
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = db.prepare(sql);
    stmt.bind(params);

    const sessions: FocusSession[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      sessions.push({
        id: row.id,
        focusId: row.focus_id,
        startTime: row.start_time,
        endTime: row.end_time,
        durationMinutes: row.duration_minutes,
        notes: row.notes,
        createdAt: row.created_at,
      });
    }
    stmt.free();

    return sessions;
  },

  getStats() {
    const db = getDatabase();
    const today = new Date().toISOString().split('T')[0];

    const totalAreas = db.exec('SELECT COUNT(*) as cnt FROM focus_areas')[0].values[0][0] as number;
    const currentCore = db.exec("SELECT COUNT(*) as cnt FROM focus_areas WHERE horizon = 'current_core' AND status != 'completed'")[0].values[0][0] as number;
    const nearTerm = db.exec("SELECT COUNT(*) as cnt FROM focus_areas WHERE horizon = 'near_term' AND status != 'completed'")[0].values[0][0] as number;
    const longTerm = db.exec("SELECT COUNT(*) as cnt FROM focus_areas WHERE horizon = 'long_term' AND status != 'completed'")[0].values[0][0] as number;
    const watching = db.exec("SELECT COUNT(*) as cnt FROM focus_areas WHERE horizon = 'watching' AND status != 'completed'")[0].values[0][0] as number;
    const completed = db.exec("SELECT COUNT(*) as cnt FROM focus_areas WHERE status = 'completed'")[0].values[0][0] as number;

    const totalFocusStmt = db.prepare(
      'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM focus_sessions WHERE end_time IS NOT NULL'
    );
    let totalFocusMinutes = 0;
    if (totalFocusStmt.step()) {
      totalFocusMinutes = totalFocusStmt.getAsObject().total as number;
    }
    totalFocusStmt.free();

    const todayFocusStmt = db.prepare(
      "SELECT COALESCE(SUM(duration_minutes), 0) as total FROM focus_sessions WHERE end_time IS NOT NULL AND DATE(end_time) = ?"
    );
    todayFocusStmt.bind([today]);
    let focusMinutesToday = 0;
    if (todayFocusStmt.step()) {
      focusMinutesToday = todayFocusStmt.getAsObject().total as number;
    }
    todayFocusStmt.free();

    return {
      totalAreas,
      currentCore,
      nearTerm,
      longTerm,
      watching,
      completed,
      totalFocusMinutes,
      focusMinutesToday,
    };
  },
};

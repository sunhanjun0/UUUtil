/**
 * Focus API —— 注意力观察系统
 */

import { autoSave, getDatabase } from '../../core/db';
import type {
  FocusAlert,
  FocusArea,
  FocusAreaView,
  FocusApi,
  FocusAttentionMode,
  FocusCheckIn,
  FocusCheckInEnergy,
  FocusCreateInput,
  FocusHealth,
  FocusListFilters,
  FocusReviewCadence,
  FocusStats,
  FocusTag,
} from '../../shared/types';

type Row = Record<string, any>;

type ModeRule = {
  cadence: FocusReviewCadence;
  cadenceDays: number;
  thresholdDays: number;
};

const modeRules: Record<FocusAttentionMode, ModeRule> = {
  deep: { cadence: 'daily', cadenceDays: 1, thresholdDays: 2 },
  pulse: { cadence: 'daily', cadenceDays: 1, thresholdDays: 4 },
  scan: { cadence: 'weekly', cadenceDays: 7, thresholdDays: 10 },
  dormant: { cadence: 'monthly', cadenceDays: 30, thresholdDays: 30 },
};

const modes: FocusAttentionMode[] = ['deep', 'pulse', 'scan', 'dormant'];
const healthValues: FocusHealth[] = ['aligned', 'drifting', 'neglected', 'cooling'];

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function clampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 5;
  return Math.max(0, Math.min(10, Math.round(weight)));
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags || []).map((tag) => tag.trim()).filter(Boolean)));
}

function daysBetween(fromIso: string, to = new Date()): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return 0;
  return Math.max(0, Math.floor((to.getTime() - from) / 86_400_000));
}

function mapArea(row: Row): FocusArea {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    weight: Number(row.weight || 0),
    attentionMode: row.attention_mode as FocusAttentionMode,
    expectedExit: row.expected_exit || undefined,
    tags: parseJsonArray(row.tags_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastDecayAt: row.last_decay_at,
  };
}

function mapCheckIn(row: Row): FocusCheckIn {
  return {
    id: row.id,
    focusId: row.focus_id,
    timestamp: row.timestamp,
    energy: row.energy as FocusCheckInEnergy,
    blocker: row.blocker || undefined,
    nextAction: row.next_action || undefined,
    notes: row.notes || undefined,
  };
}

function mapTag(row: Row): FocusTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getLastCheckIn(focusId: string): FocusCheckIn | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM focus_checkins WHERE focus_id = ? ORDER BY timestamp DESC LIMIT 1');
  stmt.bind([focusId]);
  try {
    if (stmt.step()) return mapCheckIn(stmt.getAsObject());
    return null;
  } finally {
    stmt.free();
  }
}

function getCheckInCount(focusId: string, sinceIso?: string): number {
  const db = getDatabase();
  const sql = sinceIso
    ? 'SELECT COUNT(*) AS count FROM focus_checkins WHERE focus_id = ? AND timestamp >= ?'
    : 'SELECT COUNT(*) AS count FROM focus_checkins WHERE focus_id = ?';
  const stmt = db.prepare(sql);
  stmt.bind(sinceIso ? [focusId, sinceIso] : [focusId]);
  try {
    if (stmt.step()) return Number(stmt.getAsObject().count || 0);
    return 0;
  } finally {
    stmt.free();
  }
}

function computeHealth(area: FocusArea, daysSinceLastCheckIn: number | null): FocusHealth {
  if (area.weight <= 2) return 'cooling';
  const threshold = modeRules[area.attentionMode].thresholdDays;
  if (daysSinceLastCheckIn === null) {
    return daysBetween(area.createdAt) > threshold ? 'neglected' : 'drifting';
  }
  if (daysSinceLastCheckIn > threshold) return 'neglected';
  if (daysSinceLastCheckIn > threshold * 0.5) return 'drifting';
  return 'aligned';
}

function computeAlerts(area: FocusArea, health: FocusHealth, daysSinceLastCheckIn: number | null, recentCheckInCount: number): FocusAlert[] {
  const createdAt = nowIso();
  const alerts: FocusAlert[] = [];
  if (health === 'neglected') {
    alerts.push({
      id: `${area.id}:neglected`,
      focusId: area.id,
      type: 'neglected',
      message: `${area.name} 已 ${daysSinceLastCheckIn ?? daysBetween(area.createdAt)} 天未检视`,
      severity: 'critical',
      createdAt,
      meta: { daysSinceLastCheckIn },
    });
  }
  if (area.weight <= 2 && area.weight > 0) {
    alerts.push({
      id: `${area.id}:weight_decay`,
      focusId: area.id,
      type: 'weight_decay',
      message: `${area.name} 注意力比重已降至 ${area.weight}`,
      severity: 'warning',
      createdAt,
      meta: { weight: area.weight },
    });
  }
  if (area.weight === 0) {
    alerts.push({
      id: `${area.id}:exit_triggered`,
      focusId: area.id,
      type: 'exit_triggered',
      message: `${area.name} 已自然淡出`,
      severity: 'info',
      createdAt,
      meta: { weight: area.weight },
    });
  }
  if (area.weight <= 3 && recentCheckInCount >= 4) {
    alerts.push({
      id: `${area.id}:attention_drift`,
      focusId: area.id,
      type: 'attention_drift',
      message: `${area.name} 低比重但近期检视频繁，可能存在注意力错位`,
      severity: 'warning',
      createdAt,
      meta: { weight: area.weight, recentCheckInCount },
    });
  }
  return alerts;
}

function applyDecay(area: FocusArea): FocusArea {
  const rule = modeRules[area.attentionMode];
  const periods = Math.floor(daysBetween(area.lastDecayAt) / rule.cadenceDays);
  if (periods <= 0) return area;

  const db = getDatabase();
  let weight = area.weight;
  let lastDecayAt = area.lastDecayAt;
  const lastDecayTime = new Date(area.lastDecayAt).getTime();

  for (let index = 1; index <= periods; index += 1) {
    const periodEnd = new Date(lastDecayTime + index * rule.cadenceDays * 86_400_000).toISOString();
    const stmt = db.prepare('SELECT COUNT(*) AS count FROM focus_checkins WHERE focus_id = ? AND timestamp > ? AND timestamp <= ?');
    stmt.bind([area.id, lastDecayAt, periodEnd]);
    let count = 0;
    try {
      if (stmt.step()) count = Number(stmt.getAsObject().count || 0);
    } finally {
      stmt.free();
    }
    if (count === 0) weight = Math.max(weight - 1, 0);
    lastDecayAt = periodEnd;
  }

  if (weight !== area.weight || lastDecayAt !== area.lastDecayAt) {
    const updatedAt = nowIso();
    db.run('UPDATE focus_areas SET weight = ?, last_decay_at = ?, updated_at = ? WHERE id = ?', [weight, lastDecayAt, updatedAt, area.id]);
    autoSave();
    return { ...area, weight, lastDecayAt, updatedAt };
  }
  return area;
}

function buildView(area: FocusArea): FocusAreaView {
  const decayed = applyDecay(area);
  const lastCheckIn = getLastCheckIn(decayed.id);
  const daysSinceLastCheckIn = lastCheckIn ? daysBetween(lastCheckIn.timestamp) : null;
  const since7Days = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const recentCheckInCount = getCheckInCount(decayed.id, since7Days);
  const checkInCount = getCheckInCount(decayed.id);
  const health = computeHealth(decayed, daysSinceLastCheckIn);
  const alerts = computeAlerts(decayed, health, daysSinceLastCheckIn, recentCheckInCount);
  return {
    ...decayed,
    reviewCadence: modeRules[decayed.attentionMode].cadence,
    health,
    daysSinceLastCheckIn,
    lastCheckInAt: lastCheckIn?.timestamp,
    recentCheckInCount,
    checkInCount,
    alerts,
  };
}

function getAreaRaw(focusId: string): FocusArea | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM focus_areas WHERE id = ?');
  stmt.bind([focusId]);
  try {
    if (stmt.step()) return mapArea(stmt.getAsObject());
    return null;
  } finally {
    stmt.free();
  }
}

function listRawAreas(): FocusArea[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM focus_areas ORDER BY updated_at DESC');
  const areas: FocusArea[] = [];
  try {
    while (stmt.step()) areas.push(mapArea(stmt.getAsObject()));
  } finally {
    stmt.free();
  }
  return areas;
}

function sortViews(views: FocusAreaView[]): FocusAreaView[] {
  const healthRank: Record<FocusHealth, number> = { neglected: 0, drifting: 1, cooling: 2, aligned: 3 };
  return [...views].sort((a, b) => {
    const healthDelta = healthRank[a.health] - healthRank[b.health];
    if (healthDelta !== 0) return healthDelta;
    return b.weight - a.weight;
  });
}

function applyFilters(views: FocusAreaView[], filters?: FocusListFilters): FocusAreaView[] {
  if (!filters) return views.filter((view) => view.weight > 0);
  return views.filter((view) => {
    if (!filters.includeDormant && view.weight === 0) return false;
    if (filters.minWeight !== undefined && view.weight < filters.minWeight) return false;
    if (filters.maxWeight !== undefined && view.weight > filters.maxWeight) return false;
    if (filters.health && view.health !== filters.health) return false;
    if (filters.attentionMode && view.attentionMode !== filters.attentionMode) return false;
    if (filters.tag && !view.tags.includes(filters.tag)) return false;
    return true;
  });
}

function restoreWeightOnCheckIn(area: FocusArea, energy: FocusCheckInEnergy): void {
  if (energy === 'avoiding' || area.weight >= 10) return;
  const since14Days = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const engagedCount = getCheckInCount(area.id, since14Days);
  if (engagedCount > 0 && engagedCount % 3 === 0) {
    const weight = Math.min(area.weight + 1, 10);
    const updatedAt = nowIso();
    getDatabase().run('UPDATE focus_areas SET weight = ?, updated_at = ? WHERE id = ?', [weight, updatedAt, area.id]);
  }
}

export const api: FocusApi = {
  create(input) {
    try {
      const name = input.name.trim();
      if (!name) return { success: false, error: '焦点名称不能为空' };
      if (!modes.includes(input.attentionMode)) return { success: false, error: '无效的注意力模式' };
      const weight = clampWeight(input.weight);
      const id = generateId();
      const now = nowIso();
      getDatabase().run(
        `INSERT INTO focus_areas (id, name, description, weight, attention_mode, expected_exit, tags_json, created_at, updated_at, last_decay_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, input.description || null, weight, input.attentionMode, input.expectedExit || null, JSON.stringify(normalizeTags(input.tags)), now, now, now]
      );
      autoSave();
      return { success: true, focusId: id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  updateMetadata(focusId, input) {
    try {
      const area = getAreaRaw(focusId);
      if (!area) return { success: false, error: '焦点不存在' };
      const next = {
        name: input.name !== undefined ? input.name.trim() : area.name,
        description: input.description !== undefined ? input.description : area.description,
        expectedExit: input.expectedExit !== undefined ? input.expectedExit : area.expectedExit,
        tags: input.tags !== undefined ? normalizeTags(input.tags) : area.tags,
      };
      if (!next.name) return { success: false, error: '焦点名称不能为空' };
      getDatabase().run(
        'UPDATE focus_areas SET name = ?, description = ?, expected_exit = ?, tags_json = ?, updated_at = ? WHERE id = ?',
        [next.name, next.description || null, next.expectedExit || null, JSON.stringify(next.tags), nowIso(), focusId]
      );
      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  checkIn(input) {
    try {
      const area = getAreaRaw(input.focusId);
      if (!area) return { success: false, error: '焦点不存在' };
      const id = generateId();
      const timestamp = nowIso();
      getDatabase().run(
        `INSERT INTO focus_checkins (id, focus_id, timestamp, energy, blocker, next_action, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, input.focusId, timestamp, input.energy, input.blocker || null, input.nextAction || null, input.notes || null]
      );
      restoreWeightOnCheckIn(area, input.energy);
      getDatabase().run('UPDATE focus_areas SET updated_at = ? WHERE id = ?', [timestamp, input.focusId]);
      autoSave();
      return { success: true, checkInId: id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  get(focusId) {
    const area = getAreaRaw(focusId);
    return area ? buildView(area) : null;
  },

  list(filters) {
    return sortViews(applyFilters(listRawAreas().map(buildView), filters));
  },

  alerts() {
    return this.list({ includeDormant: true }).flatMap((view) => view.alerts);
  },

  checkins(focusId) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM focus_checkins WHERE focus_id = ? ORDER BY timestamp DESC');
    stmt.bind([focusId]);
    const rows: FocusCheckIn[] = [];
    try {
      while (stmt.step()) rows.push(mapCheckIn(stmt.getAsObject()));
    } finally {
      stmt.free();
    }
    return rows;
  },

  stats() {
    const views = this.list({ includeDormant: true });
    const modeCounts = Object.fromEntries(modes.map((mode) => [mode, 0])) as FocusStats['modeCounts'];
    const healthCounts = Object.fromEntries(healthValues.map((health) => [health, 0])) as FocusStats['healthCounts'];
    let weightTotal = 0;
    for (const view of views) {
      modeCounts[view.attentionMode] += 1;
      healthCounts[view.health] += 1;
      weightTotal += view.weight;
    }
    const db = getDatabase();
    const totalCheckIns = Number(db.exec('SELECT COUNT(*) AS count FROM focus_checkins')[0]?.values[0]?.[0] || 0);
    const since7Days = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const checkInsLast7Days = Number(db.exec(`SELECT COUNT(*) AS count FROM focus_checkins WHERE timestamp >= '${since7Days}'`)[0]?.values[0]?.[0] || 0);
    return {
      totalAreas: views.length,
      activeAreas: views.filter((view) => view.weight > 0).length,
      modeCounts,
      healthCounts,
      alertCount: views.reduce((sum, view) => sum + view.alerts.length, 0),
      totalCheckIns,
      checkInsLast7Days,
      averageWeight: views.length ? Math.round((weightTotal / views.length) * 10) / 10 : 0,
    };
  },
  createTag(name, color) {
    try {
      const id = generateId();
      const now = nowIso();
      getDatabase().run(
        'INSERT INTO focus_tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, name.trim(), color || '#6366f1', now, now]
      );
      autoSave();
      return { success: true, tagId: id };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  updateTag(tagId, name, color) {
    try {
      getDatabase().run(
        'UPDATE focus_tags SET name = ?, color = COALESCE(?, color), updated_at = ? WHERE id = ?',
        [name.trim(), color || null, nowIso(), tagId]
      );
      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  listTags() {
    const stmt = getDatabase().prepare('SELECT * FROM focus_tags ORDER BY created_at DESC');
    const tags: FocusTag[] = [];
    try {
      while (stmt.step()) tags.push(mapTag(stmt.getAsObject()));
    } finally {
      stmt.free();
    }
    return tags;
  },

  deleteTag(tagId) {
    try {
      const tag = this.listTags().find((item) => item.id === tagId || item.name === tagId);
      if (!tag) return { success: false, error: '标签不存在' };
      const referenced = listRawAreas().some((area) => area.tags.includes(tag.id) || area.tags.includes(tag.name));
      if (referenced) return { success: false, error: '标签正在被焦点引用' };
      getDatabase().run('DELETE FROM focus_tags WHERE id = ?', [tag.id]);
      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  resetAll() {
    try {
      getDatabase().run('DELETE FROM focus_checkins');
      getDatabase().run('DELETE FROM focus_areas');
      getDatabase().run('DELETE FROM focus_tags');
      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

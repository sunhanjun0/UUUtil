/**
 * 界面设置 —— TAB 栏显隐与排序等前端布局配置的持久化。
 * 复用 ui_settings KV 表，把整份布局对象序列化成一行 JSON 存储。
 */

import { getDatabase, autoSave } from './db';
import type { TabLayout } from '../shared/types';

const TAB_LAYOUT_KEY = 'front-tabs';

function emptyLayout(): TabLayout {
  return { order: [], hidden: [] };
}

export function getTabLayout(): TabLayout {
  const db = getDatabase();
  const statement = db.prepare(`SELECT value FROM ui_settings WHERE key = ?`);
  try {
    statement.bind([TAB_LAYOUT_KEY]);
    if (!statement.step()) return emptyLayout();
    const raw = statement.get()[0];
    if (typeof raw !== 'string') return emptyLayout();
    const parsed = JSON.parse(raw) as Partial<TabLayout>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order.filter((p): p is string => typeof p === 'string') : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((p): p is string => typeof p === 'string') : [],
    };
  } catch {
    return emptyLayout();
  } finally {
    statement.free();
  }
}

export function saveTabLayout(layout: TabLayout): { success: true } {
  const db = getDatabase();
  const value = JSON.stringify({
    order: Array.isArray(layout.order) ? layout.order : [],
    hidden: Array.isArray(layout.hidden) ? layout.hidden : [],
  });
  db.run(
    `INSERT INTO ui_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [TAB_LAYOUT_KEY, value],
  );
  autoSave();
  return { success: true };
}

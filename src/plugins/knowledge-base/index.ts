/**
 * knowledge-base 插件
 */

import { bus } from '../../core/event-bus';
import { getDatabase, autoSave } from '../../core/db';
import { registerCommand } from '../../core/command-registry';
import type { PluginManifest } from '../../core/plugin-loader';
import { api, ovMetaResolver } from './api';
import { ensureOvConfigTable, getOvConfig, isOvAvailable, syncAllNotes } from './openviking';

export const manifest: PluginManifest = {
  id: 'knowledge-base',
  name: 'Knowledge Base',
  version: '1.1.0',
  description: '知识库 - 笔记、分类、标签，接入 OpenViking 语义检索',
};

export function activate(): void {
  console.log('[knowledge-base] 插件已激活');

  bus.on('core:ready', () => {
    console.log('[knowledge-base] 核心已就绪，初始化数据库');
    initializeDatabase();
    ensureOvConfigTable();
    // 后台全量同步到 OpenViking（服务不可达自动跳过，不阻塞启动）
    void syncAllNotes(api.getNotes(), ovMetaResolver).then(({ available, synced }) => {
      console.log(`[knowledge-base] OpenViking 初始同步：${available ? `${synced} 条` : '服务不可达，跳过'}`);
    });
  });

  // kb.sync —— 手动触发全量同步 / 查询 OpenViking 连接状态
  registerCommand({
    command: 'kb.sync',
    description: '知识库全量同步到 OpenViking；传 status 只查询连接状态',
    params: [
      { name: 'status', type: 'string', required: false, description: '传 "status" 只查询连接状态不同步' },
    ],
    example: { status: 'status' },
    handler: async (args) => {
      const available = await isOvAvailable();
      const cfg = getOvConfig();
      if (args.status === 'status' || !available) {
        return { available, baseUrl: cfg.baseUrl, rootUri: cfg.rootUri, enabled: cfg.enabled };
      }
      const result = await syncAllNotes(api.getNotes(), ovMetaResolver);
      return { ...result, baseUrl: cfg.baseUrl, rootUri: cfg.rootUri };
    },
  });

  // 事件监听器
  bus.on('knowledge-base:getNotes', (categoryId?: string, tagId?: string) => {
    const notes = api.getNotes(categoryId, tagId);
    bus.emit('knowledge-base:result', { action: 'getNotes', result: notes });
  });

  bus.on('knowledge-base:searchNotes', (keyword: string) => {
    void api.searchNotes(keyword).then((result) => {
      bus.emit('knowledge-base:result', { action: 'searchNotes', result });
    });
  });

  bus.on('knowledge-base:createNote', (title: string, content: string, categoryId: string, tagIds: string[]) => {
    const result = api.createNote(title, content, categoryId, tagIds);
    bus.emit('knowledge-base:result', { action: 'createNote', result });
  });

  bus.on('knowledge-base:updateNote', (noteId: string, title: string, content: string, categoryId: string, tagIds: string[]) => {
    const result = api.updateNote(noteId, title, content, categoryId, tagIds);
    bus.emit('knowledge-base:result', { action: 'updateNote', result });
  });

  bus.on('knowledge-base:deleteNote', (noteId: string) => {
    const result = api.deleteNote(noteId);
    bus.emit('knowledge-base:result', { action: 'deleteNote', result });
  });

  bus.on('knowledge-base:getCategories', () => {
    const categories = api.getCategories();
    bus.emit('knowledge-base:result', { action: 'getCategories', result: categories });
  });

  bus.on('knowledge-base:createCategory', (name: string, color?: string) => {
    const result = api.createCategory(name, color);
    bus.emit('knowledge-base:result', { action: 'createCategory', result });
  });

  bus.on('knowledge-base:deleteCategory', (categoryId: string) => {
    const result = api.deleteCategory(categoryId);
    bus.emit('knowledge-base:result', { action: 'deleteCategory', result });
  });

  bus.on('knowledge-base:getTags', () => {
    const tags = api.getTags();
    bus.emit('knowledge-base:result', { action: 'getTags', result: tags });
  });

  bus.on('knowledge-base:createTag', (name: string) => {
    const result = api.createTag(name);
    bus.emit('knowledge-base:result', { action: 'createTag', result });
  });

  bus.on('knowledge-base:deleteTag', (tagId: string) => {
    const result = api.deleteTag(tagId);
    bus.emit('knowledge-base:result', { action: 'deleteTag', result });
  });
}

export function deactivate(): void {
  console.log('[knowledge-base] 插件已停用');
}

function initializeDatabase(): void {
  try {
    const db = getDatabase();

    // 创建分类表
    db.run(`
      CREATE TABLE IF NOT EXISTS kb_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#999999',
        created_at TEXT NOT NULL
      )
    `);

    // 创建标签表
    db.run(`
      CREATE TABLE IF NOT EXISTS kb_tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // 创建笔记表
    db.run(`
      CREATE TABLE IF NOT EXISTS kb_notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(category_id) REFERENCES kb_categories(id)
      )
    `);

    // 创建笔记-标签关联表
    db.run(`
      CREATE TABLE IF NOT EXISTS kb_note_tags (
        note_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY(note_id, tag_id),
        FOREIGN KEY(note_id) REFERENCES kb_notes(id),
        FOREIGN KEY(tag_id) REFERENCES kb_tags(id)
      )
    `);

    autoSave();
    console.log('[knowledge-base] 数据库初始化完成');
  } catch (err) {
    console.error('[knowledge-base] 数据库初始化失败:', err);
  }
}

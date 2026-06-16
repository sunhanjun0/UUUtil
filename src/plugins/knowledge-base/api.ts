/**
 * knowledge-base 插件 —— 对外 API
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, autoSave } from '../../core/db';
import type { KnowledgeBaseApi, KnowledgeNote, KnowledgeCategory, KnowledgeTag, KnowledgeSearchResult } from '../../shared/types';

export const api: KnowledgeBaseApi = {
  createNote(title: string, content: string, categoryId: string, tagIds: string[]): { success: boolean; noteId?: string; error?: string } {
    try {
      const db = getDatabase();
      const noteId = uuidv4();
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO kb_notes (id, title, content, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [noteId, title, content, categoryId, now, now]
      );

      for (const tagId of tagIds) {
        db.run(
          `INSERT INTO kb_note_tags (note_id, tag_id) VALUES (?, ?)`,
          [noteId, tagId]
        );
      }

      autoSave();
      return { success: true, noteId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  updateNote(noteId: string, title: string, content: string, categoryId: string, tagIds: string[]): { success: boolean; error?: string } {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();

      db.run(
        `UPDATE kb_notes SET title = ?, content = ?, category_id = ?, updated_at = ? WHERE id = ?`,
        [title, content, categoryId, now, noteId]
      );

      db.run(`DELETE FROM kb_note_tags WHERE note_id = ?`, [noteId]);

      for (const tagId of tagIds) {
        db.run(
          `INSERT INTO kb_note_tags (note_id, tag_id) VALUES (?, ?)`,
          [noteId, tagId]
        );
      }

      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  deleteNote(noteId: string): { success: boolean; error?: string } {
    try {
      const db = getDatabase();
      db.run(`DELETE FROM kb_note_tags WHERE note_id = ?`, [noteId]);
      db.run(`DELETE FROM kb_notes WHERE id = ?`, [noteId]);
      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getNotes(categoryId?: string, tagId?: string): KnowledgeNote[] {
    try {
      const db = getDatabase();
      let query = `SELECT n.id, n.title, n.content, n.category_id, n.created_at, n.updated_at FROM kb_notes n`;

      if (categoryId) {
        query += ` WHERE n.category_id = '${categoryId}'`;
      }

      if (tagId) {
        query += categoryId ? ` AND` : ` WHERE`;
        query += ` n.id IN (SELECT note_id FROM kb_note_tags WHERE tag_id = '${tagId}')`;
      }

      query += ` ORDER BY n.updated_at DESC`;

      const result = db.exec(query);

      if (result.length === 0) return [];

      const rows = result[0].values;
      return rows.map((row: any) => {
        const tagsResult = db.exec(
          `SELECT tag_id FROM kb_note_tags WHERE note_id = '${row[0]}'`
        );
        const tagIds = tagsResult.length > 0 ? tagsResult[0].values.map((t: any) => t[0]) : [];

        return {
          id: row[0],
          title: row[1],
          content: row[2],
          categoryId: row[3],
          tagIds,
          createdAt: row[4],
          updatedAt: row[5],
        } as KnowledgeNote;
      });
    } catch (err) {
      console.error('[knowledge-base] getNotes 错误:', err);
      return [];
    }
  },

  searchNotes(keyword: string): KnowledgeSearchResult {
    try {
      const db = getDatabase();
      const searchPattern = `%${keyword}%`;
      const result = db.exec(
        `SELECT id, title, content, category_id, created_at, updated_at FROM kb_notes
         WHERE title LIKE '${keyword}%' OR content LIKE '%${keyword}%' ORDER BY updated_at DESC`
      );

      if (result.length === 0) return { notes: [], total: 0 };

      const rows = result[0].values;
      const notes = rows.map((row: any) => {
        const tags = db.exec(
          `SELECT tag_id FROM kb_note_tags WHERE note_id = '${row[0]}'`
        );
        const tagIds = tags.length > 0 ? tags[0].values.map((t: any) => t[0]) : [];

        return {
          id: row[0],
          title: row[1],
          content: row[2],
          categoryId: row[3],
          tagIds,
          createdAt: row[4],
          updatedAt: row[5],
        } as KnowledgeNote;
      });

      return { notes, total: notes.length };
    } catch (err) {
      console.error('[knowledge-base] searchNotes 错误:', err);
      return { notes: [], total: 0 };
    }
  },

  createCategory(name: string, color?: string): { success: boolean; categoryId?: string; error?: string } {
    try {
      const db = getDatabase();
      const categoryId = uuidv4();
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO kb_categories (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
        [categoryId, name, color || '#999999', now]
      );

      autoSave();
      return { success: true, categoryId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getCategories(): KnowledgeCategory[] {
    try {
      const db = getDatabase();
      const result = db.exec(`SELECT id, name, color, created_at FROM kb_categories ORDER BY created_at`);

      if (result.length === 0) return [];

      return result[0].values.map((row: any) => ({
        id: row[0],
        name: row[1],
        color: row[2],
        createdAt: row[3],
      })) as KnowledgeCategory[];
    } catch (err) {
      console.error('[knowledge-base] getCategories 错误:', err);
      return [];
    }
  },

  deleteCategory(categoryId: string): { success: boolean; error?: string } {
    try {
      const db = getDatabase();
      db.run(`DELETE FROM kb_categories WHERE id = ?`, [categoryId]);
      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  createTag(name: string): { success: boolean; tagId?: string; error?: string } {
    try {
      const db = getDatabase();
      const tagId = uuidv4();
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO kb_tags (id, name, created_at) VALUES (?, ?, ?)`,
        [tagId, name, now]
      );

      autoSave();
      return { success: true, tagId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getTags(): KnowledgeTag[] {
    try {
      const db = getDatabase();
      const result = db.exec(`SELECT id, name, created_at FROM kb_tags ORDER BY created_at`);

      if (result.length === 0) return [];

      return result[0].values.map((row: any) => ({
        id: row[0],
        name: row[1],
        createdAt: row[2],
      })) as KnowledgeTag[];
    } catch (err) {
      console.error('[knowledge-base] getTags 错误:', err);
      return [];
    }
  },

  deleteTag(tagId: string): { success: boolean; error?: string } {
    try {
      const db = getDatabase();
      db.run(`DELETE FROM kb_note_tags WHERE tag_id = ?`, [tagId]);
      db.run(`DELETE FROM kb_tags WHERE id = ?`, [tagId]);
      autoSave();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

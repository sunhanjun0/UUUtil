/**
 * knowledge-base 插件 —— 对外 API
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, autoSave } from '../../core/db';
import type { KnowledgeBaseApi, KnowledgeNote, KnowledgeCategory, KnowledgeTag, KnowledgeSearchResult } from '../../shared/types';

function runInTransaction<T>(operation: () => T): T {
  const db = getDatabase();
  db.run('BEGIN');
  try {
    const result = operation();
    db.run('COMMIT');
    autoSave();
    return result;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

function selectRows(sql: string, params: any[] = []): any[][] {
  const db = getDatabase();
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const rows: any[][] = [];
    while (statement.step()) {
      rows.push(statement.get());
    }
    return rows;
  } finally {
    statement.free();
  }
}

function getTagIds(noteId: string): string[] {
  return selectRows(`SELECT tag_id FROM kb_note_tags WHERE note_id = ?`, [noteId]).map((row) => row[0]);
}

function mapNoteRow(row: any[]): KnowledgeNote {
  return {
    id: row[0],
    title: row[1],
    content: row[2],
    categoryId: row[3],
    tagIds: getTagIds(row[0]),
    createdAt: row[4],
    updatedAt: row[5],
  };
}

export const api: KnowledgeBaseApi = {
  createNote(title: string, content: string, categoryId: string, tagIds: string[]): { success: boolean; noteId?: string; error?: string } {
    try {
      const noteId = uuidv4();
      const now = new Date().toISOString();

      runInTransaction(() => {
        const db = getDatabase();
        db.run(
          `INSERT INTO kb_notes (id, title, content, category_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [noteId, title, content, categoryId || null, now, now]
        );

        for (const tagId of tagIds) {
          db.run(
            `INSERT INTO kb_note_tags (note_id, tag_id) VALUES (?, ?)`,
            [noteId, tagId]
          );
        }
      });

      return { success: true, noteId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  updateNote(noteId: string, title: string, content: string, categoryId: string, tagIds: string[]): { success: boolean; error?: string } {
    try {
      runInTransaction(() => {
        const db = getDatabase();
        const now = new Date().toISOString();

        db.run(
          `UPDATE kb_notes SET title = ?, content = ?, category_id = ?, updated_at = ? WHERE id = ?`,
          [title, content, categoryId || null, now, noteId]
        );

        db.run(`DELETE FROM kb_note_tags WHERE note_id = ?`, [noteId]);

        for (const tagId of tagIds) {
          db.run(
            `INSERT INTO kb_note_tags (note_id, tag_id) VALUES (?, ?)`,
            [noteId, tagId]
          );
        }
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  deleteNote(noteId: string): { success: boolean; error?: string } {
    try {
      runInTransaction(() => {
        const db = getDatabase();
        db.run(`DELETE FROM kb_note_tags WHERE note_id = ?`, [noteId]);
        db.run(`DELETE FROM kb_notes WHERE id = ?`, [noteId]);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getNotes(categoryId?: string, tagId?: string): KnowledgeNote[] {
    try {
      const conditions: string[] = [];
      const params: any[] = [];

      if (categoryId) {
        conditions.push(`n.category_id = ?`);
        params.push(categoryId);
      }

      if (tagId) {
        conditions.push(`n.id IN (SELECT note_id FROM kb_note_tags WHERE tag_id = ?)`);
        params.push(tagId);
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      const rows = selectRows(
        `SELECT n.id, n.title, n.content, n.category_id, n.created_at, n.updated_at FROM kb_notes n${whereClause} ORDER BY n.updated_at DESC`,
        params
      );

      return rows.map(mapNoteRow);
    } catch (err) {
      console.error('[knowledge-base] getNotes 错误:', err);
      return [];
    }
  },

  searchNotes(keyword: string): KnowledgeSearchResult {
    try {
      const searchPattern = `%${keyword}%`;
      const rows = selectRows(
        `SELECT id, title, content, category_id, created_at, updated_at FROM kb_notes
         WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC`,
        [searchPattern, searchPattern]
      );
      const notes = rows.map(mapNoteRow);
      return { notes, total: notes.length };
    } catch (err) {
      console.error('[knowledge-base] searchNotes 错误:', err);
      return { notes: [], total: 0 };
    }
  },

  createCategory(name: string, color?: string): { success: boolean; categoryId?: string; error?: string } {
    try {
      const categoryId = uuidv4();
      const now = new Date().toISOString();

      runInTransaction(() => {
        const db = getDatabase();
        db.run(
          `INSERT INTO kb_categories (id, name, color, created_at) VALUES (?, ?, ?, ?)`,
          [categoryId, name, color || '#999999', now]
        );
      });

      return { success: true, categoryId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getCategories(): KnowledgeCategory[] {
    try {
      return selectRows(`SELECT id, name, color, created_at FROM kb_categories ORDER BY created_at`).map((row) => ({
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
      runInTransaction(() => {
        const db = getDatabase();
        db.run(`UPDATE kb_notes SET category_id = NULL WHERE category_id = ?`, [categoryId]);
        db.run(`DELETE FROM kb_categories WHERE id = ?`, [categoryId]);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  createTag(name: string): { success: boolean; tagId?: string; error?: string } {
    try {
      const tagId = uuidv4();
      const now = new Date().toISOString();

      runInTransaction(() => {
        const db = getDatabase();
        db.run(
          `INSERT INTO kb_tags (id, name, created_at) VALUES (?, ?, ?)`,
          [tagId, name, now]
        );
      });

      return { success: true, tagId };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  getTags(): KnowledgeTag[] {
    try {
      return selectRows(`SELECT id, name, created_at FROM kb_tags ORDER BY created_at`).map((row) => ({
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
      runInTransaction(() => {
        const db = getDatabase();
        db.run(`DELETE FROM kb_note_tags WHERE tag_id = ?`, [tagId]);
        db.run(`DELETE FROM kb_tags WHERE id = ?`, [tagId]);
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

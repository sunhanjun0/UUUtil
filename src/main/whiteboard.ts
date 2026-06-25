/**
 * 白板 —— 状态持久化与附件管理（图片生成缩略图）。
 */

import fs from 'fs';
import path from 'path';
import { app, nativeImage, shell } from 'electron';
import { getDatabase, autoSave } from '../core';

export interface WhiteboardAttachmentInput {
  name: string;
  mime: string;
  dataUrl: string;
}

const DATA_URL_PATTERN = /^data:([^;,]+)?(;base64)?,(.*)$/;

function getAttachmentsDir(): string {
  const dir = path.join(app.getPath('userData'), 'attachments', 'whiteboard');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
  };
  return map[mime] || '';
}

function safeAttachmentName(name: string, mime: string): string {
  const parsed = path.parse(name || 'attachment');
  const base = parsed.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'attachment';
  const ext = (parsed.ext || extensionFromMime(mime)).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16);
  return `${base}${ext}`;
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = dataUrl.match(DATA_URL_PATTERN);
  if (!match) throw new Error('无效的附件数据');

  const mime = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const data = match[3] || '';
  return {
    mime,
    buffer: isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8'),
  };
}

export function getWhiteboardState(): string | null {
  const db = getDatabase();
  const statement = db.prepare(`SELECT value FROM whiteboard_state WHERE key = ?`);
  try {
    statement.bind(['default']);
    if (statement.step()) return statement.get()[0] as string;
    return null;
  } finally {
    statement.free();
  }
}

export function saveWhiteboardState(state: string): { success: true } {
  const db = getDatabase();
  db.run(
    `INSERT INTO whiteboard_state (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ['default', state],
  );
  autoSave();
  return { success: true };
}

export function saveWhiteboardAttachment(input: WhiteboardAttachmentInput) {
  try {
    const parsed = parseDataUrl(input.dataUrl);
    const mime = input.mime && input.mime !== 'application/octet-stream' ? input.mime : parsed.mime;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const filename = `${id}-${safeAttachmentName(input.name, mime)}`;
    const filePath = path.join(getAttachmentsDir(), filename);
    fs.writeFileSync(filePath, parsed.buffer);

    let thumbnailFilename: string | undefined;
    if (mime.startsWith('image/')) {
      const image = nativeImage.createFromBuffer(parsed.buffer);
      if (!image.isEmpty()) {
        thumbnailFilename = `${id}-thumb.png`;
        fs.writeFileSync(path.join(getAttachmentsDir(), thumbnailFilename), image.resize({ width: 75, height: 75 }).toPNG());
      }
    }

    return {
      success: true,
      id,
      name: input.name,
      mime,
      size: parsed.buffer.length,
      filename,
      thumbnailFilename,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '附件保存失败',
    };
  }
}

export function getWhiteboardAttachment(filename: string, mime?: string): string | null {
  const safeName = path.basename(filename);
  const filePath = path.join(getAttachmentsDir(), safeName);
  if (!fs.existsSync(filePath)) return null;

  const buffer = fs.readFileSync(filePath);
  return `data:${mime || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
}

export async function openWhiteboardAttachmentsDir(): Promise<{ success: true }> {
  await shell.openPath(getAttachmentsDir());
  return { success: true };
}

export async function openWhiteboardAttachment(filename: string) {
  const safeName = path.basename(filename);
  const filePath = path.join(getAttachmentsDir(), safeName);
  if (!fs.existsSync(filePath)) return { success: false, error: '附件文件不存在' };

  const error = await shell.openPath(filePath);
  return error ? { success: false, error } : { success: true };
}

export function showWhiteboardAttachmentInFolder(filename: string) {
  const safeName = path.basename(filename);
  const filePath = path.join(getAttachmentsDir(), safeName);
  if (!fs.existsSync(filePath)) return { success: false, error: '附件文件不存在' };

  shell.showItemInFolder(filePath);
  return { success: true };
}

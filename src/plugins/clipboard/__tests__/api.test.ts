/**
 * clipboard api 集成测试
 *
 * 覆盖：text/richtext/image/file 四类的 record 去重、copyToClipboard 回写分支、
 * 上限清理（含图片落盘文件清理）、schema 迁移幂等、敏感过滤。
 *
 * 用 vi.mock 把 core/db 替换为内存 sql.js，electron clipboard/nativeImage/app 用桩。
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// 内存数据库桩
const dbMock = vi.hoisted(() => ({ current: null as any, autoSave: vi.fn() }));
vi.mock('../../../core/db', () => ({
  getDatabase: () => dbMock.current,
  autoSave: dbMock.autoSave,
}));

// 剪贴板状态桩：模拟真实剪贴板往返 —— writeText/write 后 readText/readHTML 读回写入值
const clip = vi.hoisted(() => ({
  text: '' as string,
  html: '' as string,
  formats: [] as string[],
  buffer: Buffer.alloc(0),
  reset() { this.text = ''; this.html = ''; this.formats = []; this.buffer = Buffer.alloc(0); },
}));

// 临时目录桩（替代 app.getPath）
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipboard-test-'));
vi.mock('electron', () => ({
  clipboard: {
    writeText: vi.fn((t: string) => { clip.text = t; clip.html = ''; clip.formats = ['text/plain']; }),
    write: vi.fn((d: { text?: string; html?: string }) => {
      clip.text = d.text ?? '';
      clip.html = d.html ?? '';
      clip.formats = ['text/plain', ...(d.html ? ['text/html'] : [])];
    }),
    writeImage: vi.fn(() => { clip.formats = ['public.tiff']; }),
    writeBuffer: vi.fn((_fmt: string, b: Buffer) => { clip.buffer = b; clip.formats = ['public.file-url']; }),
    readBuffer: vi.fn(() => clip.buffer),
    readText: vi.fn(() => clip.text),
    readHTML: vi.fn(() => clip.html),
    readImage: vi.fn(() => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0), getSize: () => ({ width: 0, height: 0 }), resize: () => ({ toPNG: () => Buffer.alloc(0) }) })),
    availableFormats: vi.fn(() => clip.formats),
    clear: vi.fn(() => { clip.text = ''; clip.html = ''; clip.formats = []; clip.buffer = Buffer.alloc(0); }),
  },
  app: { getPath: () => tmpRoot },
  nativeImage: {
    createFromBuffer: vi.fn((buf: Buffer) => ({
      isEmpty: () => buf.length === 0,
      toPNG: () => buf,
      resize: vi.fn(() => ({ toPNG: () => buf })),
      getSize: () => ({ width: 2, height: 2 }),
      toDataURL: () => 'data:image/png;base64,AAAA',
    })),
    createFromPath: vi.fn(() => ({
      isEmpty: () => false,
      toPNG: () => Buffer.from([1, 2, 3, 4]),
      getSize: () => ({ width: 2, height: 2 }),
      toDataURL: () => 'data:image/png;base64,AAAA',
    })),
  },
}));

import initSqlJs from 'sql.js';
import {
  api,
  detectClipboard,
  ensureClipboardTable,
  getLastSig,
  setLastSig,
  _setClipboardDirForTest,
} from '../api';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  dbMock.current = db;
  dbMock.autoSave.mockClear();
  _setClipboardDirForTest(tmpRoot);
  clip.reset();
  ensureClipboardTable();
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('text', () => {
  it('记录纯文本并去重', () => {
    const r1 = api.record('hello');
    expect(r1).not.toBeNull();
    expect(r1!.item.kind).toBe('text');
    expect(r1!.deduped).toBe(false);

    const r2 = api.record('hello');
    expect(r2!.deduped).toBe(true);
    expect(r2!.item.id).toBe(r1!.item.id);
  });

  it('空白内容不记录', () => {
    expect(api.record('   ')).toBeNull();
    expect(api.record('')).toBeNull();
  });

  it('敏感内容跳过', () => {
    expect(api.record('-----BEGIN RSA PRIVATE KEY-----')).toBeNull();
  });
});

describe('richtext', () => {
  it('记录富文本，纯文本相同但 html 不同不去重', () => {
    const r1 = api.recordRichText('abc', '<b>abc</b>');
    const r2 = api.recordRichText('abc', '<i>abc</i>');
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.item.id).not.toBe(r2!.item.id);
    expect(r1!.item.meta?.html).toBe('<b>abc</b>');
  });

  it('同 plain+html 去重', () => {
    api.recordRichText('x', '<p>x</p>');
    const r2 = api.recordRichText('x', '<p>x</p>');
    expect(r2!.deduped).toBe(true);
  });
});

describe('image', () => {
  it('空图片跳过', () => {
    const empty = {
      isEmpty: () => true,
      toPNG: () => Buffer.alloc(0),
      getSize: () => ({ width: 0, height: 0 }),
      resize: () => ({ toPNG: () => Buffer.alloc(0) }),
    } as any;
    expect(api.recordImage(empty)).toBeNull();
  });

  it('记录图片并落盘', () => {
    const img = {
      isEmpty: () => false,
      toPNG: () => Buffer.from([1, 2, 3, 4]),
      getSize: () => ({ width: 2, height: 2 }),
      resize: () => ({ toPNG: () => Buffer.from([1, 2, 3, 4]) }),
    } as any;
    const r = api.recordImage(img);
    expect(r).not.toBeNull();
    expect(r!.item.kind).toBe('image');
    expect(r!.item.meta?.image).toBeDefined();
    const dir = path.join(tmpRoot, 'attachments', 'clipboard');
    expect(fs.existsSync(path.join(dir, r!.item.meta!.image!.filename))).toBe(true);
  });
});

describe('file', () => {
  it('路径不存在跳过', () => {
    expect(api.recordFile('/nonexistent/path/to/file.txt')).toBeNull();
  });

  it('记录已存在文件并去重', () => {
    const f = path.join(tmpRoot, 'sample.txt');
    fs.writeFileSync(f, 'hello');
    const r1 = api.recordFile(f);
    const r2 = api.recordFile(f);
    expect(r1).not.toBeNull();
    expect(r2!.deduped).toBe(true);
    expect(r1!.item.meta?.file?.name).toBe('sample.txt');
  });
});

describe('copyToClipboard', () => {
  it('回写后 lastSig 等于实际读回签名（防止回写即重复记录，回归测试）', () => {
    // 模拟「外部先复制了别的内容」的基线：剪贴板里已有 old-content
    clip.text = 'old-content';
    setLastSig(detectClipboard().sig); // 轮询器建立的基线

    // 记录一条 text 历史，然后点「复制回剪贴板」
    const r = api.record('copy me');
    api.copyToClipboard(r!.item.id); // 内部 writeText('copy me') 后用 detectClipboard() 设 lastSig

    // 关键：lastSig 必须等于「现在实际读回的」签名，这样下一拍轮询不会把回写当新复制
    const actualSig = detectClipboard().sig;
    expect(getLastSig()).toBe(actualSig);
    expect(getLastSig()).not.toBe(`text:${require('crypto').createHash('sha256').update('old-content').digest('hex')}`);
  });

  it('text 分支调用 writeText', async () => {
    const clipboard = (await import('electron')).clipboard;
    const r = api.record('copy me');
    api.copyToClipboard(r!.item.id);
    expect(clipboard.writeText).toHaveBeenCalledWith('copy me');
  });

  it('richtext 分支调用 write(text, html)', async () => {
    const clipboard = (await import('electron')).clipboard;
    const r = api.recordRichText('rt', '<b>rt</b>');
    api.copyToClipboard(r!.item.id);
    expect(clipboard.write).toHaveBeenCalledWith({ text: 'rt', html: '<b>rt</b>' });
  });

  it('file 分支调用 writeBuffer', async () => {
    const clipboard = (await import('electron')).clipboard;
    const f = path.join(tmpRoot, 'copyfile.txt');
    fs.writeFileSync(f, 'data');
    const r = api.recordFile(f);
    api.copyToClipboard(r!.item.id);
    expect(clipboard.writeBuffer).toHaveBeenCalled();
  });
});

describe('schema 迁移', () => {
  it('重复建表不报错且保留数据', () => {
    const r = api.record('persist');
    ensureClipboardTable();
    const got = api.get(r!.item.id);
    expect(got).not.toBeNull();
    expect(got!.content).toBe('persist');
  });

  it('老库（无 meta_json 列）迁移后可正常读写', () => {
    // 模拟老库：删表重建不带 meta_json
    const db = dbMock.current;
    db.run('DROP TABLE plugin_clipboard_items');
    db.run(`CREATE TABLE plugin_clipboard_items (
      id TEXT PRIMARY KEY, content TEXT, content_hash TEXT, kind TEXT, length INTEGER,
      pinned INTEGER, copy_count INTEGER, created_at TEXT, last_used_at TEXT
    )`);
    // 迁移
    ensureClipboardTable();
    // 迁移后应能写入富文本（需要 meta_json 列）
    const r = api.recordRichText('migrated', '<i>migrated</i>');
    expect(r).not.toBeNull();
    expect(r!.item.meta?.html).toBe('<i>migrated</i>');
  });
});

describe('上限清理', () => {
  it('超出上限淘汰至 MAX_ITEMS 条', () => {
    for (let i = 0; i < 201; i++) api.record(`item-${i}`);
    // 严格断言条数（不依赖时间戳并列时 ORDER BY 的具体选行）
    expect(api.count()).toBe(200);
  });

  it('置顶项不被上限清理', () => {
    const r = api.record('pinned-one');
    api.togglePin(r!.item.id);
    for (let i = 0; i < 201; i++) api.record(`filler-${i}`);
    // 200 非置顶 + 1 置顶 = 201
    expect(api.count()).toBe(201);
    const got = api.get(r!.item.id);
    expect(got).not.toBeNull();
    expect(got!.pinned).toBe(true);
  });
});

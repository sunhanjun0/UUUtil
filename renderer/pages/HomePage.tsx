import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Heading, Input, Text, Textarea, Tooltip, useToast } from '@chakra-ui/react';
import { ArrowUpRight, Circle, Eraser, FileText, FolderOpen, Minus, MousePointer2, Palette, Pencil, Plus, Square, StickyNote, Strikethrough, Trash2, Type as TypeIcon, Underline, Upload } from 'lucide-react';

const STORAGE_KEY = 'uuutil:whiteboard-items';
const noteColors = ['#fff7cc', '#e6f4ff', '#eaffea', '#fff0f6', '#f3e8ff'];
const textColors = [
  { value: 'gray.800', swatch: '#2d3748' },
  { value: 'red.500', swatch: '#e53e3e' },
  { value: 'blue.600', swatch: '#3182ce' },
  { value: 'green.600', swatch: '#38a169' },
  { value: 'purple.600', swatch: '#805ad5' },
];

interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

type BoardItem = Timestamped & (
  | { id: string; type: 'note'; x: number; y: number; width: number; height: number; title?: string; text: string; color: string; textColor?: string; fontSize?: number; bold?: boolean; underline?: boolean; strike?: boolean }
  | { id: string; type: 'text'; x: number; y: number; width: number; height: number; text: string; fontSize?: number; bold?: boolean; underline?: boolean; strike?: boolean; color?: string }
  | { id: string; type: 'image'; x: number; y: number; width: number; height: number; originalWidth: number; originalHeight: number; thumbnailWidth: number; thumbnailHeight: number; imageMode: 'thumbnail' | 'original'; name: string; mime: string; size: number; attachmentId: string; filename: string; thumbnailFilename?: string; dataUrl?: string }
  | { id: string; type: 'file'; x: number; y: number; width: number; height: number; name: string; mime: string; size: number; attachmentId: string; filename: string; dataUrl?: string }
);

type DrawTool = 'line' | 'arrow' | 'rect' | 'ellipse' | 'freehand';

type BoardShape = Timestamped & {
  id: string;
  type: DrawTool;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  fill?: string;
  points?: { x: number; y: number }[];
  curve?: { x: number; y: number };
};

interface Board extends Timestamped {
  id: string;
  name: string;
  items: BoardItem[];
  shapes: BoardShape[];
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function timestamps(time = nowIso()): Timestamped {
  return { createdAt: time, updatedAt: time };
}

function touchItem<T extends Timestamped>(item: T, time = nowIso()): T {
  return { ...item, updatedAt: time };
}

function createBoard(index = 1): Board {
  return { id: makeId(), name: `画布 ${index}`, items: [], shapes: [], ...timestamps() };
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function getItemTooltip(item: BoardItem): string {
  const timeInfo = `创建时间：${formatTimestamp(item.createdAt)}\n修改时间：${formatTimestamp(item.updatedAt)}`;
  if (item.type === 'text') return timeInfo;
  if (item.type === 'note') return `名称：${item.title || '便签'}\n${timeInfo}`;
  if (item.type === 'image') return `名称：${item.name}\n类型：${item.mime}\n大小：${formatSize(item.size)}\n${timeInfo}`;
  return `名称：${item.name}\n类型：${item.mime}\n大小：${formatSize(item.size)}\n${timeInfo}`;
}

function getFileExt(name: string): string {
  const ext = name.split('.').pop();
  if (!ext || ext === name) return 'FILE';
  return ext.slice(0, 4).toUpperCase();
}

function getFileBaseName(name: string): string {
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return name;
  return name.slice(0, lastDot);
}

function getFileTone(mime: string, name: string): { bg: string; icon: string; badgeBg: string; badgeColor: string; shadow: string } {
  const ext = getFileExt(name).toLowerCase();
  if (mime.includes('pdf') || ext === 'pdf') return { bg: 'red.50', icon: '#C53030', badgeBg: 'red.100', badgeColor: 'red.700', shadow: 'rgba(197, 48, 48, 0.18)' };
  if (mime.includes('zip') || ['zip', 'rar', '7z', 'gz'].includes(ext)) return { bg: 'orange.50', icon: '#C05621', badgeBg: 'orange.100', badgeColor: 'orange.700', shadow: 'rgba(192, 86, 33, 0.18)' };
  if (mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext)) return { bg: 'green.50', icon: '#2F855A', badgeBg: 'green.100', badgeColor: 'green.700', shadow: 'rgba(47, 133, 90, 0.18)' };
  if (mime.includes('presentation') || ['ppt', 'pptx'].includes(ext)) return { bg: 'orange.50', icon: '#DD6B20', badgeBg: 'orange.100', badgeColor: 'orange.700', shadow: 'rgba(221, 107, 32, 0.18)' };
  if (mime.includes('word') || ['doc', 'docx'].includes(ext)) return { bg: 'blue.50', icon: '#2B6CB0', badgeBg: 'blue.100', badgeColor: 'blue.700', shadow: 'rgba(43, 108, 176, 0.18)' };
  if (mime.startsWith('text/') || ['txt', 'md', 'json', 'xml', 'log'].includes(ext)) return { bg: 'gray.50', icon: '#4A5568', badgeBg: 'gray.100', badgeColor: 'gray.700', shadow: 'rgba(74, 85, 104, 0.16)' };
  return { bg: 'purple.50', icon: '#6B46C1', badgeBg: 'purple.100', badgeColor: 'purple.700', shadow: 'rgba(107, 70, 193, 0.18)' };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getDataUrlMime(dataUrl: string): string {
  return dataUrl.match(/^data:([^;,]+)?/)?.[1] || 'application/octet-stream';
}

function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const maxWidth = 360;
      const maxHeight = 280;
      const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
      resolve({
        width: Math.max(80, Math.round(image.naturalWidth * scale)),
        height: Math.max(60, Math.round(image.naturalHeight * scale)),
      });
    };
    image.onerror = () => resolve({ width: 260, height: 180 });
    image.src = dataUrl;
  });
}

function getShapePoints(shape: BoardShape): string {
  return (shape.points || []).map((point) => `${point.x},${point.y}`).join(' ');
}

function getCurvePoint(shape: BoardShape): { x: number; y: number } {
  if (shape.curve) return shape.curve;
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

function getCurvePath(shape: BoardShape): string {
  const curve = getCurvePoint(shape);
  return `M ${shape.x} ${shape.y} Q ${curve.x} ${curve.y} ${shape.x + shape.width} ${shape.y + shape.height}`;
}

function getAutoCurvePoint(points: { x: number; y: number }[]): { x: number; y: number } | undefined {
  if (points.length < 3) return undefined;
  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 16) return { x: start.x + dx / 2, y: start.y + dy / 2 };

  let candidate = points[Math.floor(points.length / 2)];
  let candidateT = 0.5;
  let maxDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const t = Math.max(0.05, Math.min(0.95, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
    const projection = { x: start.x + dx * t, y: start.y + dy * t };
    const distance = Math.hypot(point.x - projection.x, point.y - projection.y);
    if (distance > maxDistance) {
      maxDistance = distance;
      candidate = point;
      candidateT = t;
    }
  }

  if (maxDistance < 8) return { x: start.x + dx / 2, y: start.y + dy / 2 };
  const oneMinusT = 1 - candidateT;
  const denominator = 2 * oneMinusT * candidateT;
  const rawCurve = {
    x: (candidate.x - oneMinusT * oneMinusT * start.x - candidateT * candidateT * end.x) / denominator,
    y: (candidate.y - oneMinusT * oneMinusT * start.y - candidateT * candidateT * end.y) / denominator,
  };
  const midpoint = { x: start.x + dx / 2, y: start.y + dy / 2 };
  const damping = 0.62;
  const offset = { x: (rawCurve.x - midpoint.x) * damping, y: (rawCurve.y - midpoint.y) * damping };
  const maxOffset = Math.max(24, Math.sqrt(lenSq) * 0.55);
  const offsetLength = Math.hypot(offset.x, offset.y);
  const scale = offsetLength > maxOffset ? maxOffset / offsetLength : 1;
  return {
    x: midpoint.x + offset.x * scale,
    y: midpoint.y + offset.y * scale,
  };
}

function getShapeBounds(shape: BoardShape): { x: number; y: number; width: number; height: number } {
  if (shape.type === 'line' || shape.type === 'arrow') {
    const curve = getCurvePoint(shape);
    const xs = [shape.x, shape.x + shape.width, curve.x];
    const ys = [shape.y, shape.y + shape.height, curve.y];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
  }
  if (shape.points?.length) {
    const xs = shape.points.map((point) => point.x);
    const ys = shape.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
  }
  return {
    x: Math.min(shape.x, shape.x + shape.width),
    y: Math.min(shape.y, shape.y + shape.height),
    width: Math.max(Math.abs(shape.width), 1),
    height: Math.max(Math.abs(shape.height), 1),
  };
}

function rectsIntersect(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function isAttachmentItem(item: BoardItem): item is Extract<BoardItem, { type: 'image' | 'file' }> {
  return item.type === 'image' || item.type === 'file';
}

function getAttachmentSource(item: Extract<BoardItem, { type: 'image' | 'file' }>, cache: Record<string, string>): string {
  const filename = item.type === 'image' && item.imageMode === 'thumbnail' && item.thumbnailFilename
    ? item.thumbnailFilename
    : item.filename;
  return filename ? cache[filename] || item.dataUrl || '' : item.dataUrl || '';
}

function getAttachmentFilenames(item: Extract<BoardItem, { type: 'image' | 'file' }>): string[] {
  return item.type === 'image' && item.thumbnailFilename ? [item.filename, item.thumbnailFilename] : [item.filename];
}

function normalizeImageItem(item: BoardItem): BoardItem {
  if (item.type !== 'image') return item;
  return {
    ...item,
    originalWidth: item.originalWidth || item.width,
    originalHeight: item.originalHeight || item.height,
    thumbnailWidth: item.thumbnailWidth || 75,
    thumbnailHeight: item.thumbnailHeight || 75,
    imageMode: item.imageMode || 'original',
  };
}

function normalizeBoardItem(item: BoardItem): BoardItem {
  const fallbackTime = item.createdAt || item.updatedAt || nowIso();
  return normalizeImageItem({
    ...item,
    createdAt: item.createdAt || fallbackTime,
    updatedAt: item.updatedAt || fallbackTime,
  });
}

function normalizeShape(shape: BoardShape): BoardShape {
  const fallbackTime = shape.createdAt || shape.updatedAt || nowIso();
  return {
    ...shape,
    createdAt: shape.createdAt || fallbackTime,
    updatedAt: shape.updatedAt || fallbackTime,
    stroke: shape.stroke || '#2563eb',
    strokeWidth: shape.strokeWidth || 2,
  };
}

function normalizeBoard(board: Board, index = 1): Board {
  const fallbackTime = board.createdAt || board.updatedAt || nowIso();
  return {
    ...board,
    name: board.name || `画布 ${index}`,
    createdAt: board.createdAt || fallbackTime,
    updatedAt: board.updatedAt || fallbackTime,
    items: (board.items || []).map(normalizeBoardItem),
    shapes: (board.shapes || []).map(normalizeShape),
  };
}

async function migrateLegacyAttachments(boards: Board[]): Promise<Board[]> {
  const migratedBoards = await Promise.all(boards.map(async (board) => {
    const migratedItems = await Promise.all(board.items.map(async (item) => {
      if (!isAttachmentItem(item) || item.filename || !item.dataUrl) return normalizeImageItem(item);

      const attachment = await window.assistant.saveWhiteboardAttachment({
        name: item.name,
        mime: item.mime || getDataUrlMime(item.dataUrl),
        dataUrl: item.dataUrl,
      });
      if (!attachment.success) return normalizeBoardItem(item);

      const { dataUrl: _dataUrl, ...rest } = item;
      return {
        ...rest,
        mime: attachment.mime,
        size: attachment.size,
        attachmentId: attachment.id,
        filename: attachment.filename,
        ...(rest.type === 'image' ? {
          originalWidth: rest.width,
          originalHeight: rest.height,
          thumbnailWidth: 75,
          thumbnailHeight: 75,
          imageMode: 'original' as const,
          thumbnailFilename: attachment.thumbnailFilename,
        } : {}),
      } as BoardItem;
    }));
    return normalizeBoard({ ...board, items: migratedItems });
  }));
  return migratedBoards;
}

function getTextBoxSize(text: string, fontSize = 13) {
  if (!text.trim()) return { width: 220, height: 80 };

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const longestLineLength = Math.max(...lines.map((line) => line.length));
  const width = Math.max(120, Math.min(520, longestLineLength * fontSize * 0.62 + 18));
  const height = Math.max(36, Math.min(360, lines.length * fontSize * 1.45 + 14));

  return { width, height };
}

export default function HomePage() {
  const toast = useToast();
  const initialBoard = useRef(createBoard()).current;
  const [boards, setBoards] = useState<Board[]>([initialBoard]);
  const [activeBoardId, setActiveBoardId] = useState(initialBoard.id);
  const [loaded, setLoaded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId?: string } | null>(null);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [drawTool, setDrawTool] = useState<DrawTool | null>(null);
  const [shapeSelectMode, setShapeSelectMode] = useState(false);
  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [attachmentCache, setAttachmentCache] = useState<Record<string, string>>({});
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; width: number; height: number; aspectRatio?: number } | null>(null);
  const drawingRef = useRef<{ id: string; tool: DrawTool; startX: number; startY: number; points?: { x: number; y: number }[] } | null>(null);
  const shapeDragRef = useRef<{ ids: string[]; startX: number; startY: number; shapes: { id: string; x: number; y: number; points?: { x: number; y: number }[]; curve?: { x: number; y: number } }[] } | null>(null);
  const shapeResizeRef = useRef<{ id: string; handle: 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; shapeX: number; shapeY: number; width: number; height: number } | null>(null);
  const curveEditRef = useRef<{ id: string; handle: 'start' | 'end' | 'curve' } | null>(null);
  const shapeSelectionRef = useRef<{ startX: number; startY: number } | null>(null);
  const mousePosRef = useRef({ x: 80, y: 80 });
  const undoStackRef = useRef<{ activeBoardId: string; boards: Board[] }[]>([]);
  const lastSnapshotRef = useRef<{ activeBoardId: string; boards: Board[] } | null>(null);
  const restoringRef = useRef(false);

  const activeBoard = boards.find((board) => board.id === activeBoardId) || boards[0];
  const items = activeBoard?.items || [];
  const shapes = activeBoard?.shapes || [];

  useEffect(() => {
    async function loadState() {
      try {
        const saved = await window.assistant.getWhiteboardState();
        const fallback = localStorage.getItem(STORAGE_KEY);
        const raw = saved || fallback;
        if (!raw) return;

        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          const migrated = await migrateLegacyAttachments([{ ...createBoard(), name: '画布 1', items: data }]);
          setBoards(migrated);
          setActiveBoardId(migrated[0].id);
          lastSnapshotRef.current = { activeBoardId: migrated[0].id, boards: migrated };
          return;
        }
        if (Array.isArray(data.boards) && data.boards.length > 0) {
          const migratedBoards = await migrateLegacyAttachments(data.boards);
          const nextActiveBoardId = data.activeBoardId || migratedBoards[0].id;
          setBoards(migratedBoards);
          setActiveBoardId(nextActiveBoardId);
          lastSnapshotRef.current = { activeBoardId: nextActiveBoardId, boards: migratedBoards };
        }
      } catch { /* ignore */ }
      finally {
        setLoaded(true);
      }
    }

    loadState();
  }, []);

  useEffect(() => {
    const missing = boards
      .flatMap((board) => board.items)
      .filter(isAttachmentItem)
      .flatMap((item) => getAttachmentFilenames(item).map((filename) => ({
        filename,
        mime: item.type === 'image' && filename === item.thumbnailFilename ? 'image/png' : item.mime,
      })))
      .filter((attachment) => attachment.filename && !attachmentCache[attachment.filename]);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(missing.map(async (attachment) => {
      const dataUrl = await window.assistant.getWhiteboardAttachment(attachment.filename, attachment.mime).catch(() => null);
      return dataUrl ? [attachment.filename, dataUrl] as const : null;
    })).then((entries) => {
      if (cancelled) return;
      const validEntries = entries.filter((entry): entry is readonly [string, string] => Boolean(entry));
      if (validEntries.length === 0) return;
      setAttachmentCache((prev) => ({ ...prev, ...Object.fromEntries(validEntries) }));
    });

    return () => {
      cancelled = true;
    };
  }, [boards, attachmentCache]);

  useEffect(() => {
    if (!loaded) return;

    const previous = lastSnapshotRef.current;
    const current = { activeBoardId, boards };
    if (restoringRef.current) {
      restoringRef.current = false;
    } else if (previous) {
      undoStackRef.current = [...undoStackRef.current, previous].slice(-50);
    }
    lastSnapshotRef.current = current;

    const state = JSON.stringify({
      activeBoardId,
      boards: boards.map((board) => ({
        ...board,
        items: board.items.map((item) => {
          if (!isAttachmentItem(item) || !item.filename) return item;
          const { dataUrl: _dataUrl, ...persisted } = item;
          return persisted;
        }),
      })),
    });
    window.assistant.saveWhiteboardState(state).catch(() => {
      toast({ title: '白板保存失败', status: 'warning' });
    });
  }, [activeBoardId, boards, loaded, toast]);

  function setActiveItems(updater: (items: BoardItem[]) => BoardItem[]) {
    setBoards((prev) => prev.map((board) => {
      if (board.id !== activeBoardId) return board;
      return { ...board, items: updater(board.items), updatedAt: nowIso() };
    }));
  }

  function setActiveShapes(updater: (shapes: BoardShape[]) => BoardShape[]) {
    setBoards((prev) => prev.map((board) => {
      if (board.id !== activeBoardId) return board;
      return { ...board, shapes: updater(board.shapes || []), updatedAt: nowIso() };
    }));
  }

  function clearShapeSelection() {
    setActiveShapeId(null);
    setSelectedShapeIds([]);
  }

  function selectShapes(ids: string[]) {
    setSelectedShapeIds(ids);
    setActiveShapeId(ids[0] || null);
  }

  function undo() {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    restoringRef.current = true;
    setBoards(previous.boards);
    setActiveBoardId(previous.activeBoardId);
    setActiveTextId(null);
    setEditingTextId(null);
    setActiveNoteId(null);
    setActiveImageId(null);
    clearShapeSelection();
    lastSnapshotRef.current = previous;
  }

  useEffect(() => {
    function closeMenu() {
      setContextMenu(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isInputTarget = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (isInputTarget && editingTextId) return;
        event.preventDefault();
        undo();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        if (isInputTarget) return;
        if (activeImageId) {
          event.preventDefault();
          void copyImageById(activeImageId);
        }
        return;
      }

      if (event.key === 'Escape') {
        closeMenu();
        setActiveTextId(null);
        setEditingTextId(null);
        setActiveNoteId(null);
        setActiveImageId(null);
        clearShapeSelection();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && !editingTextId && !isInputTarget) {
        const selectedItemId = activeTextId || activeImageId;
        if (selectedItemId) {
          event.preventDefault();
          removeItem(selectedItemId);
          setActiveTextId(null);
          setActiveImageId(null);
          clearShapeSelection();
          return;
        }
        const shapeIds = selectedShapeIds.length > 0 ? selectedShapeIds : activeShapeId ? [activeShapeId] : [];
        if (shapeIds.length > 0) {
          event.preventDefault();
          removeShapes(shapeIds);
          return;
        }
      }

      if (isInputTarget) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;

      event.preventDefault();
      addText(event.key, mousePosRef.current, true);
    }

    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeTextId, activeImageId, activeShapeId, selectedShapeIds, editingTextId, activeBoardId, boards]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const resize = resizeRef.current;
      if (resize) {
        setActiveItems((prev) => prev.map((item) => {
          if (item.id !== resize.id) return item;
          const minWidth = item.type === 'text' ? 80 : item.type === 'image' ? 24 : 160;
          const minHeight = item.type === 'text' ? 28 : item.type === 'image' ? 24 : 120;
          if (item.type === 'image' && resize.aspectRatio) {
            const nextWidth = Math.max(minWidth, resize.width + event.clientX - resize.startX);
            const nextHeight = Math.max(minHeight, Math.round(nextWidth / resize.aspectRatio));
            return touchItem({
              ...item,
              width: nextWidth,
              height: nextHeight,
              ...(item.imageMode === 'thumbnail'
                ? { thumbnailWidth: nextWidth, thumbnailHeight: nextHeight }
                : { originalWidth: nextWidth, originalHeight: nextHeight }),
            });
          }
          return touchItem({
            ...item,
            width: Math.max(minWidth, resize.width + event.clientX - resize.startX),
            height: Math.max(minHeight, resize.height + event.clientY - resize.startY),
          });
        }));
        return;
      }

      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      setActiveItems((prev) => prev.map((item) => {
        if (item.id !== drag.id) return item;
        const x = Math.max(0, Math.min(event.clientX - rect.left - drag.offsetX, rect.width - item.width));
        const y = Math.max(0, event.clientY - rect.top - drag.offsetY);
        return touchItem({ ...item, x, y });
      }));
    }

    function onPointerUp() {
      dragRef.current = null;
      resizeRef.current = null;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [activeBoardId]);

  function handlePaste(event: ClipboardEvent | React.ClipboardEvent) {
    const target = event.target as HTMLElement | null;
    const isEditableTextarea = target instanceof HTMLTextAreaElement && !target.readOnly;
    if (target?.tagName === 'INPUT' || isEditableTextarea || target?.isContentEditable) return;

    const clipboard = event.clipboardData;
    const files = Array.from(clipboard?.files || []);
    const itemFiles = Array.from(clipboard?.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const allFiles = files.length > 0 ? files : itemFiles;
    const text = clipboard?.getData('text/plain') || '';

    if (allFiles.length > 0) {
      event.preventDefault();
      addFiles(allFiles, mousePosRef.current);
      return;
    }
    if (text.trim()) {
      event.preventDefault();
      addText(text, mousePosRef.current);
    }
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented) return;
      handlePaste(event);
    }

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [activeBoardId, items.length]);

  function nextPosition(index: number) {
    return { x: 24 + (index % 6) * 28, y: 24 + (index % 8) * 24 };
  }

  function addBoard() {
    const board = createBoard(boards.length + 1);
    setBoards((prev) => [...prev, board]);
    setActiveBoardId(board.id);
  }

  function deleteActiveBoard() {
    if (boards.length <= 1) {
      toast({ title: '至少保留一个画布', status: 'info' });
      return;
    }
    if (!window.confirm(`确定删除「${activeBoard.name}」？`)) return;
    const nextBoards = boards.filter((board) => board.id !== activeBoardId);
    setBoards(nextBoards);
    setActiveBoardId(nextBoards[0].id);
  }

  function openAttachmentsDir() {
    window.assistant.openWhiteboardAttachmentsDir().catch(() => {
      toast({ title: '打开附件目录失败', status: 'warning' });
    });
  }

  function renameActiveBoard(name: string) {
    setBoards((prev) => prev.map((board) => (
      board.id === activeBoardId ? { ...board, name, updatedAt: nowIso() } : board
    )));
  }

  function addNote(text = '', position?: { x: number; y: number }) {
    setActiveItems((prev) => {
      const pos = position || nextPosition(prev.length);
      return [
        ...prev,
        {
          id: makeId(),
          type: 'note',
          ...timestamps(),
          ...pos,
          width: 230,
          height: 180,
          title: '便签',
          text,
          color: noteColors[prev.length % noteColors.length],
          fontSize: 12,
          bold: false,
          underline: false,
          strike: false,
        },
      ];
    });
  }

  function addText(text = '', position?: { x: number; y: number }, focus = true) {
    const id = makeId();
    const fontSize = 13;
    const size = getTextBoxSize(text, fontSize);
    setActiveItems((prev) => {
      const pos = position || nextPosition(prev.length);
      return [
        ...prev,
        {
          id,
          type: 'text',
          ...timestamps(),
          ...pos,
          ...size,
          text,
          fontSize,
          bold: false,
          underline: false,
          strike: false,
        },
      ];
    });
    if (focus) {
      setActiveTextId(id);
      setEditingTextId(id);
    }
  }

  function updateTextStyle(id: string, patch: Partial<Extract<BoardItem, { type: 'text' }>>) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'text' ? touchItem({ ...item, ...patch }) : item));
  }

  async function addFiles(files: File[] | FileList, position?: { x: number; y: number }) {
    const list = Array.from(files);
    if (list.length === 0) return;

    try {
      const baseIndex = items.length;
      const nextItems = await Promise.all(list.map(async (file, index): Promise<BoardItem> => {
        const dataUrl = await readFile(file);
        const mime = file.type || getDataUrlMime(dataUrl);
        const isImage = mime.startsWith('image/');
        const attachment = await window.assistant.saveWhiteboardAttachment({
          name: file.name || (isImage ? 'clipboard-image' : 'clipboard-file'),
          mime,
          dataUrl,
        });
        if (!attachment.success) throw new Error(attachment.error);

        const fallbackPos = nextPosition(baseIndex + index);
        const pos = position ? { x: position.x + index * 18, y: position.y + index * 18 } : fallbackPos;
        if (isImage) {
          const imageSize = await getImageSize(dataUrl);
          return {
            id: makeId(),
            type: 'image',
            ...timestamps(),
            ...pos,
            width: imageSize.width,
            height: imageSize.height,
            originalWidth: imageSize.width,
            originalHeight: imageSize.height,
            thumbnailWidth: 75,
            thumbnailHeight: 75,
            imageMode: 'original',
            name: file.name || 'clipboard-image',
            mime: attachment.mime,
            size: attachment.size,
            attachmentId: attachment.id,
            filename: attachment.filename,
            thumbnailFilename: attachment.thumbnailFilename,
          };
        }
        return {
          id: makeId(),
          type: 'file',
          ...timestamps(),
          ...pos,
          width: 75,
          height: 75,
          name: file.name || 'clipboard-file',
          mime: attachment.mime,
          size: attachment.size,
          attachmentId: attachment.id,
          filename: attachment.filename,
        };
      }));

      setActiveItems((prev) => [...prev, ...nextItems]);
    } catch (error) {
      toast({
        title: '附件保存失败',
        description: error instanceof Error ? error.message : undefined,
        status: 'warning',
      });
    }
  }

  function startDrag(event: React.PointerEvent, item: BoardItem) {
    if (event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      id: item.id,
      offsetX: event.clientX - rect.left - item.x,
      offsetY: event.clientY - rect.top - item.y,
    };
  }

  function updateNote(id: string, text: string) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'note' ? touchItem({ ...item, text }) : item));
  }

  function updateNoteTitle(id: string, title: string) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'note' ? touchItem({ ...item, title }) : item));
  }

  function updateNoteStyle(id: string, patch: Partial<Extract<BoardItem, { type: 'note' }>>) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'note' ? touchItem({ ...item, ...patch }) : item));
  }

  function updateText(id: string, text: string) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'text' ? touchItem({ ...item, text }) : item));
  }

  function toggleImageMode(id: string) {
    setActiveItems((prev) => prev.map((item) => {
      if (item.id !== id || item.type !== 'image') return item;
      const nextMode = item.imageMode === 'thumbnail' ? 'original' : 'thumbnail';
      return touchItem({
        ...item,
        imageMode: nextMode,
        width: nextMode === 'thumbnail' ? item.thumbnailWidth : item.originalWidth,
        height: nextMode === 'thumbnail' ? item.thumbnailHeight : item.originalHeight,
      });
    }));
  }

  function startResize(event: React.PointerEvent, item: BoardItem) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      width: item.width,
      height: item.height,
      aspectRatio: item.type === 'image' ? item.width / item.height : undefined,
    };
  }

  function removeItem(id: string) {
    setActiveItems((prev) => prev.filter((item) => item.id !== id));
    if (activeTextId === id) setActiveTextId(null);
    if (activeImageId === id) setActiveImageId(null);
    clearShapeSelection();
    if (activeNoteId === id) setActiveNoteId(null);
  }

  function removeShapes(ids: string[]) {
    const idSet = new Set(ids);
    setActiveShapes((prev) => prev.filter((shape) => !idSet.has(shape.id)));
    clearShapeSelection();
  }

  function removeShape(id: string) {
    removeShapes([id]);
  }

  function startDrawing(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawTool || event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const id = makeId();
    const shape: BoardShape = {
      id,
      type: drawTool,
      ...timestamps(),
      x,
      y,
      width: drawTool === 'freehand' ? 1 : 0,
      height: drawTool === 'freehand' ? 1 : 0,
      stroke: '#2563eb',
      strokeWidth: drawTool === 'freehand' ? 3 : 2,
      fill: 'transparent',
      points: drawTool === 'freehand' ? [{ x, y }] : undefined,
      curve: drawTool === 'line' || drawTool === 'arrow' ? { x, y } : undefined,
    };
    drawingRef.current = { id, tool: drawTool, startX: x, startY: y, points: [{ x, y }] };
    clearShapeSelection();
    setActiveShapes((prev) => [...prev, shape]);
  }

  function updateDrawing(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const curveEdit = curveEditRef.current;
    if (curveEdit) {
      setActiveShapes((prev) => prev.map((shape) => {
        if (shape.id !== curveEdit.id) return shape;
        const endX = shape.x + shape.width;
        const endY = shape.y + shape.height;
        if (curveEdit.handle === 'curve') return touchItem({ ...shape, curve: { x, y } });
        if (curveEdit.handle === 'start') {
          return touchItem({
            ...shape,
            x,
            y,
            width: endX - x,
            height: endY - y,
          });
        }
        return touchItem({ ...shape, width: x - shape.x, height: y - shape.y });
      }));
      return;
    }

    const shapeResize = shapeResizeRef.current;
    if (shapeResize) {
      const dx = x - shapeResize.startX;
      const dy = y - shapeResize.startY;
      setActiveShapes((prev) => prev.map((shape) => {
        if (shape.id !== shapeResize.id) return shape;
        const left = shapeResize.handle.includes('w') ? shapeResize.shapeX + dx : shapeResize.shapeX;
        const top = shapeResize.handle.includes('n') ? shapeResize.shapeY + dy : shapeResize.shapeY;
        const right = shapeResize.handle.includes('e') ? shapeResize.shapeX + shapeResize.width + dx : shapeResize.shapeX + shapeResize.width;
        const bottom = shapeResize.handle.includes('s') ? shapeResize.shapeY + shapeResize.height + dy : shapeResize.shapeY + shapeResize.height;
        return touchItem({
          ...shape,
          x: Math.min(left, right),
          y: Math.min(top, bottom),
          width: Math.max(8, Math.abs(right - left)),
          height: Math.max(8, Math.abs(bottom - top)),
        });
      }));
      return;
    }

    const shapeDrag = shapeDragRef.current;
    if (shapeDrag) {
      const dx = x - shapeDrag.startX;
      const dy = y - shapeDrag.startY;
      setActiveShapes((prev) => prev.map((shape) => {
        const original = shapeDrag.shapes.find((item) => item.id === shape.id);
        if (!original) return shape;
        return touchItem({
          ...shape,
          x: original.x + dx,
          y: original.y + dy,
          points: original.points?.map((point) => ({ x: point.x + dx, y: point.y + dy })),
          curve: original.curve ? { x: original.curve.x + dx, y: original.curve.y + dy } : shape.curve,
        });
      }));
      return;
    }

    const selection = shapeSelectionRef.current;
    if (selection) {
      setSelectionBox({
        x: Math.min(selection.startX, x),
        y: Math.min(selection.startY, y),
        width: Math.abs(x - selection.startX),
        height: Math.abs(y - selection.startY),
      });
      return;
    }

    const drawing = drawingRef.current;
    if (!drawing) return;
    setActiveShapes((prev) => prev.map((shape) => {
      if (shape.id !== drawing.id) return shape;
      if (drawing.tool === 'freehand') {
        const last = shape.points?.[shape.points.length - 1];
        if (last && Math.hypot(x - last.x, y - last.y) < 3) return shape;
        const points = [...(shape.points || []), { x, y }];
        const minX = Math.min(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxX = Math.max(...points.map((point) => point.x));
        const maxY = Math.max(...points.map((point) => point.y));
        return touchItem({ ...shape, points, x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) });
      }
      if (drawing.tool === 'line' || drawing.tool === 'arrow') {
        const last = drawing.points?.[drawing.points.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) >= 3) {
          drawing.points = [...(drawing.points || []), { x, y }];
        }
        return touchItem({
          ...shape,
          x: drawing.startX,
          y: drawing.startY,
          width: x - drawing.startX,
          height: y - drawing.startY,
          curve: getAutoCurvePoint(drawing.points || []) || { x: drawing.startX + (x - drawing.startX) / 2, y: drawing.startY + (y - drawing.startY) / 2 },
        });
      }
      return touchItem({
        ...shape,
        x: Math.min(drawing.startX, x),
        y: Math.min(drawing.startY, y),
        width: Math.abs(x - drawing.startX),
        height: Math.abs(y - drawing.startY),
      });
    }));
  }

  function stopDrawing() {
    if (shapeSelectionRef.current && selectionBox) {
      const ids = shapes
        .filter((shape) => rectsIntersect(getShapeBounds(shape), selectionBox))
        .map((shape) => shape.id);
      selectShapes(ids);
    }
    drawingRef.current = null;
    shapeDragRef.current = null;
    shapeResizeRef.current = null;
    curveEditRef.current = null;
    shapeSelectionRef.current = null;
    setSelectionBox(null);
  }

  function startShapeSelection(event: React.PointerEvent<SVGSVGElement>) {
    if (drawTool || !shapeSelectMode || event.button !== 0) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    shapeSelectionRef.current = { startX: x, startY: y };
    setSelectionBox({ x, y, width: 0, height: 0 });
    setActiveTextId(null);
    setEditingTextId(null);
    setActiveNoteId(null);
    setActiveImageId(null);
    clearShapeSelection();
  }

  function startCurveEdit(event: React.PointerEvent<SVGElement>, shape: BoardShape, handle: 'start' | 'end' | 'curve') {
    if (drawTool || event.button !== 0 || (shape.type !== 'line' && shape.type !== 'arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    selectShapes([shape.id]);
    curveEditRef.current = { id: shape.id, handle };
  }

  function startShapeResize(event: React.PointerEvent<SVGElement>, shape: BoardShape, handle: 'nw' | 'ne' | 'sw' | 'se') {
    if (drawTool || event.button !== 0 || (shape.type !== 'rect' && shape.type !== 'ellipse')) return;
    event.preventDefault();
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    selectShapes([shape.id]);
    shapeResizeRef.current = {
      id: shape.id,
      handle,
      startX: event.clientX - rect.left,
      startY: event.clientY - rect.top,
      shapeX: shape.x,
      shapeY: shape.y,
      width: shape.width,
      height: shape.height,
    };
  }

  function startShapeDrag(event: React.PointerEvent<SVGElement>, shape: BoardShape) {
    if (drawTool || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const ids = selectedShapeIds.includes(shape.id) ? selectedShapeIds : [shape.id];
    selectShapes(ids);
    setActiveTextId(null);
    setEditingTextId(null);
    setActiveNoteId(null);
    setActiveImageId(null);
    shapeDragRef.current = {
      ids,
      startX: x,
      startY: y,
      shapes: shapes
        .filter((item) => ids.includes(item.id))
        .map((item) => ({ id: item.id, x: item.x, y: item.y, points: item.points, curve: item.curve })),
    };
  }

  async function openFileItem(item: Extract<BoardItem, { type: 'file' }>) {
    const result = await window.assistant.openWhiteboardAttachment(item.filename).catch(() => ({ success: false, error: '打开附件失败' }));
    if (!result.success) {
      toast({ title: '打开附件失败', description: result.error, status: 'warning' });
    }
  }

  async function showFileItemInFolder(item: Extract<BoardItem, { type: 'file' }>) {
    const result = await window.assistant.showWhiteboardAttachmentInFolder(item.filename).catch(() => ({ success: false, error: '显示附件失败' }));
    if (!result.success) {
      toast({ title: '显示附件失败', description: result.error, status: 'warning' });
    }
  }

  function removeFileItem(item: Extract<BoardItem, { type: 'file' }>) {
    if (!window.confirm(`确定删除附件「${item.name}」？`)) return;
    removeItem(item.id);
  }

  function clearBoard() {
    if (items.length === 0 && shapes.length === 0) return;
    if (!window.confirm('确定清空当前画布？')) return;
    setActiveItems(() => []);
    setActiveShapes(() => []);
  }

  function openCanvasMenu(event: React.MouseEvent) {
    event.preventDefault();
    if (drawTool) {
      setDrawTool(null);
      setShapeSelectMode(true);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  async function pasteTextAsNote() {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      toast({ title: '剪贴板没有文本内容', status: 'info' });
      return;
    }
    addText(text, contextMenu ? { x: contextMenu.x, y: contextMenu.y } : undefined);
  }

  // 将画布中的图片复制到系统剪贴板。图片以磁盘文件存储，先取原图 dataURL，
  // 再统一转成 PNG 写入剪贴板（Chromium 的异步剪贴板写入仅可靠支持 image/png）。
  async function copyImageById(imageId: string | null): Promise<boolean> {
    const image = items.find((it) => it.id === imageId && it.type === 'image') as
      | Extract<BoardItem, { type: 'image' }>
      | undefined;
    if (!image) return false;
    try {
      let dataUrl = attachmentCache[image.filename] || image.dataUrl || '';
      if (!dataUrl) {
        dataUrl = (await window.assistant.getWhiteboardAttachment(image.filename, image.mime).catch(() => '')) || '';
      }
      if (!dataUrl) {
        toast({ title: '图片数据不可用，复制失败', status: 'warning' });
        return false;
      }
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('toBlob failed');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast({ title: '图片已复制到剪贴板', status: 'success' });
      return true;
    } catch {
      toast({ title: '复制图片失败', status: 'error' });
      return false;
    }
  }

  const editingTextItem = editingTextId ? items.find((item) => item.id === editingTextId && item.type === 'text') as Extract<BoardItem, { type: 'text' }> | undefined : undefined;
  const activeNoteItem = activeNoteId ? items.find((item) => item.id === activeNoteId && item.type === 'note') as Extract<BoardItem, { type: 'note' }> | undefined : undefined;
  const formatTarget = editingTextItem || activeNoteItem;

  return (
    <Flex w="100%" h="100%" minH="100%" gap={1.5}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <Flex
        direction="column"
        align="stretch"
        bg="whiteAlpha.900"
        borderRadius="sm"
        border="1px solid"
        borderColor="gray.200"
        p={1}
        w="44px"
        shrink={0}
        gap={1}
        overflow="hidden"
      >
        <Button size="xs" colorScheme="blue" onClick={addBoard} title="新增画布"><Plus size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant="outline" onClick={() => addNote()} title="添加便签"><StickyNote size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant="outline" onClick={() => addText('', mousePosRef.current)} title="添加文本框"><TypeIcon size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant="outline" onClick={() => fileInputRef.current?.click()} title="导入文件"><Upload size={15} strokeWidth={1.8} /></Button>
        <Box h="1px" bg="gray.200" my={1} />
        <Button size="xs" variant={shapeSelectMode ? 'solid' : 'outline'} colorScheme={shapeSelectMode ? 'blue' : 'gray'} onClick={() => { setDrawTool(null); setShapeSelectMode((value) => !value); }} title="选择/框选图形"><MousePointer2 size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant={drawTool === 'line' ? 'solid' : 'outline'} colorScheme={drawTool === 'line' ? 'blue' : 'gray'} onClick={() => { setShapeSelectMode(false); setDrawTool((tool) => tool === 'line' ? null : 'line'); }} title="绘制直线"><Minus size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant={drawTool === 'arrow' ? 'solid' : 'outline'} colorScheme={drawTool === 'arrow' ? 'blue' : 'gray'} onClick={() => { setShapeSelectMode(false); setDrawTool((tool) => tool === 'arrow' ? null : 'arrow'); }} title="绘制箭头"><ArrowUpRight size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant={drawTool === 'rect' ? 'solid' : 'outline'} colorScheme={drawTool === 'rect' ? 'blue' : 'gray'} onClick={() => { setShapeSelectMode(false); setDrawTool((tool) => tool === 'rect' ? null : 'rect'); }} title="绘制矩形"><Square size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant={drawTool === 'ellipse' ? 'solid' : 'outline'} colorScheme={drawTool === 'ellipse' ? 'blue' : 'gray'} onClick={() => { setShapeSelectMode(false); setDrawTool((tool) => tool === 'ellipse' ? null : 'ellipse'); }} title="绘制椭圆"><Circle size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant={drawTool === 'freehand' ? 'solid' : 'outline'} colorScheme={drawTool === 'freehand' ? 'blue' : 'gray'} onClick={() => { setShapeSelectMode(false); setDrawTool((tool) => tool === 'freehand' ? null : 'freehand'); }} title="自由画笔"><Pencil size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" colorScheme="red" variant="ghost" onClick={clearBoard} isDisabled={items.length === 0 && shapes.length === 0} title="清空当前画布"><Eraser size={15} strokeWidth={1.8} /></Button>
        <Box h="1px" bg="gray.200" my={1} />
        <Flex direction="column" gap={1} overflowY="auto" minH={0} flex={1}>
          {boards.map((board, index) => (
            <Button
              key={board.id}
              size="xs"
              variant={board.id === activeBoardId ? 'solid' : 'ghost'}
              colorScheme={board.id === activeBoardId ? 'blue' : 'gray'}
              onClick={() => setActiveBoardId(board.id)}
              title={board.name}
            >
              {index + 1}
            </Button>
          ))}
        </Flex>
        <Button size="xs" variant="ghost" onClick={openAttachmentsDir} title="打开附件目录"><FolderOpen size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" colorScheme="red" variant="ghost" onClick={deleteActiveBoard} isDisabled={boards.length <= 1} title="删除当前画布"><Trash2 size={15} strokeWidth={1.8} /></Button>
      </Flex>

      <Box
        ref={canvasRef}
        tabIndex={0}
        position="relative"
        bg="white"
        borderRadius="sm"
        h="100%"
        minH="560px"
        flex={1}
        overflow="hidden"
        border="1px solid"
        borderColor="gray.100"
        backgroundImage="linear-gradient(#edf2f7 1px, transparent 1px), linear-gradient(90deg, #edf2f7 1px, transparent 1px)"
        backgroundSize="24px 24px"
        outline="none"
        userSelect="none"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (event.detail > 1 && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setActiveTextId(null);
            setEditingTextId(null);
            setActiveNoteId(null);
            setActiveImageId(null);
            clearShapeSelection();
            canvasRef.current?.focus();
          }
        }}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          addText('', { x: event.clientX - rect.left, y: event.clientY - rect.top }, true);
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          mousePosRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        }}
        onPaste={handlePaste}
        onContextMenu={openCanvasMenu}
      >
        <Box
          position="absolute"
          top={3}
          left={3}
          bg="whiteAlpha.900"
          border="1px solid"
          borderColor="gray.200"
          borderRadius="sm"
          px={2}
          py={1}
          boxShadow="0 8px 24px rgba(0,0,0,0.12)"
          zIndex={10}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <Input
            value={activeBoard.name}
            onChange={(event) => renameActiveBoard(event.target.value)}
            variant="unstyled"
            size="xs"
            fontSize="xs"
            fontWeight="semibold"
            color="gray.600"
            w={`${Math.max(72, Math.min(260, (activeBoard.name || '画布名称').length * 14))}px`}
            minW="72px"
            maxW="260px"
            placeholder="画布名称"
            userSelect="text"
          />
        </Box>

        {items.length === 0 && shapes.length === 0 && (
          <Flex position="absolute" inset={0} align="center" justify="center" direction="column" color="gray.400" pointerEvents="none">
            <Heading size="sm" mb={1}>空白画布</Heading>
            <Text fontSize="sm">从左侧添加便签/文本框/导入文件，或直接键盘输入、粘贴文本。</Text>
          </Flex>
        )}

        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: drawTool || shapeSelectMode || shapes.length > 0 ? 'all' : 'none', zIndex: 1 }}
          onPointerDown={drawTool ? startDrawing : startShapeSelection}
          onPointerMove={updateDrawing}
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          onContextMenu={openCanvasMenu}
        >
          <defs>
            {shapes.filter((shape) => shape.type === 'arrow').map((shape) => (
              <marker key={shape.id} id={`arrow-${shape.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,4 L0,8 Z" fill={shape.stroke} />
              </marker>
            ))}
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="transparent" style={{ pointerEvents: drawTool || shapeSelectMode ? 'all' : 'none' }} />
          {selectionBox && (
            <rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              fill="rgba(49, 130, 206, 0.08)"
              stroke="#3182ce"
              strokeWidth="1"
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}
          {shapes.map((shape) => {
            const selected = selectedShapeIds.includes(shape.id) || activeShapeId === shape.id;
            const bounds = getShapeBounds(shape);
            const commonProps = {
              stroke: shape.stroke,
              strokeWidth: selected ? shape.strokeWidth + 1 : shape.strokeWidth,
              style: { pointerEvents: 'none' } as React.CSSProperties,
            };
            return (
              <g key={shape.id}>
                <rect
                  x={bounds.x - 8}
                  y={bounds.y - 8}
                  width={bounds.width + 16}
                  height={bounds.height + 16}
                  fill="transparent"
                  style={{ pointerEvents: drawTool ? 'none' : 'all', cursor: 'default' }}
                  onPointerDown={(event) => startShapeDrag(event, shape)}
                />
                {shape.type === 'freehand' && (
                  <polyline
                    points={getShapePoints(shape)}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    {...commonProps}
                  />
                )}
                {shape.type === 'rect' && (
                  <rect
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill={shape.fill || 'transparent'}
                    rx="4"
                    {...commonProps}
                  />
                )}
                {shape.type === 'ellipse' && (
                  <ellipse
                    cx={shape.x + shape.width / 2}
                    cy={shape.y + shape.height / 2}
                    rx={shape.width / 2}
                    ry={shape.height / 2}
                    fill={shape.fill || 'transparent'}
                    {...commonProps}
                  />
                )}
                {(shape.type === 'line' || shape.type === 'arrow') && (
                  <path
                    d={getCurvePath(shape)}
                    fill="none"
                    strokeLinecap="round"
                    markerEnd={shape.type === 'arrow' ? `url(#arrow-${shape.id})` : undefined}
                    {...commonProps}
                  />
                )}
                {selected && !drawTool && (
                  <>
                    {shape.type !== 'line' && shape.type !== 'arrow' && (
                      <rect
                        x={bounds.x - 4}
                        y={bounds.y - 4}
                        width={bounds.width + 8}
                        height={bounds.height + 8}
                        fill="none"
                        stroke="#3182ce"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                        pointerEvents="none"
                      />
                    )}
                    {(shape.type === 'rect' || shape.type === 'ellipse') && (['nw', 'ne', 'sw', 'se'] as const).map((handle) => {
                      const cx = handle.includes('w') ? bounds.x : bounds.x + bounds.width;
                      const cy = handle.includes('n') ? bounds.y : bounds.y + bounds.height;
                      return (
                        <circle
                          key={handle}
                          cx={cx}
                          cy={cy}
                          r="5"
                          fill="white"
                          stroke="#3182ce"
                          strokeWidth="1.5"
                          style={{ cursor: `${handle}-resize`, pointerEvents: 'all' }}
                          onPointerDown={(event) => startShapeResize(event, shape, handle)}
                        />
                      );
                    })}
                    {(shape.type === 'line' || shape.type === 'arrow') && (
                      <>
                        <line x1={shape.x} y1={shape.y} x2={getCurvePoint(shape).x} y2={getCurvePoint(shape).y} stroke="#90CDF4" strokeWidth="1" strokeDasharray="3 3" pointerEvents="none" />
                        <line x1={shape.x + shape.width} y1={shape.y + shape.height} x2={getCurvePoint(shape).x} y2={getCurvePoint(shape).y} stroke="#90CDF4" strokeWidth="1" strokeDasharray="3 3" pointerEvents="none" />
                        <circle cx={shape.x} cy={shape.y} r="5" fill="white" stroke="#3182ce" strokeWidth="1.5" style={{ cursor: 'move', pointerEvents: 'all' }} onPointerDown={(event) => startCurveEdit(event, shape, 'start')} />
                        <circle cx={shape.x + shape.width} cy={shape.y + shape.height} r="5" fill="white" stroke="#3182ce" strokeWidth="1.5" style={{ cursor: 'move', pointerEvents: 'all' }} onPointerDown={(event) => startCurveEdit(event, shape, 'end')} />
                        <circle cx={getCurvePoint(shape).x} cy={getCurvePoint(shape).y} r="5" fill="#3182ce" stroke="white" strokeWidth="1.5" style={{ cursor: 'grab', pointerEvents: 'all' }} onPointerDown={(event) => startCurveEdit(event, shape, 'curve')} />
                      </>
                    )}
                    <g
                      transform={`translate(${bounds.x + bounds.width + 8}, ${bounds.y - 8})`}
                      style={{ cursor: 'pointer', pointerEvents: 'all' }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeShape(shape.id);
                      }}
                    >
                      <circle r="8" fill="white" stroke="#CBD5E0" />
                      <path d="M-3,-3 L3,3 M3,-3 L-3,3" stroke="#E53E3E" strokeWidth="1.5" strokeLinecap="round" />
                    </g>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {items.map((item) => (
          <Tooltip
            key={item.id}
            label={getItemTooltip(item)}
            hasArrow
            openDelay={1000}
            closeDelay={0}
            placement="top"
            whiteSpace="pre-line"
            fontSize="xs"
          >
          <Box
            position="absolute"
            zIndex={2}
            left={`${item.x}px`}
            top={`${item.y}px`}
            w={`${item.width}px`}
            h={`${item.height}px`}
            bg={item.type === 'note' ? item.color : item.type === 'text' || item.type === 'image' || item.type === 'file' ? 'transparent' : 'white'}
            borderRadius="sm"
            boxShadow={item.type === 'text' || item.type === 'image' || item.type === 'file' ? 'none' : '0 8px 24px rgba(0,0,0,0.12)'}
            border="1px solid"
            borderColor={item.type === 'text' ? (activeTextId === item.id ? 'blue.300' : 'transparent') : item.type === 'image' || item.type === 'file' ? 'transparent' : 'blackAlpha.100'}
            overflow={item.type === 'text' || item.type === 'image' || item.type === 'file' ? 'visible' : 'hidden'}
            transition={item.type === 'image' ? 'width 180ms ease, height 180ms ease, box-shadow 180ms ease, border-radius 180ms ease' : undefined}
            _hover={item.type === 'text' ? { borderColor: 'blue.200' } : undefined}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (item.type !== 'image') return;
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              setActiveImageId(item.id);
              setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, itemId: item.id });
            }}
            onPointerDown={(event) => {
              if (item.type === 'text') {
                setActiveTextId(item.id);
                setEditingTextId(null);
                setActiveNoteId(null);
                setActiveImageId(null);
                setActiveShapeId(null);
                startDrag(event, item);
              } else if (item.type === 'image') {
                setActiveImageId(item.id);
                setActiveTextId(null);
                setEditingTextId(null);
                setActiveNoteId(null);
                setActiveShapeId(null);
                startDrag(event, item);
              } else if (item.type === 'file') {
                setActiveTextId(null);
                setEditingTextId(null);
                setActiveNoteId(null);
                setActiveImageId(null);
                setActiveShapeId(null);
                startDrag(event, item);
              }
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              if (item.type === 'text') {
                event.stopPropagation();
                setActiveTextId(item.id);
                setEditingTextId(item.id);
                setActiveNoteId(null);
                setActiveImageId(null);
                setActiveShapeId(null);
              } else if (item.type === 'image') {
                event.stopPropagation();
                setActiveImageId(item.id);
                setActiveTextId(null);
                setEditingTextId(null);
                setActiveNoteId(null);
                toggleImageMode(item.id);
              } else if (item.type === 'file') {
                event.stopPropagation();
                openFileItem(item);
              }
            }}
          >
            {item.type === 'note' && (
              <Flex
                align="center"
                justify="space-between"
                gap={1}
                px={2}
                py={1}
                bg="blackAlpha.50"
                cursor="move"
                onPointerDown={(event) => startDrag(event, item)}
              >
                <Input
                  value={item.title ?? '便签'}
                  onChange={(event) => updateNoteTitle(item.id, event.target.value)}
                  variant="unstyled"
                  size="xs"
                  fontSize="xs"
                  color="gray.600"
                  fontWeight="semibold"
                  minW={0}
                  userSelect="text"
                  onPointerDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                />
                <Flex gap={1} onPointerDown={(event) => event.stopPropagation()}>
                  {item.type === 'note' && (
                    <Button
                      size="xs"
                      variant="ghost"
                      title="更换底色"
                      onClick={() => updateNoteStyle(item.id, { color: noteColors[(noteColors.indexOf(item.color) + 1) % noteColors.length] })}
                    >
                      <Palette size={13} strokeWidth={1.8} />
                    </Button>
                  )}
                  <Button size="xs" colorScheme="red" variant="ghost" title="删除" onClick={() => removeItem(item.id)}>
                    <Trash2 size={13} strokeWidth={1.8} />
                  </Button>
                </Flex>
              </Flex>
            )}

            {item.type === 'note' && (
              <>
                <Textarea
                  value={item.text}
                  onChange={(event) => updateNote(item.id, event.target.value)}
                  onFocus={() => {
                    setActiveNoteId(item.id);
                    setActiveTextId(null);
                    setEditingTextId(null);
                    setActiveImageId(null);
                    setActiveShapeId(null);
                  }}
                  placeholder="输入临时记录..."
                  variant="unstyled"
                  p={2}
                  h={`calc(${item.height}px - 34px)`}
                  resize="none"
                  fontSize={`${item.fontSize || 12}px`}
                  fontWeight={item.bold ? 'semibold' : 'normal'}
                  color={item.textColor || 'gray.800'}
                  lineHeight="1.55"
                  userSelect="text"
                  sx={{ textDecoration: [item.underline ? 'underline' : '', item.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none' }}
                />
                <Box
                  position="absolute"
                  right={1}
                  bottom={1}
                  w="12px"
                  h="12px"
                  cursor="nwse-resize"
                  borderRight="2px solid"
                  borderBottom="2px solid"
                  borderColor="blackAlpha.400"
                  onPointerDown={(event) => startResize(event, item)}
                />
              </>
            )}

            {item.type === 'text' && (
              <>
                <Textarea
                  autoFocus={editingTextId === item.id}
                  value={item.text}
                  onChange={(event) => updateText(item.id, event.target.value)}
                  onFocus={() => {
                    setActiveTextId(item.id);
                    if (editingTextId !== item.id) canvasRef.current?.focus();
                  }}
                  onPointerDown={(event) => {
                    if (editingTextId === item.id) event.stopPropagation();
                  }}
                  readOnly={editingTextId !== item.id}
                  cursor={editingTextId === item.id ? 'text' : 'default'}
                  placeholder={editingTextId === item.id ? '输入文本' : ''}
                  variant="unstyled"
                  p={1}
                  h="100%"
                  resize="none"
                  fontSize={`${item.fontSize || 13}px`}
                  fontWeight={item.bold ? 'semibold' : 'normal'}
                  color={item.color || 'gray.800'}
                  lineHeight="1.45"
                  sx={{ textDecoration: [item.underline ? 'underline' : '', item.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none' }}
                  bg="transparent"
                  overflow="hidden"
                  userSelect={editingTextId === item.id ? 'text' : 'none'}
                />
                {activeTextId === item.id && (
                  <>
                    <Box
                      position="absolute"
                      right={0}
                      bottom={0}
                      w="10px"
                      h="10px"
                      cursor="nwse-resize"
                      borderRight="2px solid"
                      borderBottom="2px solid"
                      borderColor="blue.400"
                      onPointerDown={(event) => startResize(event, item)}
                    />
                  </>
                )}
              </>
            )}

            {item.type === 'image' && (
              <>
                <Box
                  h="100%"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  cursor="default"
                  borderRadius={item.imageMode === 'thumbnail' ? 'sm' : 'base'}
                  overflow="hidden"
                  bg="whiteAlpha.900"
                  border="1px solid"
                  borderColor="blackAlpha.100"
                  boxShadow={item.imageMode === 'thumbnail'
                    ? '0 4px 10px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255,255,255,0.72)'
                    : '0 10px 24px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255,255,255,0.62)'}
                  transition="box-shadow 180ms ease, border-radius 180ms ease, transform 180ms ease"
                  _hover={{ transform: item.imageMode === 'thumbnail' ? 'translateY(-0.5px)' : 'none', borderColor: 'blackAlpha.200' }}
                >
                  <img
                    src={getAttachmentSource(item, attachmentCache)}
                    alt={item.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      transition: 'opacity 160ms ease, transform 180ms ease, border-radius 180ms ease',
                      borderRadius: item.imageMode === 'thumbnail' ? '4px' : '3px',
                    }}
                    draggable={false}
                  />
                </Box>
                {activeImageId === item.id && item.imageMode === 'original' && (
                  <Box
                    position="absolute"
                    right="-6px"
                    bottom="-6px"
                    w="14px"
                    h="14px"
                    cursor="nwse-resize"
                    bg="white"
                    border="2px solid"
                    borderColor="blue.400"
                    borderRadius="full"
                    boxShadow="0 2px 8px rgba(49, 130, 206, 0.35)"
                    _after={{
                      content: '""',
                      position: 'absolute',
                      right: '3px',
                      bottom: '3px',
                      width: '4px',
                      height: '4px',
                      borderRight: '1px solid',
                      borderBottom: '1px solid',
                      borderColor: 'blue.400',
                    }}
                    onPointerDown={(event) => startResize(event, item)}
                  />
                )}
              </>
            )}

            {item.type === 'file' && (
              <Flex
                h="100%"
                w="100%"
                position="relative"
                role="group"
                direction="column"
                align="center"
                justify="center"
                gap={1}
                p={2}
                cursor="default"
                borderRadius="sm"
                overflow="visible"
                bg={getFileTone(item.mime, item.name).bg}
                border="1px solid"
                borderColor="blackAlpha.100"
                boxShadow={`0 4px 10px ${getFileTone(item.mime, item.name).shadow}, inset 0 1px 0 rgba(255,255,255,0.72)`}
                transition="box-shadow 180ms ease, transform 180ms ease, border-radius 180ms ease"
                _hover={{ transform: 'translateY(-0.5px)', borderColor: 'blackAlpha.200' }}
              >
                <Flex
                  position="absolute"
                  top="2px"
                  left="2px"
                  direction="column"
                  align="center"
                  gap="0"
                  opacity={0}
                  pointerEvents="none"
                  transition="opacity 120ms ease"
                  _groupHover={{ opacity: 1, pointerEvents: 'auto' }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <Button size="xs" minW="16px" h="16px" p={0} colorScheme="blue" variant="ghost" title="在目录中显示" onClick={() => showFileItemInFolder(item)}>
                    <FolderOpen size={10} strokeWidth={1.8} />
                  </Button>
                  <Button size="xs" minW="16px" h="16px" p={0} colorScheme="red" variant="ghost" title="删除" onClick={() => removeFileItem(item)}>
                    <Trash2 size={10} strokeWidth={1.8} />
                  </Button>
                </Flex>
                <Box
                  position="absolute"
                  top="5px"
                  right="5px"
                  px="3px"
                  py="1px"
                  borderRadius="3px"
                  bg={getFileTone(item.mime, item.name).badgeBg}
                  color={getFileTone(item.mime, item.name).badgeColor}
                  fontSize="7px"
                  lineHeight="1"
                  fontWeight="bold"
                  letterSpacing="0.02em"
                >
                  {getFileExt(item.name)}
                </Box>
                <FileText size={24} strokeWidth={1.7} color={getFileTone(item.mime, item.name).icon} />
                <Text w="100%" fontSize="10px" lineHeight="1.12" fontWeight="semibold" color="gray.600" noOfLines={2} textAlign="center">
                  {getFileBaseName(item.name)}
                </Text>
              </Flex>
            )}
          </Box>
          </Tooltip>
        ))}

        {formatTarget && (
          <Flex
            position="absolute"
            left="50%"
            bottom={3}
            transform="translateX(-50%)"
            bg="whiteAlpha.950"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="lg"
            boxShadow="0 12px 32px rgba(0,0,0,0.16)"
            px={2}
            py={1}
            gap={1}
            align="center"
            zIndex={15}
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              size="xs"
              variant={formatTarget.bold ? 'solid' : 'ghost'}
              fontWeight="bold"
              title="加粗"
              onClick={() => {
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { bold: !formatTarget.bold });
                else updateNoteStyle(formatTarget.id, { bold: !formatTarget.bold });
              }}
            >
              B
            </Button>
            <Button
              size="xs"
              variant={formatTarget.underline ? 'solid' : 'ghost'}
              title="下划线"
              onClick={() => {
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { underline: !formatTarget.underline });
                else updateNoteStyle(formatTarget.id, { underline: !formatTarget.underline });
              }}
            >
              <Underline size={13} strokeWidth={1.8} />
            </Button>
            <Button
              size="xs"
              variant={formatTarget.strike ? 'solid' : 'ghost'}
              title="删除线"
              onClick={() => {
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { strike: !formatTarget.strike });
                else updateNoteStyle(formatTarget.id, { strike: !formatTarget.strike });
              }}
            >
              <Strikethrough size={13} strokeWidth={1.8} />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                const nextFontSize = Math.max(10, (formatTarget.fontSize || (formatTarget.type === 'text' ? 13 : 12)) - 1);
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { fontSize: nextFontSize });
                else updateNoteStyle(formatTarget.id, { fontSize: nextFontSize });
              }}
            >
              A-
            </Button>
            <Text fontSize="xs" color="gray.500" minW="32px" textAlign="center">{formatTarget.fontSize || (formatTarget.type === 'text' ? 13 : 12)}px</Text>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                const nextFontSize = Math.min(36, (formatTarget.fontSize || (formatTarget.type === 'text' ? 13 : 12)) + 1);
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { fontSize: nextFontSize });
                else updateNoteStyle(formatTarget.id, { fontSize: nextFontSize });
              }}
            >
              A+
            </Button>
            <Flex gap={1} align="center" ml={1}>
              {textColors.map((color) => {
                const current = formatTarget.type === 'text' ? (formatTarget.color || textColors[0].value) : (formatTarget.textColor || textColors[0].value);
                const selected = current === color.value;
                return (
                  <Button
                    key={color.value}
                    size="xs"
                    minW="18px"
                    w="18px"
                    h="18px"
                    p={0}
                    borderRadius="full"
                    border="2px solid"
                    borderColor={selected ? 'blue.400' : 'transparent'}
                    bg={color.swatch}
                    _hover={{ opacity: 0.85 }}
                    title="文字颜色"
                    onClick={() => {
                      if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { color: color.value });
                      else updateNoteStyle(formatTarget.id, { textColor: color.value });
                    }}
                  />
                );
              })}
            </Flex>
          </Flex>
        )}

        {contextMenu && (
          <Box
            position="absolute"
            left={`${contextMenu.x}px`}
            top={`${contextMenu.y}px`}
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="sm"
            boxShadow="0 12px 32px rgba(0,0,0,0.18)"
            p={1}
            zIndex={20}
            minW="150px"
            onClick={(event) => event.stopPropagation()}
          >
            {contextMenu.itemId && items.some((it) => it.id === contextMenu.itemId && it.type === 'image') && (
              <Button
                size="sm"
                variant="ghost"
                justifyContent="flex-start"
                w="100%"
                onClick={() => { const id = contextMenu.itemId ?? null; setContextMenu(null); void copyImageById(id); }}
              >
                复制图片
              </Button>
            )}
            <Button size="sm" variant="ghost" justifyContent="flex-start" w="100%" onClick={() => addNote('', { x: contextMenu.x, y: contextMenu.y })}>添加便签</Button>
            <Button size="sm" variant="ghost" justifyContent="flex-start" w="100%" onClick={() => addText('', { x: contextMenu.x, y: contextMenu.y })}>添加文本框</Button>
            <Button size="sm" variant="ghost" justifyContent="flex-start" w="100%" onClick={pasteTextAsNote}>粘贴文本</Button>
            <Button size="sm" variant="ghost" justifyContent="flex-start" w="100%" onClick={() => fileInputRef.current?.click()}>导入文件</Button>
            <Button size="sm" colorScheme="red" variant="ghost" justifyContent="flex-start" w="100%" onClick={clearBoard} isDisabled={items.length === 0 && shapes.length === 0}>清空当前画布</Button>
          </Box>
        )}
      </Box>
    </Flex>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Flex,
  Image,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  Spinner,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import {
  Copy,
  Eye,
  ExternalLink,
  File as FileIcon,
  Folder,
  FolderOpen,
  ImageIcon,
  RefreshCw,
  Star,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type { ClipboardItem, ClipboardKind } from '../../src/shared/types';

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diff = Date.now() - ts;
  if (diff < 30_000) return '刚刚';
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))} 小时前`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function previewText(content: string, max = 160): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function humanSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const KIND_FILTERS: { key: ClipboardKind | 'all'; label: string; icon?: React.ReactNode }[] = [
  { key: 'all', label: '全部' },
  { key: 'text', label: '文本', icon: <Type size={13} /> },
  { key: 'richtext', label: '富文本', icon: <Type size={13} /> },
  { key: 'image', label: '图片', icon: <ImageIcon size={13} /> },
  { key: 'file', label: '文件', icon: <FileIcon size={13} /> },
];

const KIND_LABEL: Record<string, string> = { text: 'TXT', richtext: 'RTF', image: 'IMG', file: 'FILE' };

function ClipboardThumb({ id, alt }: { id: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    window.assistant.clipboard
      .thumbnail(id)
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { /* 静默 */ });
    return () => { alive = false; };
  }, [id]);
  if (!src) {
    return (
      <Flex w="40px" h="40px" align="center" justify="center" bg="gray.100" borderRadius="sm" flexShrink={0}>
        <ImageIcon size={16} color="var(--uu-icon-muted)" />
      </Flex>
    );
  }
  return (
    <Box
      as="img"
      src={src}
      alt={alt}
      w="40px"
      h="40px"
      objectFit="contain"
      borderRadius="sm"
      bg="gray.50"
      flexShrink={0}
    />
  );
}

function ItemBody({ item }: { item: ClipboardItem }) {
  if (item.kind === 'image') {
    const m = item.meta?.image;
    return (
      <div className="ck-item">
        <ClipboardThumb id={item.id} alt={m?.filename ?? '图片'} />
        <div className="ck-item-main">
          <div className="ck-item-title">{m ? `${m.width}×${m.height}` : '图片'}</div>
          {m && <div className="ck-dim" style={{ fontSize: 11 }}>{humanSize(m.sizeBytes)}</div>}
        </div>
      </div>
    );
  }
  if (item.kind === 'file') {
    const m = item.meta?.file;
    return (
      <div className="ck-item">
        <div className="ck-item-ico">{m?.isDir ? <Folder size={16} /> : <FileIcon size={16} />}</div>
        <div className="ck-item-main">
          <div className="ck-item-title">{m?.name ?? item.content}</div>
          <div className="ck-dim" style={{ fontSize: 11 }}>
            {m && m.sizeBytes > 0 ? humanSize(m.sizeBytes) : (m?.isDir ? '文件夹' : '文件')}
          </div>
        </div>
      </div>
    );
  }
  // text / richtext
  return (
    <div className="ck-item">
      <div className="ck-item-main" style={{ flex: 1 }}>
        <div className="ck-item-title">{previewText(item.content)}</div>
        <div className="ck-dim" style={{ fontSize: 11 }}>
          {formatRelativeTime(item.lastUsedAt)} · {item.length} 字符
          {item.kind === 'richtext' && ' · 富文本'}
          {item.copyCount > 0 && ` · 已复制 ${item.copyCount} 次`}
        </div>
      </div>
    </div>
  );
}

/** 按 kind 显示不同操作（磷光图标按钮） */
function ItemActions({ item, onCopy, onView, onOpenFile, onShowFolder, onPin, onRemove }: {
  item: ClipboardItem;
  onCopy: () => void;
  onView?: () => void;
  onOpenFile?: () => void;
  onShowFolder?: () => void;
  onPin: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <button className="ck-ico" title="复制到剪贴板" onClick={onCopy}><Copy size={14} /></button>
      {item.kind === 'image' && onView && (
        <button className="ck-ico" title="查看大图" onClick={onView}><Eye size={14} /></button>
      )}
      {item.kind === 'file' && (
        <>
          {onOpenFile && <button className="ck-ico" title="打开文件" onClick={onOpenFile}><ExternalLink size={14} /></button>}
          {onShowFolder && <button className="ck-ico" title="在 Finder 中显示" onClick={onShowFolder}><FolderOpen size={14} /></button>}
        </>
      )}
      <button className={'ck-ico' + (item.pinned ? ' on' : '')} title={item.pinned ? '取消置顶' : '置顶'} onClick={onPin}>
        <Star size={14} fill={item.pinned ? 'currentColor' : 'none'} />
      </button>
      <button className="ck-ico danger" title="删除" onClick={onRemove}><X size={14} /></button>
    </div>
  );
}

export default function ClipboardHistory() {
  const toast = useToast();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [kindFilter, setKindFilter] = useState<ClipboardKind | 'all'>('all');

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [viewingImage, setViewingImage] = useState<{ id: string; src: string; meta?: any } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.assistant.clipboard.list({
        keyword: keyword.trim() || undefined,
        pinnedOnly: pinnedOnly || undefined,
        kind: kindFilter === 'all' ? undefined : kindFilter,
        limit: 200,
      });
      setItems(list ?? []);
    } catch (err) {
      toast({
        status: 'error',
        title: '加载失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [keyword, pinnedOnly, kindFilter, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = window.assistant.clipboard.onUpdate?.(() => {
      void load();
    });
    return () => {
      unsubscribe?.();
    };
  }, [load]);

  async function handleCopy(item: ClipboardItem) {
    try {
      await window.assistant.clipboard.copy(item.id);
      const label = item.kind === 'image' ? '图片已复制到剪贴板'
        : item.kind === 'file' ? '文件已复制到剪贴板'
        : item.kind === 'richtext' ? '富文本已复制到剪贴板'
        : '已复制到剪贴板';
      toast({ status: 'success', title: label, duration: 1500, isClosable: false });
    } catch (err) {
      toast({
        status: 'error',
        title: '复制失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 3000,
      });
    }
  }

  async function handleViewImage(item: ClipboardItem) {
    if (item.kind !== 'image' || !item.meta?.image) return;
    try {
      const src = await window.assistant.clipboard.thumbnail(item.id);
      if (src) {
        setViewingImage({ id: item.id, src, meta: item.meta.image });
        onOpen();
      }
    } catch (err) {
      toast({
        status: 'error',
        title: '加载图片失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 3000,
      });
    }
  }

  async function handleOpenFile(item: ClipboardItem) {
    if (item.kind !== 'file') return;
    try {
      await window.assistant.clipboard.openFile(item.id);
      toast({ status: 'success', title: '已打开文件', duration: 1500 });
    } catch (err) {
      toast({
        status: 'error',
        title: '打开失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 3000,
      });
    }
  }

  async function handleShowInFolder(item: ClipboardItem) {
    if (item.kind !== 'file') return;
    try {
      await window.assistant.clipboard.showInFolder(item.id);
      toast({ status: 'success', title: '已在 Finder 中显示', duration: 1500 });
    } catch (err) {
      toast({
        status: 'error',
        title: '显示失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 3000,
      });
    }
  }

  async function handleTogglePin(item: ClipboardItem) {
    try {
      await window.assistant.clipboard.togglePin(item.id);
    } catch (err) {
      toast({
        status: 'error',
        title: '操作失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 3000,
      });
    }
  }

  async function handleRemove(item: ClipboardItem) {
    try {
      await window.assistant.clipboard.remove(item.id);
    } catch (err) {
      toast({
        status: 'error',
        title: '删除失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 3000,
      });
    }
  }

  async function handleClear() {
    try {
      const res = await window.assistant.clipboard.clear();
      toast({ status: 'success', title: `已清空 ${res.cleared} 条历史`, duration: 2000 });
    } catch (err) {
      toast({
        status: 'error',
        title: '清空失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 3000,
      });
    }
  }

  return (
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">MEMORY BUFFER</span>
        <span className="zh">剪贴板</span>
        <span className="sub">LIVE MONITOR // 监听中 · {items.length} 条</span>
      </div>

      <div className="ck-tools">
        <div className="ck-input" style={{ flex: 1, padding: '8px 12px' }}>
          <span className="prompt">›</span>
          <input
            placeholder="搜索复制过的内容…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <kbd>⌘F</kbd>
        </div>
        <button className={'ck-chip' + (pinnedOnly ? ' on' : '')} onClick={() => setPinnedOnly((v) => !v)}>
          <Star size={13} fill={pinnedOnly ? 'currentColor' : 'none'} /> 置顶
        </button>
        <div className="ck-spacer" />
        <button className="ck-btn" onClick={() => void load()}>
          <RefreshCw size={12} /> 刷新
        </button>
        <button className="ck-btn danger" onClick={() => void handleClear()}>
          <Trash2 size={12} /> 清空
        </button>
      </div>

      <div className="ck-chips">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.key}
            className={'ck-chip' + (kindFilter === f.key ? ' on' : '')}
            onClick={() => setKindFilter(f.key)}
          >
            {f.icon}{f.label}
          </button>
        ))}
      </div>

      <div className="ck-list" style={{ marginTop: 2 }}>
        {loading && items.length === 0 ? (
          <div className="ck-empty"><div className="code">MEMORY BUFFER // SYNC</div><Spinner size="sm" ml="auto" mr="auto" />正在同步剪贴板…</div>
        ) : items.length === 0 ? (
          <div className="ck-empty">
            <div className="code">NO DATA</div>
            {keyword || pinnedOnly || kindFilter !== 'all' ? '没有匹配的记录' : '暂无剪贴板历史，复制任意内容即可记录'}
          </div>
        ) : (
          <>
            <div className="ck-hairline">RECENT // 最近记录 <span className="n">{items.length}</span></div>
            {items.map((item) => (
              <div key={item.id} className="ck-row">
                <ItemBody item={item} />
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                  <span className="tag">{KIND_LABEL[item.kind]}</span>
                  <span className="ck-util">{formatRelativeTime(item.lastUsedAt)}</span>
                </div>
                <ItemActions
                  item={item}
                  onCopy={() => void handleCopy(item)}
                  onView={item.kind === 'image' ? () => void handleViewImage(item) : undefined}
                  onOpenFile={item.kind === 'file' ? () => void handleOpenFile(item) : undefined}
                  onShowFolder={item.kind === 'file' ? () => void handleShowInFolder(item) : undefined}
                  onPin={() => void handleTogglePin(item)}
                  onRemove={() => void handleRemove(item)}
                />
              </div>
            ))}
          </>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
        <ModalOverlay />
        <ModalContent maxW="90vw" maxH="90vh">
          <ModalCloseButton />
          <ModalBody p={4}>
            {viewingImage && (
              <Box textAlign="center">
                <Image
                  src={viewingImage.src}
                  alt="预览"
                  maxW="100%"
                  maxH="70vh"
                  objectFit="contain"
                  display="inline-block"
                />
                <Box mt={3} fontSize="sm" color="gray.600">
                  {viewingImage.meta && (
                    <>
                      {viewingImage.meta.width}×{viewingImage.meta.height} · {humanSize(viewingImage.meta.sizeBytes)}
                    </>
                  )}
                </Box>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
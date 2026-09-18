import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Heading,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  Spinner,
  Text,
  Tooltip,
  VStack,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import {
  Clipboard,
  Copy,
  Eye,
  ExternalLink,
  File as FileIcon,
  Folder,
  FolderOpen,
  ImageIcon,
  RefreshCw,
  Search,
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
        <ImageIcon size={16} color="#A0AEC0" />
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
      <VStack align="stretch" spacing={0.5} flex={1} minW={0}>
        <HStack spacing={2} align="center">
          <ClipboardThumb id={item.id} alt={m?.filename ?? '图片'} />
          <Text fontSize="sm" color="gray.600" noOfLines={1}>
            {m ? `${m.width}×${m.height}` : '图片'}
          </Text>
          {m && <Text fontSize="xs" color="gray.400">{humanSize(m.sizeBytes)}</Text>}
        </HStack>
      </VStack>
    );
  }
  if (item.kind === 'file') {
    const m = item.meta?.file;
    return (
      <VStack align="stretch" spacing={0.5} flex={1} minW={0}>
        <HStack spacing={2} align="center">
          <Box mt="2px" flexShrink={0} color={m?.isDir ? 'blue.500' : 'gray.500'}>
            {m?.isDir ? <Folder size={16} /> : <FileIcon size={16} />}
          </Box>
          <Tooltip label={m?.path ?? ''} placement="top" hasArrow>
            <Text fontSize="sm" noOfLines={1} wordBreak="break-all">{m?.name ?? item.content}</Text>
          </Tooltip>
        </HStack>
        <HStack spacing={2} fontSize="xs" color="gray.500">
          <Text>{m && m.sizeBytes > 0 ? humanSize(m.sizeBytes) : (m?.isDir ? '文件夹' : '文件')}</Text>
        </HStack>
      </VStack>
    );
  }
  // text / richtext
  return (
    <VStack align="stretch" spacing={0.5} flex={1} minW={0}>
      <Text fontSize="sm" noOfLines={2} wordBreak="break-all">
        {previewText(item.content)}
      </Text>
      <HStack spacing={2} fontSize="xs" color="gray.500">
        <Text>{formatRelativeTime(item.lastUsedAt)}</Text>
        <Text>·</Text>
        <Text>{item.length} 字符</Text>
        {item.kind === 'richtext' && (
          <>
            <Text>·</Text>
            <Tooltip label="保留 HTML 格式，粘贴到富文本编辑器不失真" hasArrow>
              <Text color="purple.500" fontWeight="medium">富文本</Text>
            </Tooltip>
          </>
        )}
        {item.copyCount > 0 && (
          <>
            <Text>·</Text>
            <Text>已复制 {item.copyCount} 次</Text>
          </>
        )}
      </HStack>
    </VStack>
  );
}

/** 按 kind 显示不同的操作按钮（仅图标） */
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
    <HStack spacing={1} flexShrink={0}>
      {/* 复制按钮（所有类型） */}
      <Tooltip label="复制到剪贴板">
        <IconButton
          aria-label="复制"
          size="xs"
          variant="ghost"
          colorScheme="gray"
          icon={<Copy size={14} />}
          onClick={onCopy}
        />
      </Tooltip>

      {/* 图片：查看大图 */}
      {item.kind === 'image' && onView && (
        <Tooltip label="查看大图">
          <IconButton
            aria-label="查看"
            size="xs"
            variant="ghost"
            colorScheme="blue"
            icon={<Eye size={14} />}
            onClick={onView}
          />
        </Tooltip>
      )}

      {/* 文件：打开文件 + 在Finder显示 */}
      {item.kind === 'file' && (
        <>
          {onOpenFile && (
            <Tooltip label="打开文件">
              <IconButton
                aria-label="打开"
                size="xs"
                variant="ghost"
                colorScheme="blue"
                icon={<ExternalLink size={14} />}
                onClick={onOpenFile}
              />
            </Tooltip>
          )}
          {onShowFolder && (
            <Tooltip label="在 Finder 中显示">
              <IconButton
                aria-label="显示"
                size="xs"
                variant="ghost"
                colorScheme="blue"
                icon={<FolderOpen size={14} />}
                onClick={onShowFolder}
              />
            </Tooltip>
          )}
        </>
      )}

      {/* 置顶 */}
      <Tooltip label={item.pinned ? '取消置顶' : '置顶'}>
        <IconButton
          aria-label="置顶"
          size="xs"
          variant="ghost"
          colorScheme={item.pinned ? 'yellow' : 'gray'}
          icon={<Star size={14} fill={item.pinned ? 'currentColor' : 'none'} />}
          onClick={onPin}
        />
      </Tooltip>

      {/* 删除 */}
      <Tooltip label="删除">
        <IconButton
          aria-label="删除"
          size="xs"
          variant="ghost"
          colorScheme="red"
          icon={<X size={14} />}
          onClick={onRemove}
        />
      </Tooltip>
    </HStack>
  );
}

export default function ClipboardHistory() {
  const toast = useToast();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [kindFilter, setKindFilter] = useState<ClipboardKind | 'all'>('all');

  // 图片预览弹窗
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
      // 加载完整图片（readThumbnail返回dataURL，这里为演示用缩略图；生产应读完整图）
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
    <Flex direction="column" h="100%" p={4} gap={3}>
      {/* 顶部工具栏 */}
      <Flex align="center" gap={3}>
        <HStack spacing={2}>
          <Clipboard size={18} />
          <Heading size="md">剪贴板历史</Heading>
        </HStack>
        <Box flex={1} />
        <InputGroup size="sm" maxW="220px">
          <InputLeftElement pointerEvents="none">
            <Search size={13} color="#A0AEC0" />
          </InputLeftElement>
          <Input
            placeholder="搜索复制过的内容…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </InputGroup>
        <Tooltip label={pinnedOnly ? '显示全部' : '只看置顶'}>
          <Button
            size="sm"
            variant={pinnedOnly ? 'solid' : 'ghost'}
            colorScheme={pinnedOnly ? 'yellow' : 'gray'}
            onClick={() => setPinnedOnly((v) => !v)}
            leftIcon={<Star size={13} fill={pinnedOnly ? 'currentColor' : 'none'} />}
          >
            置顶
          </Button>
        </Tooltip>
        <Text fontSize="xs" color="gray.500" flexShrink={0}>共 {items.length} 条</Text>
        <Button size="xs" variant="ghost" onClick={() => void load()} isLoading={loading} leftIcon={<RefreshCw size={12} />}>
          刷新
        </Button>
        <Button size="xs" variant="ghost" colorScheme="red" onClick={() => void handleClear()} leftIcon={<Trash2 size={12} />}>
          清空
        </Button>
      </Flex>

      {/* 类型筛选 */}
      <HStack spacing={1}>
        {KIND_FILTERS.map((f) => (
          <Button
            key={f.key}
            size="xs"
            variant={kindFilter === f.key ? 'solid' : 'ghost'}
            colorScheme={kindFilter === f.key ? 'blue' : 'gray'}
            leftIcon={f.icon}
            onClick={() => setKindFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </HStack>

      {/* 列表 */}
      <Box flex={1} minH={0} borderWidth="1px" borderRadius="md" overflow="auto">
        {loading && items.length === 0 ? (
          <Flex align="center" justify="center" h="100%"><Spinner size="sm" /></Flex>
        ) : items.length === 0 ? (
          <Flex align="center" justify="center" h="100%" color="gray.500" fontSize="sm">
            <VStack spacing={2}>
              <Clipboard size={22} />
              <Text>{keyword || pinnedOnly || kindFilter !== 'all' ? '没有匹配的记录' : '暂无剪贴板历史，复制任意内容即可记录'}</Text>
            </VStack>
          </Flex>
        ) : (
          <VStack align="stretch" spacing={0} divider={<Divider />}>
            {items.map((item) => (
              <Flex
                key={item.id}
                className="clip-row"
                px={3}
                py={2}
                align="flex-start"
                gap={2}
                bg={item.pinned ? 'yellow.50' : 'transparent'}
                _hover={{ bg: item.pinned ? 'yellow.100' : 'gray.50' }}
                sx={{
                  '& .clip-actions': { opacity: 0 },
                  '&:hover .clip-actions': { opacity: 1 },
                }}
              >
                {/* 置顶标记 */}
                <Box mt="3px" flexShrink={0} w="16px">
                  {item.pinned && <Star size={14} color="#D69E2E" fill="#D69E2E" />}
                </Box>

                {/* 内容主体 */}
                <ItemBody item={item} />

                {/* 操作按钮（悬浮显示）*/}
                <Box className="clip-actions" onClick={(e) => e.stopPropagation()} transition="opacity 0.15s">
                  <ItemActions
                    item={item}
                    onCopy={() => void handleCopy(item)}
                    onView={item.kind === 'image' ? () => void handleViewImage(item) : undefined}
                    onOpenFile={item.kind === 'file' ? () => void handleOpenFile(item) : undefined}
                    onShowFolder={item.kind === 'file' ? () => void handleShowInFolder(item) : undefined}
                    onPin={() => void handleTogglePin(item)}
                    onRemove={() => void handleRemove(item)}
                  />
                </Box>
              </Flex>
            ))}
          </VStack>
        )}
      </Box>

      {/* 图片预览弹窗 */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
        <ModalOverlay />
        <ModalContent maxW="90vw" maxH="90vh">
          <ModalCloseButton />
          <ModalBody p={4}>
            {viewingImage && (
              <VStack spacing={3} align="center">
                <Image
                  src={viewingImage.src}
                  alt="预览"
                  maxW="100%"
                  maxH="70vh"
                  objectFit="contain"
                />
                <HStack fontSize="sm" color="gray.600">
                  {viewingImage.meta && (
                    <>
                      <Text>{viewingImage.meta.width}×{viewingImage.meta.height}</Text>
                      <Text>·</Text>
                      <Text>{humanSize(viewingImage.meta.sizeBytes)}</Text>
                    </>
                  )}
                </HStack>
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Flex>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Spinner,
  Text,
  Tooltip,
  VStack,
  useToast,
} from '@chakra-ui/react';
import {
  Check,
  Clipboard,
  Copy,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { ClipboardItem } from '../../src/shared/types';

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

/** 内容预览：折叠空白、截断显示。 */
function previewText(content: string, max = 160): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export default function ClipboardHistory() {
  const toast = useToast();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.assistant.clipboard.list({
        keyword: keyword.trim() || undefined,
        pinnedOnly: pinnedOnly || undefined,
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
  }, [keyword, pinnedOnly, toast]);

  // 首次加载 + 筛选变化时重载
  useEffect(() => {
    void load();
  }, [load]);

  // 主进程推送剪贴板变更时实时刷新
  useEffect(() => {
    const unsubscribe = window.assistant.clipboard.onUpdate?.(() => {
      void load();
    });
    return () => {
      unsubscribe?.();
    };
  }, [load]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  async function handleCopy(item: ClipboardItem) {
    try {
      await window.assistant.clipboard.copy(item.id);
      setCopiedId(item.id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 1500);
      toast({ status: 'success', title: '已复制到剪贴板', duration: 1500, isClosable: false });
    } catch (err) {
      toast({
        status: 'error',
        title: '复制失败',
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
        <InputGroup size="sm" maxW="240px">
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

      {/* 列表 */}
      <Box flex={1} minH={0} borderWidth="1px" borderRadius="md" overflow="auto">
        {loading && items.length === 0 ? (
          <Flex align="center" justify="center" h="100%"><Spinner size="sm" /></Flex>
        ) : items.length === 0 ? (
          <Flex align="center" justify="center" h="100%" color="gray.500" fontSize="sm">
            <VStack spacing={2}>
              <Clipboard size={22} />
              <Text>{keyword || pinnedOnly ? '没有匹配的记录' : '暂无剪贴板历史，复制任意文本即可记录'}</Text>
            </VStack>
          </Flex>
        ) : (
          <VStack align="stretch" spacing={0} divider={<Divider />}>
            {items.map((item) => {
              const justCopied = copiedId === item.id;
              return (
                <Flex
                  key={item.id}
                  className="clip-row"
                  px={3}
                  py={2}
                  align="flex-start"
                  gap={2}
                  cursor="pointer"
                  bg={item.pinned ? 'yellow.50' : 'transparent'}
                  _hover={{ bg: item.pinned ? 'yellow.100' : 'gray.50' }}
                  onClick={() => void handleCopy(item)}
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
                  <VStack align="stretch" spacing={0.5} flex={1} minW={0}>
                    <Text fontSize="sm" noOfLines={2} wordBreak="break-all">
                      {previewText(item.content)}
                    </Text>
                    <HStack spacing={2} fontSize="xs" color="gray.500">
                      <Text>{formatRelativeTime(item.lastUsedAt)}</Text>
                      <Text>·</Text>
                      <Text>{item.length} 字符</Text>
                      {item.copyCount > 0 && (
                        <>
                          <Text>·</Text>
                          <Text>已复制 {item.copyCount} 次</Text>
                        </>
                      )}
                    </HStack>
                  </VStack>

                  {/* 操作按钮 */}
                  <HStack
                    className="clip-actions"
                    spacing={1}
                    flexShrink={0}
                    onClick={(e) => e.stopPropagation()}
                    transition="opacity 0.15s"
                  >
                    <Tooltip label={justCopied ? '已复制' : '复制回剪贴板'}>
                      <IconButton
                        aria-label="复制"
                        size="xs"
                        variant="ghost"
                        colorScheme={justCopied ? 'green' : 'gray'}
                        icon={justCopied ? <Check size={14} /> : <Copy size={14} />}
                        onClick={() => void handleCopy(item)}
                      />
                    </Tooltip>
                    <Tooltip label={item.pinned ? '取消置顶' : '置顶'}>
                      <IconButton
                        aria-label="置顶"
                        size="xs"
                        variant="ghost"
                        colorScheme={item.pinned ? 'yellow' : 'gray'}
                        icon={<Star size={14} fill={item.pinned ? 'currentColor' : 'none'} />}
                        onClick={() => void handleTogglePin(item)}
                      />
                    </Tooltip>
                    <Tooltip label="删除">
                      <IconButton
                        aria-label="删除"
                        size="xs"
                        variant="ghost"
                        colorScheme="red"
                        icon={<X size={14} />}
                        onClick={() => void handleRemove(item)}
                      />
                    </Tooltip>
                  </HStack>
                </Flex>
              );
            })}
          </VStack>
        )}
      </Box>
    </Flex>
  );
}

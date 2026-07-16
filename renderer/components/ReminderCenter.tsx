import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Heading,
  Select,
  Spinner,
  Text,
  Textarea,
  VStack,
  useToast,
} from '@chakra-ui/react';
import { AlertTriangle, Bell, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import type { Reminder, ReminderAction, ReminderSeverity, ReminderStatus, ReminderType } from '../../src/shared/types';

const STATUS_OPTIONS: { value: ReminderStatus; label: string }[] = [
  { value: 'active', label: '活跃' },
  { value: 'done', label: '已完成' },
  { value: 'dismissed', label: '已忽略' },
];

function TypeDot({ type }: { type: ReminderType }) {
  const color = type === 'action' ? '#F59E0B' : '#3B82F6';
  return (
    <Box
      w="10px"
      h="10px"
      borderRadius="full"
      bg={color}
      flexShrink={0}
      mt="6px"
      title={type === 'action' ? '需处理' : '告知'}
    />
  );
}

function SeverityIcon({ severity }: { severity: ReminderSeverity }) {
  if (severity === 'error') return <AlertTriangle size={14} color="#DC2626" />;
  if (severity === 'warning') return <AlertTriangle size={14} color="#F59E0B" />;
  return <Info size={14} color="#6B7280" />;
}

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

export default function ReminderCenter() {
  const [status, setStatus] = useState<ReminderStatus>('active');
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.assistant.reminder.list({ status, limit: 100 });
      setItems(list ?? []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // 兜底轮询：即使事件通道断开也保证列表最终一致
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    // 主进程广播的 reminder:update 事件到达时立即重载，无需等轮询
    const unsubscribe = window.assistant.reminder.onUpdate?.(() => {
      void load();
    });
    return () => {
      unsubscribe?.();
    };
  }, [load]);

  const selected = useMemo(() => items.find((it) => it.id === selectedId) ?? null, [items, selectedId]);

  return (
    <Flex direction="column" h="100%" p={4} gap={3}>
      <Flex align="center" gap={3}>
        <HStack spacing={2}>
          <Bell size={18} />
          <Heading size="md">提醒中心</Heading>
        </HStack>
        <Box flex={1} />
        <Select
          size="sm"
          w="120px"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ReminderStatus);
            setSelectedId(null);
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Text fontSize="xs" color="gray.500">共 {items.length} 条</Text>
        <Button size="xs" variant="ghost" onClick={() => void load()} isLoading={loading} leftIcon={<RefreshCw size={12} />}>
          刷新
        </Button>
      </Flex>

      <Flex flex={1} minH={0} gap={3}>
        {/* 列表 */}
        <Box flex="0 0 55%" borderWidth="1px" borderRadius="md" overflow="auto">
          {loading && items.length === 0 ? (
            <Flex align="center" justify="center" h="100%"><Spinner size="sm" /></Flex>
          ) : items.length === 0 ? (
            <Flex align="center" justify="center" h="100%" color="gray.500" fontSize="sm">
              <VStack spacing={2}>
                <CheckCircle2 size={20} />
                <Text>暂无提醒</Text>
              </VStack>
            </Flex>
          ) : (
            <VStack align="stretch" spacing={0} divider={<Divider />}>
              {items.map((it) => (
                <Box
                  key={it.id}
                  px={3}
                  py={2}
                  cursor="pointer"
                  bg={selectedId === it.id ? 'blue.50' : 'transparent'}
                  _hover={{ bg: selectedId === it.id ? 'blue.50' : 'gray.50' }}
                  onClick={() => setSelectedId(it.id)}
                >
                  <HStack align="flex-start" spacing={2}>
                    <TypeDot type={it.type} />
                    <VStack align="stretch" spacing={1} flex={1} minW={0}>
                      <HStack spacing={2}>
                        <Text fontSize="xs" color="gray.500">{it.source}</Text>
                        <SeverityIcon severity={it.severity} />
                        <Badge fontSize="10px" colorScheme={it.type === 'action' ? 'orange' : 'blue'}>
                          {it.type === 'action' ? '需处理' : '告知'}
                        </Badge>
                      </HStack>
                      <Text fontSize="sm" noOfLines={2}>{it.title}</Text>
                      <Text fontSize="xs" color="gray.400">{formatRelativeTime(it.createdAt)}</Text>
                    </VStack>
                  </HStack>
                </Box>
              ))}
            </VStack>
          )}
        </Box>

        {/* 详情 */}
        <Box flex={1} borderWidth="1px" borderRadius="md" p={3} overflow="auto">
          {!selected ? (
            <Flex align="center" justify="center" h="100%" color="gray.400" fontSize="sm">
              选中左侧一条查看详情
            </Flex>
          ) : (
            <VStack align="stretch" spacing={3}>
              <HStack>
                <TypeDot type={selected.type} />
                <Heading size="sm" flex={1}>{selected.title}</Heading>
              </HStack>
              <HStack fontSize="xs" color="gray.600" spacing={3} flexWrap="wrap">
                <Text>来源：{selected.source}</Text>
                <Text>类型：{selected.type}</Text>
                <Text>严重：{selected.severity}</Text>
                <Text>状态：{selected.status}</Text>
                {selected.key && <Text>key：{selected.key}</Text>}
              </HStack>
              <HStack fontSize="xs" color="gray.500" spacing={3}>
                <Text>创建：{formatRelativeTime(selected.createdAt)}</Text>
                {selected.doneAt && <Text>完成：{formatRelativeTime(selected.doneAt)}</Text>}
              </HStack>
              {selected.body && (
                <Box>
                  <Text fontSize="xs" color="gray.500" mb={1}>正文</Text>
                  <Box p={2} bg="gray.50" borderRadius="sm" fontSize="sm" whiteSpace="pre-wrap">{selected.body}</Box>
                </Box>
              )}
              {selected.metadata && (
                <Box>
                  <Text fontSize="xs" color="gray.500" mb={1}>metadata</Text>
                  <Box p={2} bg="gray.50" borderRadius="sm" fontSize="xs" fontFamily="mono" whiteSpace="pre-wrap">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </Box>
                </Box>
              )}
              <ReminderResponsePanel reminder={selected} onDone={() => { void load(); setSelectedId(selected.id); }} />
              <Text fontSize="10px" color="gray.400">id: {selected.id}</Text>
            </VStack>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}

interface ResponsePanelProps {
  reminder: Reminder;
  onDone: () => void;
}

function buttonColorScheme(style?: ReminderAction['style']): string | undefined {
  if (style === 'primary') return 'blue';
  if (style === 'danger') return 'red';
  return undefined;
}

function ReminderResponsePanel({ reminder, onDone }: ResponsePanelProps) {
  const toast = useToast();
  const [pendingAction, setPendingAction] = useState<ReminderAction | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPendingAction(null);
    setReason('');
  }, [reminder.id]);

  async function submit(action: ReminderAction, reasonValue?: string) {
    setSubmitting(true);
    try {
      await window.assistant.reminder.respond({
        id: reminder.id,
        actionId: action.id,
        reason: reasonValue,
      });
      onDone();
    } catch (err) {
      toast({
        status: 'error',
        title: '响应失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
      setPendingAction(null);
      setReason('');
    }
  }

  async function dismiss() {
    setSubmitting(true);
    try {
      await window.assistant.reminder.dismiss(reminder.id);
      onDone();
    } catch (err) {
      toast({
        status: 'error',
        title: '忽略失败',
        description: err instanceof Error ? err.message : String(err),
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // 已响应：展示响应摘要
  if (reminder.status === 'done' && reminder.response) {
    const label =
      reminder.actions?.find((a) => a.id === reminder.response!.actionId)?.label ?? reminder.response.actionId;
    return (
      <Box borderTopWidth="1px" pt={3} mt={1}>
        <HStack spacing={2} fontSize="sm">
          <CheckCircle2 size={14} />
          <Text>已响应：<b>{label}</b> · {formatRelativeTime(reminder.response.respondedAt)}</Text>
        </HStack>
        {reminder.response.reason && (
          <Box mt={2} p={2} bg="gray.50" borderRadius="sm" fontSize="sm" whiteSpace="pre-wrap">
            {reminder.response.reason}
          </Box>
        )}
      </Box>
    );
  }

  // 已忽略
  if (reminder.status === 'dismissed') {
    return (
      <Box borderTopWidth="1px" pt={3} mt={1}>
        <Text fontSize="sm" color="gray.500">已忽略 · {formatRelativeTime(reminder.doneAt ?? reminder.updatedAt)}</Text>
      </Box>
    );
  }

  // 活跃但没有 actions（notify 类），只给一个忽略入口
  if (!reminder.actions || reminder.actions.length === 0) {
    if (reminder.type !== 'action') return null;
    return (
      <Box borderTopWidth="1px" pt={3} mt={1}>
        <Button size="sm" variant="ghost" onClick={() => void dismiss()} isLoading={submitting}>
          忽略这条
        </Button>
      </Box>
    );
  }

  return (
    <Box borderTopWidth="1px" pt={3} mt={1}>
      <Text fontSize="xs" color="gray.500" mb={2}>请选择一个响应</Text>
      <HStack spacing={2} flexWrap="wrap">
        {reminder.actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            colorScheme={buttonColorScheme(action.style)}
            variant={action.style === 'primary' || action.style === 'danger' ? 'solid' : 'outline'}
            isDisabled={submitting}
            onClick={() => {
              if (action.requiresReason) {
                setPendingAction((prev) => (prev?.id === action.id ? null : action));
                setReason('');
              } else {
                void submit(action);
              }
            }}
          >
            {action.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => void dismiss()} isDisabled={submitting}>
          忽略
        </Button>
      </HStack>
      {pendingAction && (
        <Box mt={3}>
          <Text fontSize="xs" color="gray.600" mb={1}>
            按 <b>{pendingAction.label}</b> 需要填写理由
          </Text>
          <Textarea
            size="sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="请说明理由..."
            rows={2}
            isDisabled={submitting}
          />
          <HStack mt={2} spacing={2}>
            <Button
              size="sm"
              colorScheme={buttonColorScheme(pendingAction.style) ?? 'blue'}
              isDisabled={!reason.trim() || submitting}
              isLoading={submitting}
              onClick={() => void submit(pendingAction, reason.trim())}
            >
              提交 {pendingAction.label}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setPendingAction(null); setReason(''); }}>
              取消
            </Button>
          </HStack>
        </Box>
      )}
    </Box>
  );
}

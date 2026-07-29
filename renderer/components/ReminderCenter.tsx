import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Heading,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Select,
  Spinner,
  Text,
  Textarea,
  VStack,
  useToast,
} from '@chakra-ui/react';
import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  Clock,
  Folder,
  Info,
  RefreshCw, ChevronDown,
} from 'lucide-react';
import type { Reminder, ReminderAction, ReminderSeverity, ReminderStatus, ReminderType } from '../../src/shared/types';

// 筛选状态：增加 "全部" 选项
const STATUS_OPTIONS: { value: ReminderStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
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

// Agent 标记
function AgentBadge({ agentId, priority }: { agentId: string | null; priority: string | null }) {
  if (!agentId) return null;
  return (
    <HStack spacing={0.5}>
      <Badge
        variant="solid"
        colorScheme={priority === 'high' ? 'red' : 'purple'}
        size="sm"
        px={1.5}
        py={0}
        fontSize="10px"
        borderRadius="full"
      >
        <Bot size={10} style={{ display: 'inline', marginRight: 2 }} />
        {agentId}
      </Badge>
    </HStack>
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
  const [status, setStatus] = useState<ReminderStatus | 'all'>('all');
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // status === 'all' 时不传过滤参数，返回全部
      const filterStatus = status === 'all' ? undefined : status;
      let list = await window.assistant.reminder.list({ status: filterStatus, limit: 100 });
      if (projectFilter !== 'all') {
        list = list.filter((item) => item.project === projectFilter);
      }
      setItems(list ?? []);
    } finally {
      setLoading(false);
    }
  }, [status, projectFilter]);

  const projects = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.project) set.add(item.project);
    });
    return Array.from(set).sort();
  }, [items]);

  const selected = useMemo(() => items.find((it) => it.id === selectedId) ?? null, [items, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const unsubscribe = window.assistant.reminder.onUpdate?.(() => {
      void load();
    });
    return () => {
      unsubscribe?.();
    };
  }, [load]);

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
            setStatus(e.target.value as ReminderStatus | 'all');
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
        {projects.length > 0 && (
          <Menu>
            <MenuButton as={Button} size="xs" variant="ghost" rightIcon={<ChevronDown size={12} />}>
              <HStack spacing={1}>
                <Folder size={12} />
                <Text>{projectFilter === 'all' ? '全部项目' : projectFilter}</Text>
              </HStack>
            </MenuButton>
            <MenuList>
              <MenuItem onClick={() => setProjectFilter('all')}>全部项目</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p} onClick={() => setProjectFilter(p)}>{p}</MenuItem>
              ))}
            </MenuList>
          </Menu>
        )}
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
                    {it.agentId && <Bot size={14} color="#9333EA" />}
                    <VStack align="stretch" spacing={0.5} flex={1} minW={0}>
                      <HStack spacing={2} minW={0}>
                        <Text fontSize="sm" fontWeight="medium" noOfLines={1} flex={1}>
                          {it.title}
                        </Text>
                        <Text fontSize="xs" color="gray.500" flexShrink={0}>
                          {formatRelativeTime(it.createdAt)}
                        </Text>
                      </HStack>
                      <HStack spacing={2}>
                        {it.stage && (
                          <Badge size="sm" variant="subtle" colorScheme={
                            it.stage === 'done' ? 'green' : 
                            it.stage === 'blocked' ? 'red' : 
                            it.stage === 'progress' ? 'orange' : 'blue'
                          } fontSize="10px" px={1.5} py={0}>
                            {it.stage}
                          </Badge>
                        )}
                        {!it.stage && <SeverityIcon severity={it.severity} />}
                        {it.project && (
                          <Badge size="sm" variant="outline" colorScheme="gray" fontSize="10px" px={1.5} py={0}>
                            {it.project}
                          </Badge>
                        )}
                        {it.body && (
                          <Text fontSize="xs" color="gray.500" noOfLines={1}>
                            {it.body}
                          </Text>
                        )}
                      </HStack>
                      {it.agentId && (
                        <HStack spacing={2} mt={1}>
                          <Badge size="sm" variant="subtle" colorScheme="purple" fontSize="10px" px={1.5} py={0}>
                            Agent: {it.agentId}
                          </Badge>
                          {it.topic && (
                            <Text fontSize="xs" color="gray.400">
                              {it.topic}
                            </Text>
                          )}
                        </HStack>
                      )}
                    </VStack>
                  </HStack>
                </Box>
              ))}
            </VStack>
          )}
        </Box>

        {/* 详情 */}
        <VStack flex="1" align="stretch" spacing={0} borderWidth="1px" borderRadius="md" overflow="hidden">
          {!selected ? (
            <Flex align="center" justify="center" h="100%" color="gray.500" fontSize="sm">
              请选择一条提醒查看详情
            </Flex>
          ) : (
            <>
              {/* 头部 */}
              <VStack align="stretch" spacing={2} p={3} borderBottomWidth="1px">
                <Flex align="center" gap={2}>
                  <Heading size="sm">{selected.title}</Heading>
                  <Box flex={1} />
                  <AgentBadge agentId={selected.agentId} priority={selected.priority} />
                </Flex>

                <HStack spacing={3} flexWrap="wrap">
                  <HStack spacing={1} fontSize="xs" color="gray.500">
                    <Clock size={12} />
                    <Text>创建：{formatRelativeTime(selected.createdAt)}</Text>
                  </HStack>
                  <HStack spacing={1} fontSize="xs" color="gray.500">
                    <Text>更新：{formatRelativeTime(selected.updatedAt)}</Text>
                  </HStack>
                  {selected.project && (
                    <HStack spacing={1} fontSize="xs">
                      <Folder size={12} />
                      <Text>{selected.project}</Text>
                    </HStack>
                  )}
                  {selected.topic && (
                    <Badge size="sm" variant="subtle" colorScheme="gray" fontSize="10px">
                      {selected.topic}
                    </Badge>
                  )}
                </HStack>
              </VStack>

              {/* 内容区域 - 简单的预格式化文本 */}
              <Box flex={1} overflow="auto" p={3}>
                {selected.body ? (
                  <Box fontSize="sm" whiteSpace="pre-wrap" fontFamily={selected.agentId ? 'monospace' : 'inherit'}>
                    {selected.body}
                  </Box>
                ) : null}
              </Box>

              {/* 响应面板 */}
              <Box p={3} borderTopWidth="1px">
                <ReminderResponsePanel reminder={selected} />
              </Box>
            </>
          )}
        </VStack>
      </Flex>
    </Flex>
  );
}

function buttonColorScheme(style?: ReminderAction['style']): string | undefined {
  if (style === 'primary') return 'blue';
  if (style === 'danger') return 'red';
  return undefined;
}

function ReminderResponsePanel({ reminder }: { reminder: Reminder }) {
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

  if (reminder.status === 'done' && reminder.response) {
    const label =
      reminder.actions?.find((a) => a.id === reminder.response!.actionId)?.label ?? reminder.response.actionId;
    return (
      <HStack spacing={2} fontSize="sm">
        <CheckCircle2 size={14} />
        <Text>已响应：<b>{label}</b> · {formatRelativeTime(reminder.response.respondedAt)}</Text>
      </HStack>
    );
  }

  if (reminder.status === 'dismissed') {
    return <Text fontSize="sm" color="gray.500">已忽略 · {formatRelativeTime(reminder.doneAt ?? reminder.updatedAt)}</Text>;
  }

  if (!reminder.actions || reminder.actions.length === 0) {
    if (reminder.type !== 'action') return null;
    return (
      <Button size="sm" variant="ghost" onClick={() => void dismiss()} isLoading={submitting}>
        忽略这条
      </Button>
    );
  }

  return (
    <VStack align="stretch" spacing={2}>
      <Text fontSize="xs" color="gray.500">请选择一个响应</Text>
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
        <VStack align="stretch" spacing={2} mt={2}>
          <Text fontSize="xs" color="gray.600">
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
          <HStack spacing={2}>
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
        </VStack>
      )}
    </VStack>
  );
}

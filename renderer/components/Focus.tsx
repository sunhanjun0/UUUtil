import React, { useState, useEffect } from 'react';
import {
  Box, Button, Flex, Input, Select, Heading, Text, Badge, Stack,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  useDisclosure, VStack, HStack, Divider, Tooltip, Textarea,
  Card, CardHeader, CardBody, CardFooter, Tag as ChakraTag, TagCloseButton, TagLabel, useToast,
} from '@chakra-ui/react';
import {
  Clock, Plus, Trash2, Tag, Calendar, ChevronDown, ChevronUp,
  Target, TrendingUp, AlertCircle, Eye, EyeOff, History, Play, Square,
} from 'lucide-react';
import type { FocusArea, FocusTag, FocusSession, FocusStats, FocusMigration, FocusHorizon, FocusStatus, FocusImportance } from '../../src/shared/types';

const horizonLabels: Record<FocusHorizon, string> = {
  current_core: '当前核心',
  near_term: '近期关注',
  long_term: '长期规划',
  watching: '观察中',
  archived: '已归档',
};

const horizonColors: Record<FocusHorizon, string> = {
  current_core: 'red',
  near_term: 'orange',
  long_term: 'blue',
  watching: 'gray',
  archived: 'gray',
};

const statusLabels: Record<FocusStatus, string> = {
  active: '活跃',
  watching: '观察',
  paused: '暂停',
  migrated: '已迁移',
  completed: '完成',
};

const statusColors: Record<FocusStatus, string> = {
  active: 'green',
  watching: 'blue',
  paused: 'yellow',
  migrated: 'purple',
  completed: 'gray',
};

const importanceLabels: Record<FocusImportance, string> = {
  critical: '至关重要',
  high: '高',
  medium: '中',
  low: '低',
};

const importanceColors: Record<FocusImportance, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'blue',
  low: 'gray',
};

export default function Focus() {
  const toast = useToast();
  const [areas, setAreas] = useState<FocusArea[]>([]);
  const [tags, setTags] = useState<FocusTag[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [migrations, setMigrations] = useState<FocusMigration[]>([]);
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [filterHorizon, setFilterHorizon] = useState<FocusHorizon | undefined>('current_core');
  const [filterStatus, setFilterStatus] = useState<FocusStatus | undefined>(undefined);
  const [filterTag, setFilterTag] = useState<string | undefined>(undefined);
  const [filterImportance, setFilterImportance] = useState<FocusImportance | undefined>(undefined);
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { isOpen: isAreaOpen, onOpen: onAreaOpen, onClose: onAreaClose } = useDisclosure();
  const { isOpen: isTagOpen, onOpen: onTagOpen, onClose: onTagClose } = useDisclosure();
  const { isOpen: isEndSessionOpen, onOpen: onEndSessionOpen, onClose: onEndSessionClose } = useDisclosure();
  const { isOpen: isMigrateOpen, onOpen: onMigrateOpen, onClose: onMigrateClose } = useDisclosure();

  const [editingArea, setEditingArea] = useState<FocusArea | null>(null);
  const [migratingArea, setMigratingArea] = useState<FocusArea | null>(null);
  const [endSessionNotes, setEndSessionNotes] = useState('');
  const [migrateReason, setMigrateReason] = useState('');
  const [migrateToHorizon, setMigrateToHorizon] = useState<FocusHorizon>('near_term');

  // 表单状态
  const [areaName, setAreaName] = useState('');
  const [areaDescription, setAreaDescription] = useState('');
  const [areaWhyImportant, setAreaWhyImportant] = useState('');
  const [areaDesiredOutcome, setAreaDesiredOutcome] = useState('');
  const [areaHorizon, setAreaHorizon] = useState<FocusHorizon>('near_term');
  const [areaStatus, setAreaStatus] = useState<FocusStatus>('active');
  const [areaImportance, setAreaImportance] = useState<FocusImportance>('medium');
  const [areaTagIds, setAreaTagIds] = useState<string[]>([]);
  const [areaNextReviewAt, setAreaNextReviewAt] = useState('');
  const [areaContextLinks, setAreaContextLinks] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');

  useEffect(() => {
    loadData();
    checkActiveSession();
  }, []);

  useEffect(() => {
    loadAreas();
  }, [filterHorizon, filterStatus, filterTag, filterImportance]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (activeSession) {
      interval = setInterval(() => {
        setSessionTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeSession]);

  async function loadData() {
    try {
      const [tagsData, statsData, sessionsData] = await Promise.all([
        window.assistant.focus.getTags(),
        window.assistant.focus.getStats(),
        window.assistant.focus.getSessions(),
      ]);
      setTags(tagsData);
      setStats(statsData);
      setSessions(sessionsData);
    } catch (err) {
      console.error('加载数据失败:', err);
    }
  }

  async function loadAreas() {
    try {
      const areasData = await window.assistant.focus.getAreas(
        filterHorizon,
        filterStatus,
        filterTag,
        filterImportance
      );
      setAreas(areasData);
    } catch (err) {
      console.error('加载焦点失败:', err);
    }
  }

  async function checkActiveSession() {
    try {
      const allSessions = await window.assistant.focus.getSessions();
      setSessions(allSessions);
      const active = allSessions.find((s) => !s.endTime);
      if (active) {
        setActiveSession(active);
        const start = new Date(active.startTime).getTime();
        const now = Date.now();
        setSessionTimer(Math.floor((now - start) / 1000));
      }
    } catch (err) {
      console.error('检查专注会话失败:', err);
    }
  }

  function openCreateArea() {
    setEditingArea(null);
    setAreaName('');
    setAreaDescription('');
    setAreaWhyImportant('');
    setAreaDesiredOutcome('');
    setAreaHorizon('near_term');
    setAreaStatus('active');
    setAreaImportance('medium');
    setAreaTagIds([]);
    setAreaNextReviewAt('');
    setAreaContextLinks([]);
    onAreaOpen();
  }

  function openEditArea(area: FocusArea) {
    setEditingArea(area);
    setAreaName(area.name);
    setAreaDescription(area.description);
    setAreaWhyImportant(area.whyImportant);
    setAreaDesiredOutcome(area.desiredOutcome || '');
    setAreaHorizon(area.horizon);
    setAreaStatus(area.status);
    setAreaImportance(area.importance);
    setAreaTagIds(area.tagIds);
    setAreaNextReviewAt(area.nextReviewAt ? area.nextReviewAt.split('T')[0] : '');
    setAreaContextLinks(area.contextLinks || []);
    onAreaOpen();
  }

  function openMigrate(area: FocusArea) {
    setMigratingArea(area);
    setMigrateToHorizon(area.horizon);
    setMigrateReason('');
    onMigrateOpen();
  }

  async function handleSaveArea() {
    if (!areaName.trim()) return;

    try {
      const result = editingArea
        ? await window.assistant.focus.updateArea(
          editingArea.id,
          areaName,
          areaDescription,
          areaWhyImportant,
          areaHorizon,
          areaStatus,
          areaImportance,
          areaTagIds,
          areaDesiredOutcome || undefined,
          areaNextReviewAt || undefined,
          areaContextLinks.length > 0 ? areaContextLinks : undefined
        )
        : await window.assistant.focus.createArea(
          areaName,
          areaDescription,
          areaWhyImportant,
          areaHorizon,
          areaStatus,
          areaImportance,
          areaTagIds,
          areaDesiredOutcome || undefined,
          areaNextReviewAt || undefined,
          areaContextLinks.length > 0 ? areaContextLinks : undefined
        );
      if (!result.success) throw new Error(result.error || '保存焦点失败');
      onAreaClose();
      loadAreas();
      loadData();
    } catch (err) {
      console.error('保存焦点失败:', err);
      toast({ title: '保存焦点失败', description: err instanceof Error ? err.message : String(err), status: 'error' });
    }
  }

  async function handleDeleteArea(areaId: string) {
    try {
      const result = await window.assistant.focus.deleteArea(areaId);
      if (!result.success) throw new Error(result.error || '删除焦点失败');
      loadAreas();
      loadData();
    } catch (err) {
      console.error('删除焦点失败:', err);
      toast({ title: '删除焦点失败', description: err instanceof Error ? err.message : String(err), status: 'error' });
    }
  }

  async function handleMigrate() {
    if (!migratingArea) return;
    try {
      const result = await window.assistant.focus.migrateArea(migratingArea.id, migrateToHorizon, migrateReason || undefined);
      if (!result.success) throw new Error(result.error || '迁移失败');
      onMigrateClose();
      loadAreas();
      loadData();
    } catch (err) {
      console.error('迁移失败:', err);
      toast({ title: '迁移失败', description: err instanceof Error ? err.message : String(err), status: 'error' });
    }
  }

  async function handleStartSession(areaId: string) {
    try {
      const result = await window.assistant.focus.startSession(areaId);
      if (result.success && result.sessionId) {
        await checkActiveSession();
      } else {
        throw new Error(result.error || '开始专注失败');
      }
    } catch (err) {
      console.error('开始专注失败:', err);
      toast({ title: '开始专注失败', description: err instanceof Error ? err.message : String(err), status: 'error' });
    }
  }

  async function handleEndSession() {
    if (!activeSession) return;
    try {
      const result = await window.assistant.focus.endSession(activeSession.id, endSessionNotes || undefined);
      if (result.success) {
        setActiveSession(null);
        setSessionTimer(0);
        await loadData();
      } else {
        throw new Error(result.error || '结束专注失败');
      }
    } catch (err) {
      console.error('结束专注失败:', err);
      toast({ title: '结束专注失败', description: err instanceof Error ? err.message : String(err), status: 'error' });
    }
    onEndSessionClose();
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    try {
      const result = await window.assistant.focus.createTag(newTagName, newTagColor);
      if (!result.success) throw new Error(result.error || '创建标签失败');
      setNewTagName('');
      onTagClose();
      loadData();
    } catch (err) {
      console.error('创建标签失败:', err);
      toast({ title: '创建标签失败', description: err instanceof Error ? err.message : String(err), status: 'error' });
    }
  }

  async function handleDeleteTag(tagId: string) {
    try {
      const result = await window.assistant.focus.deleteTag(tagId);
      if (!result.success) throw new Error(result.error || '删除标签失败');
      loadData();
    } catch (err) {
      console.error('删除标签失败:', err);
      toast({ title: '删除标签失败', description: err instanceof Error ? err.message : String(err), status: 'error' });
    }
  }

  async function loadMigrations(areaId: string) {
    try {
      const data = await window.assistant.focus.getMigrations(areaId);
      setMigrations(data);
    } catch (err) {
      console.error('加载迁移历史失败:', err);
    }
  }

  function formatMinutes(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) {
      return `${h}小时${m}分钟`;
    }
    return `${m}分钟`;
  }

  function formatTimer(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function getAreaTotalDuration(areaId: string) {
    return sessions
      .filter((s) => s.focusId === areaId && s.durationMinutes)
      .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  }

  function getAreaSessions(areaId: string) {
    return sessions
      .filter((s) => s.focusId === areaId)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  function toggleTag(tagId: string) {
    if (areaTagIds.includes(tagId)) {
      setAreaTagIds(areaTagIds.filter((id) => id !== tagId));
    } else {
      setAreaTagIds([...areaTagIds, tagId]);
    }
  }

  const horizonOptions: FocusHorizon[] = ['current_core', 'near_term', 'long_term', 'watching', 'archived'];
  const statusOptions: FocusStatus[] = ['active', 'watching', 'paused', 'migrated', 'completed'];
  const importanceOptions: FocusImportance[] = ['critical', 'high', 'medium', 'low'];

  return (
    <Box h="100%" display="flex" flexDirection="column">
      {/* 顶部统计栏 */}
      <Box bg="white" borderBottom="1px" borderColor="gray.200" px={4} py={3}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
          <HStack spacing={4}>
            <Heading size="md" display="flex" alignItems="center" gap={2}>
              <Target size={20} />
              焦点管理
            </Heading>
            {stats && (
              <HStack spacing={2}>
                <Badge colorScheme="red">当前核心 {stats.currentCore}</Badge>
                <Badge colorScheme="orange">近期 {stats.nearTerm}</Badge>
                <Badge colorScheme="blue">长期 {stats.longTerm}</Badge>
                <Badge colorScheme="gray">观察中 {stats.watching}</Badge>
              </HStack>
            )}
          </HStack>

          <HStack spacing={2}>
            {activeSession && (
              <Button size="sm" colorScheme="green" leftIcon={<Clock size={14} />} onClick={onEndSessionOpen}>
                专注中: {formatTimer(sessionTimer)}
              </Button>
            )}
            <Button size="sm" colorScheme={showHistory ? 'purple' : 'gray'} leftIcon={<History size={14} />} onClick={() => setShowHistory(!showHistory)}>
              迁移历史
            </Button>
            <Button size="sm" colorScheme="blue" leftIcon={<Plus size={14} />} onClick={openCreateArea}>
              新建焦点
            </Button>
            <Button size="sm" variant="ghost" leftIcon={<Tag size={14} />} onClick={onTagOpen}>
              标签
            </Button>
          </HStack>
        </Flex>

        {/* 过滤器 */}
        <Flex mt={3} gap={2} wrap="wrap">
          <Select size="sm" w="140px" value={filterHorizon || ''} onChange={(e) => setFilterHorizon((e.target.value as FocusHorizon) || undefined)}>
            <option value="">全部时间层</option>
            {horizonOptions.map((h) => (
              <option key={h} value={h}>{horizonLabels[h]}</option>
            ))}
          </Select>

          <Select size="sm" w="120px" value={filterStatus || ''} onChange={(e) => setFilterStatus((e.target.value as FocusStatus) || undefined)}>
            <option value="">全部状态</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </Select>

          <Select size="sm" w="120px" value={filterImportance || ''} onChange={(e) => setFilterImportance((e.target.value as FocusImportance) || undefined)}>
            <option value="">全部重要性</option>
            {importanceOptions.map((i) => (
              <option key={i} value={i}>{importanceLabels[i]}</option>
            ))}
          </Select>

          <Select size="sm" w="120px" value={filterTag || ''} onChange={(e) => setFilterTag(e.target.value || undefined)}>
            <option value="">全部标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </Select>
        </Flex>
      </Box>

      {/* 内容区 */}
      <Box flex={1} overflowY="auto" p={4} bg="gray.50">
        <VStack spacing={4} align="stretch">
          {areas.length === 0 ? (
            <Box textAlign="center" py={10}>
              <Text color="gray.500">暂无焦点，点击"新建焦点"开始</Text>
            </Box>
          ) : (
            areas.map((area) => (
              <Card key={area.id} variant="outline" bg="white">
                <CardHeader pb={2}>
                  <Flex justify="space-between" align="start">
                    <Box>
                      <Flex align="center" gap={2} mb={1}>
                        <Heading size="sm">{area.name}</Heading>
                        <Badge colorScheme={horizonColors[area.horizon]}>{horizonLabels[area.horizon]}</Badge>
                        <Badge variant="outline" colorScheme={statusColors[area.status]}>{statusLabels[area.status]}</Badge>
                        <Badge variant="subtle" colorScheme={importanceColors[area.importance]}>{importanceLabels[area.importance]}</Badge>
                      </Flex>
                      <Flex gap={1} wrap="wrap">
                        {area.tagIds.map((tagId) => {
                          const tag = tags.find((t) => t.id === tagId);
                          return tag ? (
                            <ChakraTag key={tag.id} size="sm" bg={tag.color} color="white">
                              <TagLabel>{tag.name}</TagLabel>
                            </ChakraTag>
                          ) : null;
                        })}
                      </Flex>
                    </Box>
                    <HStack spacing={1}>
                      {area.status !== 'completed' && (!activeSession || activeSession.focusId === area.id) && (
                        <Tooltip label={activeSession ? '结束专注' : '开始专注'}>
                          <Button size="xs" variant="ghost" colorScheme={activeSession ? 'red' : 'green'} onClick={() => activeSession ? onEndSessionOpen() : handleStartSession(area.id)}>
                            {activeSession ? <Square size={14} /> : <Play size={14} />}
                          </Button>
                        </Tooltip>
                      )}
                      <Tooltip label="迁移时间层">
                        <Button size="xs" variant="ghost" onClick={() => openMigrate(area)}>
                          <TrendingUp size={14} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="编辑">
                        <Button size="xs" variant="ghost" onClick={() => openEditArea(area)}>
                          <Eye size={14} />
                        </Button>
                      </Tooltip>
                      <Tooltip label="删除">
                        <Button size="xs" variant="ghost" colorScheme="red" onClick={() => handleDeleteArea(area.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </Tooltip>
                    </HStack>
                  </Flex>
                </CardHeader>

                <CardBody py={2}>
                  <Text fontSize="sm" color="gray.600" noOfLines={2}>{area.description || '无描述'}</Text>
                  {area.whyImportant && (
                    <Box mt={2}>
                      <Flex align="center" gap={1} fontSize="xs" color="gray.500">
                        <AlertCircle size={12} />
                        <Text as="span" fontWeight="medium">为何重要：</Text>
                        <Text as="span">{area.whyImportant}</Text>
                      </Flex>
                    </Box>
                  )}
                  {area.desiredOutcome && (
                    <Box mt={1}>
                      <Flex align="center" gap={1} fontSize="xs" color="gray.500">
                        <Target size={12} />
                        <Text as="span" fontWeight="medium">期望结果：</Text>
                        <Text as="span">{area.desiredOutcome}</Text>
                      </Flex>
                    </Box>
                  )}
                </CardBody>

                <CardFooter pt={0}>
                  <Flex justify="space-between" align="center" w="full">
                    <HStack spacing={3} fontSize="xs" color="gray.500">
                      {getAreaTotalDuration(area.id) > 0 && (
                        <Flex align="center" gap={1} color="blue.600" cursor="pointer" onClick={() => setExpandedAreaId(expandedAreaId === area.id ? null : area.id)}>
                          <Clock size={12} />
                          <Text>累计专注 {formatMinutes(getAreaTotalDuration(area.id))}</Text>
                          {expandedAreaId === area.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </Flex>
                      )}
                      {area.nextReviewAt && (
                        <Flex align="center" gap={1}>
                          <Calendar size={12} />
                          <Text>下次回顾: {new Date(area.nextReviewAt).toLocaleDateString()}</Text>
                        </Flex>
                      )}
                    </HStack>
                    <Text fontSize="xs" color="gray.400">
                      创建于 {new Date(area.createdAt).toLocaleDateString()}
                    </Text>
                  </Flex>

                  {expandedAreaId === area.id && (
                    <Box mt={3} pt={3} borderTop="1px" borderColor="gray.100" w="full">
                      <VStack gap={2} align="stretch">
                        {getAreaSessions(area.id).filter((s) => s.endTime).length === 0 ? (
                          <Text fontSize="xs" color="gray.500">暂无专注记录</Text>
                        ) : (
                          getAreaSessions(area.id)
                            .filter((s) => s.endTime)
                            .slice(0, 5)
                            .map((session) => (
                              <Flex key={session.id} justify="space-between" align="center" p={2} bg="gray.50" borderRadius="md">
                                <Text fontSize="xs" color="gray.600">
                                  {new Date(session.startTime).toLocaleString()}
                                </Text>
                                <Flex align="center" gap={2}>
                                  <Badge colorScheme="blue" fontSize="xs">
                                    {formatMinutes(session.durationMinutes || 0)}
                                  </Badge>
                                  {session.notes && (
                                    <Tooltip label={session.notes}>
                                      <Box as="span" cursor="help" color="gray.500">📝</Box>
                                    </Tooltip>
                                  )}
                                </Flex>
                              </Flex>
                            ))
                        )}
                      </VStack>
                    </Box>
                  )}
                </CardFooter>
              </Card>
            ))
          )}
        </VStack>
      </Box>

      {/* 新建/编辑焦点弹窗 */}
      <Modal isOpen={isAreaOpen} onClose={onAreaClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editingArea ? '编辑焦点' : '新建焦点'}</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>名称 *</Text>
                <Input placeholder="焦点名称" value={areaName} onChange={(e) => setAreaName(e.target.value)} />
              </Box>

              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>描述</Text>
                <Textarea placeholder="描述这个焦点领域" value={areaDescription} onChange={(e) => setAreaDescription(e.target.value)} rows={2} />
              </Box>

              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>为什么重要？</Text>
                <Textarea placeholder="为什么这个焦点对你很重要？" value={areaWhyImportant} onChange={(e) => setAreaWhyImportant(e.target.value)} rows={2} />
              </Box>

              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>期望结果</Text>
                <Input placeholder="你希望达成什么结果？" value={areaDesiredOutcome} onChange={(e) => setAreaDesiredOutcome(e.target.value)} />
              </Box>

              <Flex w="full" gap={4}>
                <Box flex={1}>
                  <Text fontSize="sm" fontWeight="medium" mb={1}>时间层面</Text>
                  <Select value={areaHorizon} onChange={(e) => setAreaHorizon(e.target.value as FocusHorizon)}>
                    {horizonOptions.map((h) => (
                      <option key={h} value={h}>{horizonLabels[h]}</option>
                    ))}
                  </Select>
                </Box>
                <Box flex={1}>
                  <Text fontSize="sm" fontWeight="medium" mb={1}>状态</Text>
                  <Select value={areaStatus} onChange={(e) => setAreaStatus(e.target.value as FocusStatus)}>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{statusLabels[s]}</option>
                    ))}
                  </Select>
                </Box>
                <Box flex={1}>
                  <Text fontSize="sm" fontWeight="medium" mb={1}>重要性</Text>
                  <Select value={areaImportance} onChange={(e) => setAreaImportance(e.target.value as FocusImportance)}>
                    {importanceOptions.map((i) => (
                      <option key={i} value={i}>{importanceLabels[i]}</option>
                    ))}
                  </Select>
                </Box>
              </Flex>

              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>标签</Text>
                <Flex gap={2} wrap="wrap">
                  {tags.map((tag) => (
                    <ChakraTag
                      key={tag.id}
                      size="md"
                      bg={areaTagIds.includes(tag.id) ? tag.color : 'gray.100'}
                      color={areaTagIds.includes(tag.id) ? 'white' : 'gray.700'}
                      cursor="pointer"
                      onClick={() => toggleTag(tag.id)}
                    >
                      <TagLabel>{tag.name}</TagLabel>
                    </ChakraTag>
                  ))}
                </Flex>
              </Box>

              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>下次回顾日期</Text>
                <Input type="date" value={areaNextReviewAt} onChange={(e) => setAreaNextReviewAt(e.target.value)} />
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onAreaClose}>取消</Button>
            <Button colorScheme="blue" onClick={handleSaveArea}>保存</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 迁移焦点弹窗 */}
      <Modal isOpen={isMigrateOpen} onClose={onMigrateClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>迁移焦点: {migratingArea?.name}</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>迁移到</Text>
                <Select value={migrateToHorizon} onChange={(e) => setMigrateToHorizon(e.target.value as FocusHorizon)}>
                  {horizonOptions.map((h) => (
                    <option key={h} value={h}>{horizonLabels[h]}</option>
                  ))}
                </Select>
              </Box>
              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>迁移原因（可选）</Text>
                <Textarea placeholder="为什么迁移这个焦点？" value={migrateReason} onChange={(e) => setMigrateReason(e.target.value)} rows={3} />
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onMigrateClose}>取消</Button>
            <Button colorScheme="blue" onClick={handleMigrate}>确认迁移</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 结束专注弹窗 */}
      <Modal isOpen={isEndSessionOpen} onClose={onEndSessionClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>结束专注</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              <Text>本次专注时长: {formatTimer(sessionTimer)}</Text>
              <Box w="full">
                <Text fontSize="sm" fontWeight="medium" mb={1}>专注备注（可选）</Text>
                <Textarea placeholder="记录这次专注的成果或感受..." value={endSessionNotes} onChange={(e) => setEndSessionNotes(e.target.value)} rows={3} />
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onEndSessionClose}>取消</Button>
            <Button colorScheme="blue" onClick={handleEndSession}>确认结束</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 标签管理弹窗 */}
      <Modal isOpen={isTagOpen} onClose={onTagClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>标签管理</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              <Flex gap={2} w="full">
                <Input placeholder="新标签名称" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} flex={1} />
                <Input type="color" w="60px" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} />
                <Button colorScheme="blue" onClick={handleCreateTag}>添加</Button>
              </Flex>
              <Divider />
              <Flex gap={2} wrap="wrap" w="full">
                {tags.map((tag) => (
                  <ChakraTag key={tag.id} size="lg" bg={tag.color} color="white">
                    <TagLabel>{tag.name}</TagLabel>
                    <TagCloseButton onClick={() => handleDeleteTag(tag.id)} />
                  </ChakraTag>
                ))}
                {tags.length === 0 && <Text color="gray.500">暂无标签</Text>}
              </Flex>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onTagClose}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

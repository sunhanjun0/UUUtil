import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Card,
  CardBody,
  Flex,
  Heading,
  HStack,
  Select,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { Activity, AlertTriangle, CircleDot, Radio, ScanLine, Zap } from 'lucide-react';
import type {
  FocusAlert,
  FocusAreaView,
  FocusAttentionMode,
  FocusHealth,
  FocusStats,
  FocusTag,
} from '../../src/shared/types';

const modeLabels: Record<FocusAttentionMode, string> = {
  deep: '沉浸',
  pulse: '脉冲',
  scan: '扫视',
  dormant: '休眠',
};

const modeIcons = {
  deep: Zap,
  pulse: Activity,
  scan: ScanLine,
  dormant: Radio,
};

const healthLabels: Record<FocusHealth, string> = {
  aligned: '对齐',
  drifting: '漂移',
  neglected: '失焦',
  cooling: '冷却',
};

const healthColors: Record<FocusHealth, string> = {
  aligned: '#16a34a',
  drifting: '#d97706',
  neglected: '#dc2626',
  cooling: '#6b7280',
};

const modeColors: Record<FocusAttentionMode, string> = {
  deep: 'purple',
  pulse: 'blue',
  scan: 'teal',
  dormant: 'gray',
};

const CHART_SIZE = 560;
const MAX_RECENCY_HOURS = 24 * 30;
const EXPANSION_RADIUS_PERCENT = 12;
const EXPANSION_HOT_ZONE_PADDING_PERCENT = 8;
const COVERAGE_TRIGGER_RATIO = 0.4;
const recencyRings = [1, 3, 6, 12, 24, 72, 168, 720];

interface ChartSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getAngle(focus: FocusAreaView) {
  const seed = `${focus.id}:${focus.name}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return (hash / 0xffffffff) * Math.PI * 2;
}

function getHoursSinceFocusActivity(focus: FocusAreaView) {
  const referenceTime = focus.lastCheckInAt || focus.updatedAt || focus.createdAt;
  const timestamp = new Date(referenceTime).getTime();
  if (!Number.isFinite(timestamp)) return MAX_RECENCY_HOURS;
  return clamp((Date.now() - timestamp) / (1000 * 60 * 60), 0, MAX_RECENCY_HOURS);
}

function getRecencyRadius(focus: FocusAreaView) {
  const hours = getHoursSinceFocusActivity(focus);
  const normalized = Math.log1p(hours) / Math.log1p(MAX_RECENCY_HOURS);
  return clamp(normalized * 42, 0, 42);
}

function getRingRadius(hour: number) {
  return clamp((Math.log1p(hour) / Math.log1p(MAX_RECENCY_HOURS)) * 42, 0, 42);
}

function getX(focus: FocusAreaView) {
  return clamp(50 + Math.cos(getAngle(focus)) * getRecencyRadius(focus), 6, 94);
}

function getY(focus: FocusAreaView) {
  return clamp(50 + Math.sin(getAngle(focus)) * getRecencyRadius(focus), 8, 92);
}

function getSize(focus: FocusAreaView) {
  return clamp(10 + focus.weight * 2, 12, 30);
}

function getBubblePosition(focus: FocusAreaView) {
  return { x: getX(focus), y: getY(focus), size: getSize(focus) };
}

function getCircleOverlapArea(radiusA: number, radiusB: number, distance: number) {
  if (distance >= radiusA + radiusB) return 0;
  if (distance <= Math.abs(radiusA - radiusB)) return Math.PI * Math.min(radiusA, radiusB) ** 2;

  const angleA = Math.acos((distance ** 2 + radiusA ** 2 - radiusB ** 2) / (2 * distance * radiusA));
  const angleB = Math.acos((distance ** 2 + radiusB ** 2 - radiusA ** 2) / (2 * distance * radiusB));
  const triangleArea = 0.5 * Math.sqrt(
    Math.max(0, (-distance + radiusA + radiusB) * (distance + radiusA - radiusB) * (distance - radiusA + radiusB) * (distance + radiusA + radiusB)),
  );
  return radiusA ** 2 * angleA + radiusB ** 2 * angleB - triangleArea;
}

function getPixelCircle(focus: FocusAreaView, chartSize: ChartSize) {
  const position = getBubblePosition(focus);
  return {
    x: (position.x / 100) * chartSize.width,
    y: (position.y / 100) * chartSize.height,
    radius: position.size / 2,
  };
}

function isCoveredByHover(focus: FocusAreaView, hovered: FocusAreaView, chartSize: ChartSize) {
  const position = getPixelCircle(focus, chartSize);
  const hoveredPosition = getPixelCircle(hovered, chartSize);
  const distance = Math.hypot(position.x - hoveredPosition.x, position.y - hoveredPosition.y);
  const focusArea = Math.PI * position.radius ** 2;
  return getCircleOverlapArea(position.radius, hoveredPosition.radius, distance) / focusArea >= COVERAGE_TRIGGER_RATIO;
}

function getStarExpandedPosition(focus: FocusAreaView, hovered: FocusAreaView, slotIndex: number) {
  const position = getBubblePosition(focus);
  const hoveredPosition = getBubblePosition(hovered);
  const starAngles = [-Math.PI / 2, -Math.PI / 6, Math.PI / 6, Math.PI / 2, Math.PI * 5 / 6, -Math.PI * 5 / 6, 0, Math.PI];
  const angle = starAngles[slotIndex % starAngles.length];
  const ring = Math.floor(slotIndex / starAngles.length);
  const radius = EXPANSION_RADIUS_PERCENT + ring * 5;


  return {
    ...position,
    x: clamp(hoveredPosition.x + Math.cos(angle) * radius, 6, 94),
    y: clamp(hoveredPosition.y + Math.sin(angle) * radius, 8, 92),
  };
}

function formatDays(value: number | null) {
  if (value === null) return '从未检视';
  if (value === 0) return '今天检视';
  return `${value} 天未检视`;
}

function formatRingLabel(hour: number) {
  if (hour < 24) return `${hour}h`;
  const days = hour / 24;
  return `${days}d`;
}

function BubbleChart({ focuses, selectedId, onSelect }: {
  focuses: FocusAreaView[];
  selectedId?: string;
  onSelect: (focus: FocusAreaView) => void;
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState<ChartSize>({ width: CHART_SIZE, height: CHART_SIZE });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hovered = focuses.find((focus) => focus.id === hoveredId) || null;
  const coveredIds = new Map<string, number>();
  if (hovered) {
    focuses
      .filter((focus) => focus.id !== hovered.id && isCoveredByHover(focus, hovered, chartSize))
      .sort((left, right) => getAngle(left) - getAngle(right))
      .forEach((focus, index) => coveredIds.set(focus.id, index));
  }
  const layout = focuses.map((focus) => ({
    focus,
    base: getBubblePosition(focus),
    display: hovered && coveredIds.has(focus.id)
      ? getStarExpandedPosition(focus, hovered, coveredIds.get(focus.id)!)
      : getBubblePosition(focus),
  }));

  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;

    function updateSize() {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setChartSize({ width: rect.width, height: rect.height });
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function handleChartMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!hovered) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 100;
    const mouseY = ((event.clientY - rect.top) / rect.height) * 100;
    const hoveredPosition = getBubblePosition(hovered);
    const deltaX = mouseX - hoveredPosition.x;
    const deltaY = mouseY - hoveredPosition.y;
    const aspectCorrectedDistance = Math.hypot(deltaX, deltaY * (rect.height / rect.width));
    const activeRingCount = Math.max(1, Math.ceil(coveredIds.size / 8));
    const hotZoneRadius = EXPANSION_RADIUS_PERCENT + (activeRingCount - 1) * 5 + EXPANSION_HOT_ZONE_PADDING_PERCENT;

    if (aspectCorrectedDistance > hotZoneRadius) setHoveredId(null);
  }

  return (
    <Box
      ref={chartRef}
      position="relative"
      w="min(100%, 760px)"
      aspectRatio="1 / 1"
      minH={`${CHART_SIZE}px`}
      mx="auto"
      bg="linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="xl"
      overflow="hidden"
      onMouseMove={handleChartMouseMove}
      onMouseLeave={() => setHoveredId(null)}
    >
      <Box position="absolute" left="50%" top="50%" transform="translate(-50%, -50%)" color="gray.500" fontSize="xs">近期</Box>
      <Box position="absolute" right={4} bottom={3} color="gray.500" fontSize="xs">外圈 = 更久未检视</Box>
      <Box position="absolute" left="8%" right="8%" top="50%" h="1px" bg="whiteAlpha.900" />
      <Box position="absolute" top="10%" bottom="10%" left="50%" w="1px" bg="whiteAlpha.900" />

      <Box as="svg" position="absolute" inset={0} w="100%" h="100%" pointerEvents="none" overflow="visible">
        {recencyRings.map((hour) => {
          const radius = getRingRadius(hour);
          return (
            <g key={hour}>
              <circle
                cx="50%"
                cy="50%"
                r={`${radius}%`}
                fill="none"
                stroke="rgba(59, 130, 246, 0.13)"
                strokeWidth="1"
              />
              <text
                x={`${50 + radius / Math.SQRT2}%`}
                y={`${50 - radius / Math.SQRT2}%`}
                fill="rgba(100, 116, 139, 0.55)"
                fontSize="10"
                textAnchor="middle"
              >{formatRingLabel(hour)}</text>
            </g>
          );
        })}
      </Box>

      {hovered && (
        <Box as="svg" position="absolute" inset={0} w="100%" h="100%" pointerEvents="none" overflow="visible">
          {layout
            .filter(({ base, display }) => Math.abs(base.x - display.x) > 0.2 || Math.abs(base.y - display.y) > 0.2)
            .map(({ focus, display }) => {
              const hoveredPosition = getBubblePosition(hovered);
              return (
              <line
                key={focus.id}
                x1={`${hoveredPosition.x}%`}
                y1={`${hoveredPosition.y}%`}
                x2={`${display.x}%`}
                y2={`${display.y}%`}
                stroke="rgba(37, 99, 235, 0.42)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            );
            })}
        </Box>
      )}

      {focuses.length === 0 ? (
        <Flex h="full" align="center" justify="center" direction="column" color="gray.500" gap={2}>
          <CircleDot size={28} />
          <Text>暂无焦点。请通过 MCP / 助手创建 focus_create。</Text>
        </Flex>
      ) : layout.map(({ focus, display }) => {
        const size = display.size;
        const selected = selectedId === focus.id;
        const isHovered = hoveredId === focus.id;
        const Icon = modeIcons[focus.attentionMode];
        return (
          <Tooltip
            key={focus.id}
            hasArrow
            placement="top"
            openDelay={180}
            label={
              <Box maxW="260px">
                <Text fontWeight="bold" mb={1}>{focus.name}</Text>
              <Text fontSize="xs">{healthLabels[focus.health]} · {modeLabels[focus.attentionMode]} · 比重 {focus.weight}</Text>
                <Text fontSize="xs">{formatDays(focus.daysSinceLastCheckIn)} · 近 7 天 {focus.recentCheckInCount} 次检视</Text>
                {focus.description && <Text fontSize="xs" mt={1} noOfLines={2}>{focus.description}</Text>}
              </Box>
            }
          >
          <Box
            role="button"
            aria-label={focus.name}
            position="absolute"
            left={`${display.x}%`}
            top={`${display.y}%`}
            w={`${size}px`}
            h={`${size}px`}
            borderRadius="full"
            bg={healthColors[focus.health]}
            color="white"
            transform="translate(-50%, -50%)"
            boxShadow={selected ? '0 0 0 4px rgba(37,99,235,0.22), 0 16px 36px rgba(15,23,42,0.28)' : '0 10px 28px rgba(15,23,42,0.18)'}
            border="2px solid rgba(255,255,255,0.85)"
            cursor="pointer"
            opacity={hovered && !isHovered ? 0.82 : 1}
            zIndex={isHovered ? 3 : selected ? 2 : 1}
            transition="left 220ms ease, top 220ms ease, transform 160ms ease, opacity 160ms ease, box-shadow 160ms ease"
            _hover={{ transform: 'translate(-50%, -50%) scale(1.1)', zIndex: 4 }}
            onMouseEnter={() => setHoveredId((current) => current ?? focus.id)}
            onClick={() => onSelect(focus)}
          >
            <Flex h="full" align="center" justify="center" direction="column" gap={1}>
              <Icon size={Math.max(7, Math.min(16, size * 0.52))} strokeWidth={2.2} />
            </Flex>
          </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

function StatsCards({ stats }: { stats: FocusStats | null }) {
  if (!stats) return null;
  return (
    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
      <Card><CardBody py={3}><Text fontSize="xs" color="gray.500">焦点总数</Text><Heading size="md">{stats.totalAreas}</Heading></CardBody></Card>
      <Card><CardBody py={3}><Text fontSize="xs" color="gray.500">活跃焦点</Text><Heading size="md">{stats.activeAreas}</Heading></CardBody></Card>
      <Card><CardBody py={3}><Text fontSize="xs" color="gray.500">近 7 天检视</Text><Heading size="md">{stats.checkInsLast7Days}</Heading></CardBody></Card>
      <Card><CardBody py={3}><Text fontSize="xs" color="gray.500">异动</Text><Heading size="md">{stats.alertCount}</Heading></CardBody></Card>
    </SimpleGrid>
  );
}

function AlertList({ alerts }: { alerts: FocusAlert[] }) {
  return (
    <Card h="full">
      <CardBody>
        <HStack mb={3} spacing={2}>
          <AlertTriangle size={17} />
          <Heading size="sm">当前异动</Heading>
        </HStack>
        <VStack align="stretch" spacing={2} maxH="220px" overflow="auto">
          {alerts.length === 0 ? <Text fontSize="sm" color="gray.500">暂无异动</Text> : alerts.map((alert) => (
            <Box key={alert.id} p={2} bg={alert.severity === 'critical' ? 'red.50' : alert.severity === 'warning' ? 'orange.50' : 'gray.50'} borderRadius="md">
              <Badge colorScheme={alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'orange' : 'gray'} mb={1}>{alert.type}</Badge>
              <Text fontSize="sm">{alert.message}</Text>
            </Box>
          ))}
        </VStack>
      </CardBody>
    </Card>
  );
}

function FocusDetail({ focus, tags }: { focus?: FocusAreaView; tags: FocusTag[] }) {
  if (!focus) {
    return <Card h="full"><CardBody><Text color="gray.500">选择一个气泡查看详情</Text></CardBody></Card>;
  }
  const Icon = modeIcons[focus.attentionMode];
  const tagNames = focus.tags.map((tagId) => tags.find((tag) => tag.id === tagId || tag.name === tagId)?.name || tagId);
  return (
    <Card h="full">
      <CardBody>
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between" align="start">
            <Box>
              <Heading size="sm">{focus.name}</Heading>
              <Text fontSize="sm" color="gray.500" mt={1}>{focus.description || '暂无描述'}</Text>
            </Box>
            <Badge colorScheme={modeColors[focus.attentionMode]}>
              <HStack spacing={1}><Icon size={12} /><Text>{modeLabels[focus.attentionMode]}</Text></HStack>
            </Badge>
          </HStack>
          <HStack wrap="wrap">
            <Badge bg={healthColors[focus.health]} color="white">{healthLabels[focus.health]}</Badge>
            <Badge>weight {focus.weight}</Badge>
            <Badge>{focus.reviewCadence}</Badge>
            <Badge>{formatDays(focus.daysSinceLastCheckIn)}</Badge>
            <Badge>近 7 天 {focus.recentCheckInCount} 次</Badge>
          </HStack>
          {focus.expectedExit && <Box><Text fontSize="xs" color="gray.500">自然退出条件</Text><Text fontSize="sm">{focus.expectedExit}</Text></Box>}
          {tagNames.length > 0 && <HStack wrap="wrap">{tagNames.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</HStack>}
          <Box>
            <Text fontSize="xs" color="gray.500">创建 / 更新</Text>
            <Text fontSize="sm">{new Date(focus.createdAt).toLocaleString()} / {new Date(focus.updatedAt).toLocaleString()}</Text>
          </Box>
        </VStack>
      </CardBody>
    </Card>
  );
}

export default function Focus() {
  const [focuses, setFocuses] = useState<FocusAreaView[]>([]);
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [alerts, setAlerts] = useState<FocusAlert[]>([]);
  const [tags, setTags] = useState<FocusTag[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [healthFilter, setHealthFilter] = useState<FocusHealth | ''>('');
  const [modeFilter, setModeFilter] = useState<FocusAttentionMode | ''>('');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const filters = {
      ...(healthFilter ? { health: healthFilter } : {}),
      ...(modeFilter ? { attentionMode: modeFilter } : {}),
    };
    const [focusData, statsData, alertData, tagData] = await Promise.all([
      window.assistant.focus.list(filters),
      window.assistant.focus.stats(),
      window.assistant.focus.alerts(),
      window.assistant.focus.listTags(),
    ]);
    setFocuses(focusData);
    setStats(statsData);
    setAlerts(alertData);
    setTags(tagData);
    setSelectedId((current) => current && focusData.some((focus) => focus.id === current) ? current : focusData[0]?.id);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch((err) => {
      console.error('加载焦点失败:', err);
      setLoading(false);
    });
    const timer = setInterval(() => refresh().catch(console.error), 5000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [healthFilter, modeFilter]);

  const selected = useMemo(() => focuses.find((focus) => focus.id === selectedId), [focuses, selectedId]);

  return (
    <Box h="100%" overflow="auto" bg="gray.50" p={4}>
      <VStack align="stretch" spacing={4}>
        <Flex justify="space-between" align="center" gap={3} wrap="wrap">
          <Box>
            <Heading size="md">焦点注意力观察</Heading>
            <Text fontSize="sm" color="gray.500">只读气泡图：正方形分圈视图；越靠近中心代表越近期，浅色圈按小时到天的对数分布，泡泡直径随比重变大。</Text>
          </Box>
          <HStack>
            <Select size="sm" value={healthFilter} onChange={(event) => setHealthFilter(event.target.value as FocusHealth | '')} w="130px">
              <option value="">全部健康度</option>
              <option value="neglected">失焦</option>
              <option value="drifting">漂移</option>
              <option value="cooling">冷却</option>
              <option value="aligned">对齐</option>
            </Select>
            <Select size="sm" value={modeFilter} onChange={(event) => setModeFilter(event.target.value as FocusAttentionMode | '')} w="130px">
              <option value="">全部模式</option>
              <option value="deep">沉浸</option>
              <option value="pulse">脉冲</option>
              <option value="scan">扫视</option>
              <option value="dormant">休眠</option>
            </Select>
          </HStack>
        </Flex>

        <StatsCards stats={stats} />

        {loading ? (
          <Flex h="360px" align="center" justify="center"><Spinner /></Flex>
        ) : (
          <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4} alignItems="stretch">
            <Box gridColumn={{ base: 'auto', xl: 'span 2' }}>
              <BubbleChart focuses={focuses} selectedId={selectedId} onSelect={(focus) => setSelectedId(focus.id)} />
            </Box>
            <Stack spacing={4}>
              <FocusDetail focus={selected} tags={tags} />
              <AlertList alerts={alerts} />
            </Stack>
          </SimpleGrid>
        )}

        <Card>
          <CardBody>
            <Heading size="sm" mb={3}>焦点列表</Heading>
            <VStack align="stretch" spacing={2}>
              {focuses.map((focus) => (
                <Flex key={focus.id} justify="space-between" align="center" p={2} bg="white" border="1px solid" borderColor="gray.100" borderRadius="md" cursor="pointer" onClick={() => setSelectedId(focus.id)}>
                  <HStack>
                    <Box w="10px" h="10px" borderRadius="full" bg={healthColors[focus.health]} />
                    <Text fontWeight="medium">{focus.name}</Text>
                    <Badge colorScheme={modeColors[focus.attentionMode]}>{modeLabels[focus.attentionMode]}</Badge>
                  </HStack>
                  <HStack>
                    <Badge>weight {focus.weight}</Badge>
                    <Text fontSize="sm" color="gray.500">{formatDays(focus.daysSinceLastCheckIn)}</Text>
                  </HStack>
                </Flex>
              ))}
            </VStack>
          </CardBody>
        </Card>
      </VStack>
    </Box>
  );
}

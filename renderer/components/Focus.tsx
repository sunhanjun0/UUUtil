import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Divider,
  Flex,
  Heading,
  HStack,
  Select,
  Spinner,
  Text,
  Tooltip,
  VStack,
} from '@chakra-ui/react';
import { Activity, CircleDot, CloudOff, GitBranch, Radio, ScanLine, Sparkles, Target, TrendingUp, Zap } from 'lucide-react';
import type { FieFocus, FieRunSummary, TrendPoint } from '../../src/shared/types';

/** 距今活跃度分档 —— 替代旧模型的健康度，用 last_activity_at 派生。 */
type RecencyBucket = 'today' | 'week' | 'month' | 'stale';

const recencyLabels: Record<RecencyBucket, string> = {
  today: '今日活跃',
  week: '本周活跃',
  month: '本月活跃',
  stale: '久未活跃',
};

const recencyColors: Record<RecencyBucket, string> = {
  today: '#16a34a',
  week: '#2563eb',
  month: '#d97706',
  stale: '#6b7280',
};

const recencyIcons: Record<RecencyBucket, typeof Zap> = {
  today: Zap,
  week: Activity,
  month: ScanLine,
  stale: Radio,
};

const CHART_SIZE = 560;
/** 主内容区固定高度：雷达图按此撑满为正方形，右列同高、内部滚动，避免右列过长把行撑高。 */
const CONTENT_HEIGHT = 600;
const MAX_RECENCY_HOURS = 24 * 30;
const EXPANSION_RADIUS_PERCENT = 12;
const EXPANSION_HOT_ZONE_PADDING_PERCENT = 8;
const COVERAGE_TRIGGER_RATIO = 0.4;
const recencyRings = [1, 3, 6, 12, 24, 72, 168, 720];

/** 应用侧视图模型：在 FieFocus 之上派生出气泡图需要的字段。 */
interface FocusView extends FieFocus {
  hoursSinceActivity: number;
  recencyBucket: RecencyBucket;
  /** 由 keywords 数量派生的弱权重，用于泡泡直径。 */
  weight: number;
}

interface ChartSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hoursSince(iso: string): number {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return MAX_RECENCY_HOURS;
  return clamp((Date.now() - timestamp) / (1000 * 60 * 60), 0, MAX_RECENCY_HOURS);
}

function toRecencyBucket(hours: number): RecencyBucket {
  if (hours <= 24) return 'today';
  if (hours <= 168) return 'week';
  if (hours <= 720) return 'month';
  return 'stale';
}

/** 把 FIE 的 FieFocus 映射为气泡图视图模型。 */
function toFocusView(focus: FieFocus): FocusView {
  const hoursSinceActivity = hoursSince(focus.last_activity_at || focus.updated_at || focus.created_at);
  return {
    ...focus,
    hoursSinceActivity,
    recencyBucket: toRecencyBucket(hoursSinceActivity),
    weight: 1 + (focus.keywords?.length ?? 0),
  };
}

function getAngle(focus: FocusView) {
  const seed = `${focus.id}:${focus.name}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return (hash / 0xffffffff) * Math.PI * 2;
}

function getRecencyRadius(focus: FocusView) {
  const normalized = Math.log1p(focus.hoursSinceActivity) / Math.log1p(MAX_RECENCY_HOURS);
  return clamp(normalized * 42, 0, 42);
}

function getRingRadius(hour: number) {
  return clamp((Math.log1p(hour) / Math.log1p(MAX_RECENCY_HOURS)) * 42, 0, 42);
}

function getX(focus: FocusView) {
  return clamp(50 + Math.cos(getAngle(focus)) * getRecencyRadius(focus), 6, 94);
}

function getY(focus: FocusView) {
  return clamp(50 + Math.sin(getAngle(focus)) * getRecencyRadius(focus), 8, 92);
}

function getSize(focus: FocusView) {
  return clamp(10 + focus.weight * 2, 12, 30);
}

function getBubblePosition(focus: FocusView) {
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

function getPixelCircle(focus: FocusView, chartSize: ChartSize) {
  const position = getBubblePosition(focus);
  return {
    x: (position.x / 100) * chartSize.width,
    y: (position.y / 100) * chartSize.height,
    radius: position.size / 2,
  };
}

function isCoveredByHover(focus: FocusView, hovered: FocusView, chartSize: ChartSize) {
  const position = getPixelCircle(focus, chartSize);
  const hoveredPosition = getPixelCircle(hovered, chartSize);
  const distance = Math.hypot(position.x - hoveredPosition.x, position.y - hoveredPosition.y);
  const focusArea = Math.PI * position.radius ** 2;
  return getCircleOverlapArea(position.radius, hoveredPosition.radius, distance) / focusArea >= COVERAGE_TRIGGER_RATIO;
}

function getStarExpandedPosition(focus: FocusView, hovered: FocusView, slotIndex: number) {
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

function formatSinceActivity(hours: number) {
  if (hours < 1) return '刚刚活跃';
  if (hours < 24) return `${Math.round(hours)} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function formatRingLabel(hour: number) {
  if (hour < 24) return `${hour}h`;
  const days = hour / 24;
  return `${days}d`;
}

function BubbleChart({ focuses, selectedId, onSelect }: {
  focuses: FocusView[];
  selectedId?: string;
  onSelect: (focus: FocusView) => void;
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
      h="100%"
      aspectRatio="1 / 1"
      maxW="100%"
      maxH="100%"
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
      <Box position="absolute" right={4} bottom={3} color="gray.500" fontSize="xs">外圈 = 更久未活跃</Box>
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
          <Text>暂无焦点。焦点由 FIE 通过事件摄取自动归因产生。</Text>
        </Flex>
      ) : layout.map(({ focus, display }) => {
        const size = display.size;
        const selected = selectedId === focus.id;
        const isHovered = hoveredId === focus.id;
        const Icon = recencyIcons[focus.recencyBucket];
        return (
          <Tooltip
            key={focus.id}
            hasArrow
            placement="top"
            openDelay={180}
            label={
              <Box maxW="260px">
                <Text fontWeight="bold" mb={1}>{focus.name}</Text>
                <Text fontSize="xs">{recencyLabels[focus.recencyBucket]} · {formatSinceActivity(focus.hoursSinceActivity)}</Text>
                {focus.project && <Text fontSize="xs">项目：{focus.project}</Text>}
                {focus.keywords.length > 0 && <Text fontSize="xs" mt={1} noOfLines={2}>关键词：{focus.keywords.join('、')}</Text>}
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
            bg={recencyColors[focus.recencyBucket]}
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

const decisionLabels: Record<string, string> = {
  skip: '跳过',
  check_in: '检视',
  create_and_check_in: '新建焦点',
};

const decisionColors: Record<string, string> = {
  skip: '#94a3b8',
  check_in: '#2563eb',
  create_and_check_in: '#7c3aed',
};

/** 30 天活跃度 sparkline —— 纯 SVG，补齐文档要求的趋势可视化。 */
function TrendSparkline({ trend }: { trend: TrendPoint[] }) {
  const width = 168;
  const height = 44;
  const points = useMemo(() => [...trend].reverse(), [trend]); // 接口按日期倒序，画图需正序
  if (points.length < 2) {
    return <Flex w={`${width}px`} h={`${height}px`} align="center" justify="center"><Text fontSize="xs" color="gray.400">趋势数据不足</Text></Flex>;
  }
  const max = Math.max(1, ...points.map((point) => point.checkins));
  const stepX = width / (points.length - 1);
  const coords = points.map((point, index) => ({
    x: index * stepX,
    y: height - 4 - (point.checkins / max) * (height - 10),
    point,
  }));
  const linePath = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  return (
    <Box as="svg" width={`${width}px`} height={`${height}px`} viewBox={`0 0 ${width} ${height}`} overflow="visible">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(37,99,235,0.22)" />
          <stop offset="100%" stopColor="rgba(37,99,235,0)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trendFill)" />
      <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((coord) => (
        <circle key={coord.point.date} cx={coord.x} cy={coord.y} r={coord.point === coords[coords.length - 1].point ? 2.6 : 1.4} fill="#2563eb" />
      ))}
    </Box>
  );
}

function Metric({ icon, label, value, accent }: { icon: typeof Zap; label: string; value: number; accent?: string }) {
  const IconCmp = icon;
  return (
    <HStack spacing={2.5} align="center">
      <Flex w="34px" h="34px" borderRadius="10px" align="center" justify="center" bg={accent ? `${accent}14` : 'gray.100'} color={accent || 'gray.600'} flexShrink={0}>
        <IconCmp size={17} strokeWidth={2.1} />
      </Flex>
      <Box>
        <Text fontSize="20px" fontWeight="700" lineHeight="1.1" color="gray.800">{value}</Text>
        <Text fontSize="11px" color="gray.500" lineHeight="1.2">{label}</Text>
      </Box>
    </HStack>
  );
}

/** 顶部概览：关键指标 + 30 天趋势缩略图，一屏内交代整体状态。 */
function OverviewBar({ focuses, runsCount, checkinsTotal, trend }: {
  focuses: FocusView[];
  runsCount: number;
  checkinsTotal: number;
  trend: TrendPoint[];
}) {
  const activeCount = focuses.filter((focus) => focus.status === 'active').length;
  const todayCount = focuses.filter((focus) => focus.recencyBucket === 'today').length;
  return (
    <Flex
      bg="white"
      border="1px solid"
      borderColor="gray.100"
      borderRadius="xl"
      px={5}
      py={4}
      boxShadow="0 1px 3px rgba(15,23,42,0.04)"
      align="center"
      justify="space-between"
      gap={6}
      wrap="wrap"
    >
      <HStack spacing={{ base: 5, md: 8 }} wrap="wrap">
        <Metric icon={Target} label="焦点总数" value={focuses.length} accent="#0f172a" />
        <Metric icon={Zap} label="今日活跃" value={todayCount} accent="#16a34a" />
        <Metric icon={CircleDot} label="活跃焦点" value={activeCount} accent="#2563eb" />
        <Metric icon={GitBranch} label="摄取 Runs" value={runsCount} accent="#7c3aed" />
      </HStack>
      <HStack spacing={3} align="center">
        <Box textAlign="right">
          <HStack spacing={1.5} justify="flex-end" color="gray.500">
            <TrendingUp size={13} />
            <Text fontSize="11px">近 30 天检视</Text>
          </HStack>
          <Text fontSize="20px" fontWeight="700" lineHeight="1.1" color="gray.800" textAlign="right">{checkinsTotal}</Text>
        </Box>
        <TrendSparkline trend={trend} />
      </HStack>
    </Flex>
  );
}

function Panel({ children, ...rest }: React.ComponentProps<typeof Box>) {
  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="gray.100"
      borderRadius="xl"
      boxShadow="0 1px 3px rgba(15,23,42,0.04)"
      overflow="hidden"
      {...rest}
    >
      {children}
    </Box>
  );
}

function FocusDetail({ focus }: { focus?: FocusView }) {
  if (!focus) {
    return (
      <Panel h="full">
        <Flex h="full" minH="180px" align="center" justify="center" direction="column" gap={2} color="gray.400" p={6}>
          <Target size={24} />
          <Text fontSize="sm">点击左侧气泡查看焦点详情</Text>
        </Flex>
      </Panel>
    );
  }
  const IconCmp = recencyIcons[focus.recencyBucket];
  return (
    <Panel flexShrink={0}>
      <Box h="4px" bg={recencyColors[focus.recencyBucket]} />
      <Box p={5}>
        <VStack align="stretch" spacing={4}>
          <Flex justify="space-between" align="start" gap={3}>
            <Box minW={0}>
              <Heading size="sm" noOfLines={1}>{focus.name}</Heading>
              <Text fontSize="xs" color="gray.500" mt={1}>{focus.project || '未关联项目'}</Text>
            </Box>
            <Badge
              flexShrink={0}
              px={2}
              py={1}
              borderRadius="md"
              bg={`${recencyColors[focus.recencyBucket]}14`}
              color={recencyColors[focus.recencyBucket]}
              textTransform="none"
            >
              <HStack spacing={1}><IconCmp size={11} /><Text fontSize="11px">{recencyLabels[focus.recencyBucket]}</Text></HStack>
            </Badge>
          </Flex>

          <HStack spacing={2} wrap="wrap">
            <Badge variant="subtle" colorScheme={focus.status === 'active' ? 'green' : 'gray'} textTransform="none">{focus.status === 'active' ? '活跃' : focus.status}</Badge>
            <Badge variant="subtle" colorScheme="gray" textTransform="none">{formatSinceActivity(focus.hoursSinceActivity)}</Badge>
            {focus.merged_into && <Badge variant="subtle" colorScheme="orange" textTransform="none">已合并</Badge>}
          </HStack>

          {focus.keywords.length > 0 && (
            <Box>
              <Text fontSize="11px" color="gray.400" mb={1.5} textTransform="uppercase" letterSpacing="0.04em">关键词</Text>
              <HStack wrap="wrap" spacing={1.5}>
                {focus.keywords.map((keyword) => (
                  <Badge key={keyword} variant="outline" colorScheme="blue" textTransform="none" fontWeight="500">{keyword}</Badge>
                ))}
              </HStack>
            </Box>
          )}

          <Divider />

          <VStack align="stretch" spacing={2}>
            <Flex justify="space-between"><Text fontSize="xs" color="gray.400">最近活跃</Text><Text fontSize="xs" color="gray.700">{new Date(focus.last_activity_at).toLocaleString()}</Text></Flex>
            <Flex justify="space-between"><Text fontSize="xs" color="gray.400">创建于</Text><Text fontSize="xs" color="gray.700">{new Date(focus.created_at).toLocaleString()}</Text></Flex>
            <Flex justify="space-between"><Text fontSize="xs" color="gray.400">更新于</Text><Text fontSize="xs" color="gray.700">{new Date(focus.updated_at).toLocaleString()}</Text></Flex>
          </VStack>
        </VStack>
      </Box>
    </Panel>
  );
}

/** 归因决策时间线 —— 文档核心价值之一：回看 FIE 如何归因每个事件。 */
function AttributionTimeline({ runs }: { runs: FieRunSummary[] }) {
  return (
    <Panel flex="1" minH={0} display="flex" flexDirection="column">
      <HStack px={5} py={3.5} borderBottom="1px solid" borderColor="gray.100" spacing={2}>
        <Sparkles size={15} color="#7c3aed" />
        <Heading size="sm">归因决策</Heading>
        <Text fontSize="xs" color="gray.400">最近 {runs.length} 次摄取</Text>
      </HStack>
      <Box flex="1" overflowY="auto" px={5} py={4}>
        {runs.length === 0 ? (
          <Flex h="full" minH="120px" align="center" justify="center" color="gray.400"><Text fontSize="sm">暂无摄取记录</Text></Flex>
        ) : (
          <VStack align="stretch" spacing={0}>
            {runs.map((run, index) => {
              const color = run.decision ? decisionColors[run.decision] ?? '#94a3b8' : '#94a3b8';
              const isLast = index === runs.length - 1;
              return (
                <HStack key={run.id} align="stretch" spacing={3}>
                  <Flex direction="column" align="center" flexShrink={0} w="12px">
                    <Box w="10px" h="10px" borderRadius="full" bg={color} mt="4px" boxShadow={`0 0 0 3px ${color}22`} />
                    {!isLast && <Box flex="1" w="2px" bg="gray.100" my="2px" />}
                  </Flex>
                  <Box pb={isLast ? 0 : 4} minW={0} flex="1">
                    <HStack justify="space-between" align="start" mb={0.5}>
                      <Text fontSize="13px" fontWeight="600" color={color}>
                        {run.decision ? decisionLabels[run.decision] ?? run.decision : '—'}
                      </Text>
                      <Text fontSize="11px" color="gray.400" flexShrink={0}>{new Date(run.occurred_at).toLocaleString()}</Text>
                    </HStack>
                    <Text fontSize="11px" color="gray.500" mb={run.reason ? 1 : 0}>
                      <Text as="span" fontFamily="mono">{run.source}</Text> · {run.event_type}
                    </Text>
                    {run.reason && <Text fontSize="xs" color="gray.600" noOfLines={2} lineHeight="1.5">{run.reason}</Text>}
                  </Box>
                </HStack>
              );
            })}
          </VStack>
        )}
      </Box>
    </Panel>
  );
}

export default function Focus() {
  const [focuses, setFocuses] = useState<FocusView[]>([]);
  const [runs, setRuns] = useState<FieRunSummary[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refresh() {
    const [focusRes, runsRes, trendRes] = await Promise.all([
      window.assistant.focus.listFocuses({ includeArchived: statusFilter === 'all' }),
      window.assistant.focus.listRuns(20),
      window.assistant.focus.trend({ days: 30 }),
    ]);

    if (focusRes.ok) {
      const views = focusRes.data.map(toFocusView);
      setFocuses(views);
      setSelectedId((current) => current && views.some((focus) => focus.id === current) ? current : views[0]?.id);
      setErrorMessage(null);
    } else {
      setFocuses([]);
      setErrorMessage(focusRes.offline ? 'FIE 服务未运行或不可达，暂无法加载焦点数据。' : focusRes.error);
    }

    setRuns(runsRes.ok ? runsRes.data : []);
    setTrend(trendRes.ok ? trendRes.data : []);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch((err) => {
      console.error('加载焦点失败:', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
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
  }, [statusFilter]);

  const selected = useMemo(() => focuses.find((focus) => focus.id === selectedId), [focuses, selectedId]);
  const checkinsTotal = useMemo(() => trend.reduce((sum, point) => sum + point.checkins, 0), [trend]);

  return (
    <Box h="100%" overflow="auto" bg="#f7f8fa" px={5} py={5}>
      <VStack align="stretch" spacing={4}>
        <Flex justify="space-between" align="center" gap={3} wrap="wrap">
          <Box>
            <Heading size="md" letterSpacing="-0.01em">焦点注意力观察</Heading>
            <Text fontSize="sm" color="gray.500" mt={0.5}>回看近期注意力分布与 FIE 归因决策 · 越靠近中心越近期活跃</Text>
          </Box>
          <Select
            size="sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'active' | 'all')}
            w="150px"
            bg="white"
            borderColor="gray.200"
            borderRadius="lg"
          >
            <option value="active">仅活跃焦点</option>
            <option value="all">包含已归档</option>
          </Select>
        </Flex>

        {errorMessage && (
          <Flex bg="red.50" border="1px solid" borderColor="red.200" borderRadius="xl" px={4} py={3} align="center" gap={2} color="red.600">
            <CloudOff size={16} />
            <Text fontSize="sm">{errorMessage}</Text>
          </Flex>
        )}

        <OverviewBar focuses={focuses} runsCount={runs.length} checkinsTotal={checkinsTotal} trend={trend} />

        {loading ? (
          <Flex h="420px" align="center" justify="center"><Spinner color="blue.400" /></Flex>
        ) : (
          <Flex gap={4} align="stretch" direction="row" h={`${CONTENT_HEIGHT}px`}>
            <Panel flex="0 0 auto" w={`${CONTENT_HEIGHT}px`} p={2} display="flex" alignItems="center" justifyContent="center" minW={0} h={`${CONTENT_HEIGHT}px`}>
              <BubbleChart focuses={focuses} selectedId={selectedId} onSelect={(focus) => setSelectedId(focus.id)} />
            </Panel>
            <Flex direction="column" gap={4} flex="1" minW={0} minH={0}>
              <FocusDetail focus={selected} />
              <AttributionTimeline runs={runs} />
            </Flex>
          </Flex>
        )}
      </VStack>
    </Box>
  );
}

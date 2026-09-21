import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner, Tooltip } from '@chakra-ui/react';
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
  today: 'var(--green)',
  week: 'var(--phos)',
  month: 'var(--amber)',
  stale: 'var(--ink-3)',
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
    <div
      ref={chartRef}
      className="ck-panel brackets"
      style={{
        position: 'relative',
        height: '100%',
        aspectRatio: '1 / 1',
        maxWidth: '100%',
        maxHeight: '100%',
        margin: '0 auto',
        padding: 0,
        overflow: 'hidden',
      }}
      onMouseMove={handleChartMouseMove}
      onMouseLeave={() => setHoveredId(null)}
    >
      <span className="ck-dim" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: 11 }}>近期</span>
      <span className="ck-dim" style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 11 }}>外圈 = 更久未活跃</span>
      <div style={{ position: 'absolute', left: '8%', right: '8%', top: '50%', height: 1, background: 'var(--line)' }} />
      <div style={{ position: 'absolute', top: '10%', bottom: '10%', left: '50%', width: 1, background: 'var(--line)' }} />

      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
        {recencyRings.map((hour) => {
          const radius = getRingRadius(hour);
          return (
            <g key={hour}>
              <circle cx="50%" cy="50%" r={`${radius}%`} fill="none" strokeWidth="1" style={{ stroke: 'var(--line)' }} />
              <text
                x={`${50 + radius / Math.SQRT2}%`}
                y={`${50 - radius / Math.SQRT2}%`}
                fontSize="10"
                textAnchor="middle"
                style={{ fill: 'var(--ink-3)' }}
              >{formatRingLabel(hour)}</text>
            </g>
          );
        })}
      </svg>

      {hovered && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
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
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  style={{ stroke: 'var(--line-strong)' }}
                />
              );
            })}
        </svg>
      )}

      {focuses.length === 0 ? (
        <div className="ck-dim" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <CircleDot size={28} />
          <span style={{ fontSize: 12 }}>暂无焦点。焦点由 FIE 通过事件摄取自动归因产生。</span>
        </div>
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
              <div style={{ maxWidth: 260 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{focus.name}</div>
                <div style={{ fontSize: 11 }}>{recencyLabels[focus.recencyBucket]} · {formatSinceActivity(focus.hoursSinceActivity)}</div>
                {focus.project && <div style={{ fontSize: 11 }}>项目：{focus.project}</div>}
                {focus.keywords.length > 0 && <div style={{ fontSize: 11, marginTop: 2 }}>关键词：{focus.keywords.join('、')}</div>}
              </div>
            }
          >
            <div
              role="button"
              aria-label={focus.name}
              style={{
                position: 'absolute',
                left: `${display.x}%`,
                top: `${display.y}%`,
                width: size,
                height: size,
                borderRadius: '50%',
                background: recencyColors[focus.recencyBucket],
                color: 'var(--bg)',
                transform: 'translate(-50%, -50%)',
                boxShadow: selected ? '0 0 0 4px rgba(103,232,249,0.22), 0 16px 36px rgba(4,9,18,0.5)' : '0 10px 28px rgba(4,9,18,0.4)',
                border: '2px solid var(--ink)',
                cursor: 'pointer',
                opacity: hovered && !isHovered ? 0.82 : 1,
                zIndex: isHovered ? 3 : selected ? 2 : 1,
                transition: 'left 220ms ease, top 220ms ease, transform 160ms ease, opacity 160ms ease, box-shadow 160ms ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={() => setHoveredId((current) => current ?? focus.id)}
              onClick={() => onSelect(focus)}
            >
              <Icon size={Math.max(7, Math.min(16, size * 0.52))} strokeWidth={2.2} />
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

const decisionLabels: Record<string, string> = {
  skip: '跳过',
  check_in: '检视',
  create_and_check_in: '新建焦点',
};

const decisionColors: Record<string, string> = {
  skip: 'var(--ink-3)',
  check_in: 'var(--phos)',
  create_and_check_in: 'var(--amber)',
};

/** 30 天活跃度 sparkline —— 纯 SVG，补齐文档要求的趋势可视化。 */
function TrendSparkline({ trend }: { trend: TrendPoint[] }) {
  const width = 168;
  const height = 44;
  const points = useMemo(() => [...trend].reverse(), [trend]); // 接口按日期倒序，画图需正序
  if (points.length < 2) {
    return <div className="ck-dim" style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 11 }}>趋势数据不足</span></div>;
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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--phos)', stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: 'var(--phos)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trendFill)" />
      <path d={linePath} fill="none" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--phos)' }} />
      {coords.map((coord) => (
        <circle key={coord.point.date} cx={coord.x} cy={coord.y} r={coord.point === coords[coords.length - 1].point ? 2.6 : 1.4} style={{ fill: 'var(--phos)' }} />
      ))}
    </svg>
  );
}

function Metric({ icon, label, value, accent }: { icon: typeof Zap; label: string; value: number; accent?: string }) {
  const IconCmp = icon;
  return (
    <div className="ck-kv" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
      <div className="ck-ico" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--line-strong)', color: accent ?? 'var(--ink-3)', flexShrink: 0 }}>
        <IconCmp size={17} strokeWidth={2.1} />
      </div>
      <div>
        <div className="ck-phos" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
        <div className="ck-dim" style={{ fontSize: 11, lineHeight: 1.2, marginTop: 2, letterSpacing: '0.04em' }}>{label}</div>
      </div>
    </div>
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, flexWrap: 'wrap' }}>
        <Metric icon={Target} label="焦点总数" value={focuses.length} accent="var(--phos)" />
        <Metric icon={Zap} label="今日活跃" value={todayCount} accent="var(--green)" />
        <Metric icon={CircleDot} label="活跃焦点" value={activeCount} accent="var(--phos)" />
        <Metric icon={GitBranch} label="摄取 Runs" value={runsCount} accent="var(--amber)" />
      </div>
      <div className="ck-kv" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div className="ck-dim" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', fontSize: 11 }}>
            <TrendingUp size={13} />
            <span>近 30 天检视</span>
          </div>
          <div className="ck-phos" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{checkinsTotal}</div>
        </div>
        <TrendSparkline trend={trend} />
      </div>
    </div>
  );
}

function Panel({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="ck-panel" style={style}>{children}</div>
  );
}

function FocusDetail({ focus }: { focus?: FocusView }) {
  if (!focus) {
    return (
      <Panel style={{ height: '100%' }}>
        <div className="ck-dim" style={{ height: '100%', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, padding: 24 }}>
          <Target size={24} />
          <span style={{ fontSize: 13 }}>点击左侧气泡查看焦点详情</span>
        </div>
      </Panel>
    );
  }
  const IconCmp = recencyIcons[focus.recencyBucket];
  return (
    <Panel style={{ flexShrink: 0 }}>
      <div style={{ height: 4, background: recencyColors[focus.recencyBucket] }} />
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="ck-phos" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{focus.name}</div>
              <div className="ck-dim" style={{ fontSize: 11, marginTop: 2 }}>{focus.project || '未关联项目'}</div>
            </div>
            <span className="ck-chip" style={{ flexShrink: 0, cursor: 'default' }}>
              <IconCmp size={11} /> {recencyLabels[focus.recencyBucket]}
            </span>
          </div>

          <div className="ck-chips">
            <span className={'ck-chip' + (focus.status === 'active' ? ' on' : '')} style={{ cursor: 'default' }}>{focus.status === 'active' ? '活跃' : focus.status}</span>
            <span className="ck-chip" style={{ cursor: 'default' }}>{formatSinceActivity(focus.hoursSinceActivity)}</span>
            {focus.merged_into && <span className="ck-chip" style={{ cursor: 'default', color: 'var(--amber)', borderColor: 'var(--amber)' }}>已合并</span>}
          </div>

          {focus.keywords.length > 0 && (
            <div>
              <div className="ck-hairline" style={{ margin: '0 0 8px' }}>KEYWORDS // 关键词</div>
              <div className="ck-chips">
                {focus.keywords.map((keyword) => (
                  <span key={keyword} className="ck-chip" style={{ cursor: 'default' }}>{keyword}</span>
                ))}
              </div>
            </div>
          )}

          <div className="ck-hairline" style={{ margin: 0 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['最近活跃', focus.last_activity_at], ['创建于', focus.created_at], ['更新于', focus.updated_at]].map(([label, iso]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span className="ck-dim" style={{ fontSize: 12, flexShrink: 0 }}>{label}</span>
                <span className="ck-sub" style={{ fontSize: 12, textAlign: 'right' }}>{new Date(iso).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** 归因决策时间线 —— 文档核心价值之一：回看 FIE 如何归因每个事件。 */
function AttributionTimeline({ runs }: { runs: FieRunSummary[] }) {
  return (
    <Panel style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-hairline" style={{ margin: 0, padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
        <Sparkles size={14} color="var(--phos)" />
        <span>归因决策</span>
        <span className="ck-dim" style={{ fontWeight: 400, letterSpacing: '0.04em' }}>最近 {runs.length} 次摄取</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        {runs.length === 0 ? (
          <div className="ck-dim" style={{ height: '100%', minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>暂无摄取记录</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {runs.map((run, index) => {
              const color = run.decision ? decisionColors[run.decision] ?? 'var(--ink-3)' : 'var(--ink-3)';
              const isLast = index === runs.length - 1;
              return (
                <div key={run.id} style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, marginTop: 4, boxShadow: `0 0 6px ${color}` }} />
                    {!isLast && <div style={{ flex: 1, width: 2, background: 'var(--line)', margin: '2px 0' }} />}
                  </div>
                  <div style={{ paddingBottom: isLast ? 0 : 16, minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color }}>{run.decision ? decisionLabels[run.decision] ?? run.decision : '—'}</span>
                      <span className="ck-dim" style={{ fontSize: 11, flexShrink: 0 }}>{new Date(run.occurred_at).toLocaleString()}</span>
                    </div>
                    <div className="ck-dim" style={{ fontSize: 11, marginBottom: run.reason ? 2 : 0 }}>
                      <span>{run.source}</span> · {run.event_type}
                    </div>
                    {run.reason && (
                      <div className="ck-sub" style={{ fontSize: 11, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{run.reason}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">FOCUS</span>
        <span className="zh">焦点</span>
        <span className="sub">ATTENTION SCAN // 关注·检视·健康度</span>
      </div>

      <div className="ck-tools">
        <span className="ck-dim" style={{ fontSize: 12 }}>回看近期注意力分布与 FIE 归因决策 · 越靠近中心越近期活跃</span>
        <div className="ck-spacer" />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'active' | 'all')}
          style={{
            fontFamily: 'inherit',
            fontSize: 11,
            letterSpacing: '0.06em',
            color: 'var(--ink-2)',
            background: 'var(--bg2)',
            border: '1px solid var(--line-strong)',
            borderRadius: 4,
            padding: '5px 10px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="active">仅活跃焦点</option>
          <option value="all">包含已归档</option>
        </select>
      </div>

      {errorMessage && (
        <div className="ck-panel" style={{ borderColor: 'var(--red)', background: 'rgba(248,113,113,0.04)', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
          <CloudOff size={16} color="var(--red)" />
          <span className="ck-err" style={{ fontSize: 13 }}>{errorMessage}</span>
        </div>
      )}

      <OverviewBar focuses={focuses} runsCount={runs.length} checkinsTotal={checkinsTotal} trend={trend} />

      {loading ? (
        <div className="ck-phos" style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size="sm" color="currentColor" emptyColor="var(--line)" />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexDirection: 'row', height: CONTENT_HEIGHT }}>
          <Panel style={{ flex: '0 0 auto', width: CONTENT_HEIGHT, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, height: CONTENT_HEIGHT }}>
            <BubbleChart focuses={focuses} selectedId={selectedId} onSelect={(focus) => setSelectedId(focus.id)} />
          </Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0, minHeight: 0 }}>
            <FocusDetail focus={selected} />
            <AttributionTimeline runs={runs} />
          </div>
        </div>
      )}
    </div>
  );
}
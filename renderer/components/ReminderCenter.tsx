import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Spinner, useToast } from '@chakra-ui/react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Folder,
  Info,
  RefreshCw,
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
  return (
    <span
      className={'check ' + (type === 'action' ? 'p1' : 'p3')}
      title={type === 'action' ? '需处理' : '告知'}
    />
  );
}

// Agent 标记
function AgentBadge({ agentId, priority }: { agentId: string | null; priority: string | null }) {
  if (!agentId) return null;
  return (
    <span
      className={'tag ' + (priority === 'high' ? 'ck-err' : 'ck-phos')}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      <Bot size={10} />
      {agentId}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: ReminderSeverity }) {
  if (severity === 'error') return <AlertTriangle size={13} className="ck-err" />;
  if (severity === 'warning') return <AlertTriangle size={13} className="ck-warn" />;
  return <Info size={13} color="var(--uu-icon-muted)" />;
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

  const actionItems = items.filter((it) => it.type === 'action');
  const errorItems = items.filter(
    (it) => it.type !== 'action' && (it.severity === 'error' || it.severity === 'warning'),
  );
  const infoItems = items.filter(
    (it) => it.type !== 'action' && it.severity !== 'error' && it.severity !== 'warning',
  );

  const renderRow = (it: Reminder) => {
    const sel = selectedId === it.id;
    return (
      <div
        key={it.id}
        className="ck-row"
        style={{
          cursor: 'pointer',
          borderRadius: sel ? 3 : undefined,
          background: sel ? 'rgba(103,232,249,0.07)' : undefined,
          boxShadow: sel ? 'inset 0 0 0 1px var(--line-strong)' : undefined,
        }}
        onClick={() => setSelectedId(it.id)}
      >
        <TypeDot type={it.type} />
        <div className="ck-item" style={{ flex: 1 }}>
          <div className="ck-item-main">
            <div className="ck-item-title">{it.title}</div>
            {it.body && <div className="ck-dim" style={{ fontSize: 11 }}>{it.body}</div>}
          </div>
        </div>
        <span className="tag">{it.type === 'action' ? 'ACTION' : 'INFO'}</span>
        {it.stage ? (
          <span className="tag">{it.stage}</span>
        ) : (
          <SeverityIcon severity={it.severity} />
        )}
        {it.project && <span className="tag">{it.project}</span>}
        {it.agentId && <Bot size={13} className="ck-phos" style={{ flexShrink: 0 }} />}
        <span className="ck-util">{formatRelativeTime(it.createdAt)}</span>
      </div>
    );
  };

  return (
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">ALERTS</span>
        <span className="zh">提醒</span>
        <span className="sub">PAGER // 通知中心</span>
      </div>

      <div className="ck-tools">
        <span className="ck-chips">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={'ck-chip' + (status === opt.value ? ' on' : '')}
              onClick={() => {
                setStatus(opt.value);
                setSelectedId(null);
              }}
            >
              {opt.label}
            </button>
          ))}
        </span>
        <div className="ck-spacer" />
        {projects.length > 0 && (
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            title="筛选项目"
            style={{
              fontFamily: 'inherit',
              fontSize: '10.5px',
              letterSpacing: '0.04em',
              color: 'var(--ink-2)',
              background: 'var(--bg2)',
              border: '1px solid var(--line-strong)',
              borderRadius: 3,
              padding: '3px 8px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <option value="all">◈ 全部项目</option>
            {projects.map((p) => (
              <option key={p} value={p}>◈ {p}</option>
            ))}
          </select>
        )}
        <span className="ck-util">共 {items.length} 条</span>
        <button className="ck-btn" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
        <div className="ck-list" style={{ flex: '0 0 55%', minWidth: 0 }}>
          {loading && items.length === 0 ? (
            <div className="ck-empty" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div className="code">ALERTS // SYNC</div>
              <Spinner size="sm" />
            </div>
          ) : items.length === 0 ? (
            <div className="ck-empty" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="code">NO SIGNAL</div>
              {status === 'all' ? '暂无提醒' : '该筛选下暂无提醒'}
            </div>
          ) : (
            <>
              {actionItems.length > 0 && (
                <>
                  <div className="ck-hairline danger">ACTION // 待确认 <span className="n">{actionItems.length}</span></div>
                  {actionItems.map(renderRow)}
                </>
              )}
              {errorItems.length > 0 && (
                <>
                  <div className="ck-hairline ck-err">ERROR // 告警 <span className="n">{errorItems.length}</span></div>
                  {errorItems.map(renderRow)}
                </>
              )}
              {infoItems.length > 0 && (
                <>
                  <div className="ck-hairline">INFO // 通知 <span className="n">{infoItems.length}</span></div>
                  {infoItems.map(renderRow)}
                </>
              )}
            </>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <div className="ck-empty" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="code">NO SELECT</div>
              请选择一条提醒查看详情
            </div>
          ) : (
            <div className="ck-panel brackets" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13.5, color: 'var(--phos)', letterSpacing: '0.04em', wordBreak: 'break-word' }}>
                    {selected.title}
                  </div>
                  <AgentBadge agentId={selected.agentId} priority={selected.priority} />
                </div>
                <div className="ck-tools" style={{ marginTop: 8 }}>
                  <span className="ck-util" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={12} /> 创建 {formatRelativeTime(selected.createdAt)}
                  </span>
                  <span className="ck-util">更新 {formatRelativeTime(selected.updatedAt)}</span>
                  {selected.project && (
                    <span className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Folder size={10} /> {selected.project}
                    </span>
                  )}
                  {selected.topic && <span className="tag">{selected.topic}</span>}
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 14px' }}>
                {selected.body ? (
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, color: 'var(--ink)' }}>
                    {selected.body}
                  </div>
                ) : (
                  <div className="ck-dim" style={{ fontSize: 11 }}>NO PAYLOAD</div>
                )}
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
                <ReminderResponsePanel reminder={selected} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
        <CheckCircle2 size={14} className="ck-ok" />
        <span className="ck-sub">
          已响应：<span className="ck-phos">{label}</span> · {formatRelativeTime(reminder.response.respondedAt)}
        </span>
      </div>
    );
  }

  if (reminder.status === 'dismissed') {
    return (
      <div className="ck-dim" style={{ fontSize: 12.5 }}>
        已忽略 · {formatRelativeTime(reminder.doneAt ?? reminder.updatedAt)}
      </div>
    );
  }

  if (!reminder.actions || reminder.actions.length === 0) {
    if (reminder.type !== 'action') return null;
    return (
      <button className="ck-btn" onClick={() => void dismiss()} disabled={submitting}>
        忽略这条
      </button>
    );
  }

  const actionClass = (style?: ReminderAction['style']) =>
    style === 'primary' ? ' primary' : style === 'danger' ? ' danger' : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="ck-dim" style={{ fontSize: 11 }}>请选择一个响应</span>
      <div className="ck-tools">
        {reminder.actions.map((action) => (
          <button
            key={action.id}
            className={'ck-btn' + actionClass(action.style)}
            disabled={submitting}
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
          </button>
        ))}
        <button className="ck-btn" onClick={() => void dismiss()} disabled={submitting}>忽略</button>
      </div>
      {pendingAction && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <span className="ck-dim" style={{ fontSize: 11 }}>
            按 <span className="ck-warn">{pendingAction.label}</span> 需要填写理由
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="请说明理由..."
            rows={2}
            disabled={submitting}
            style={{
              fontFamily: 'inherit',
              fontSize: 12.5,
              color: 'var(--ink)',
              background: 'var(--bg)',
              border: '1px solid var(--line-strong)',
              borderRadius: 4,
              padding: '8px 10px',
              resize: 'vertical',
              outline: 'none',
              minWidth: 0,
            }}
          />
          <div className="ck-tools">
            <button
              className={'ck-btn' + actionClass(pendingAction.style)}
              disabled={!reason.trim() || submitting}
              onClick={() => void submit(pendingAction, reason.trim())}
            >
              提交 {pendingAction.label}
            </button>
            <button className="ck-btn" onClick={() => { setPendingAction(null); setReason(''); }}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
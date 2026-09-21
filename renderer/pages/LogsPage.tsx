import React, { useEffect, useMemo, useState } from 'react';
import { Select, useToast } from '@chakra-ui/react';
import { FolderOpen, RefreshCw, Trash2 } from 'lucide-react';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  time: string;
  level: LogLevel;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

function parseLog(line: string): LogEntry | null {
  try {
    return JSON.parse(line) as LogEntry;
  } catch {
    return null;
  }
}

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'ck-dim',
  info: 'ck-phos',
  warn: 'ck-warn',
  error: 'ck-err',
};

function formatTime(time: string): string {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return time;
  return date.toLocaleString();
}

export default function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<'all' | LogLevel>('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const entries = useMemo(() => lines.map(parseLog).filter(Boolean) as LogEntry[], [lines]);
  const scopes = useMemo(() => Array.from(new Set(entries.map((entry) => entry.scope))).sort(), [entries]);
  const filteredEntries = useMemo(() => entries.filter((entry) => {
    if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
    if (scopeFilter !== 'all' && entry.scope !== scopeFilter) return false;
    return true;
  }).reverse(), [entries, levelFilter, scopeFilter]);

  async function loadLogs() {
    setIsLoading(true);
    try {
      const [recent, path] = await Promise.all([
        window.assistant.readRecentLogs(500),
        window.assistant.getLogPath(),
      ]);
      setLines(recent);
      setLogPath(path);
    } catch (error) {
      const description = error instanceof Error ? error.message : '读取日志失败';
      toast({ title: '读取日志失败', description, status: 'error', duration: 2500 });
    } finally {
      setIsLoading(false);
    }
  }

  async function openDir() {
    const result = await window.assistant.openLogsDir();
    if (!result.success) toast({ title: '打开日志目录失败', status: 'error', duration: 2500 });
  }

  async function clearAllLogs() {
    if (!window.confirm('确定清空所有日志吗？')) return;
    const result = await window.assistant.clearLogs();
    if (!result.success) {
      toast({ title: '清空日志失败', status: 'error', duration: 2500 });
      return;
    }
    toast({ title: '日志已清空', status: 'success', duration: 2000 });
    await loadLogs();
  }

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">DATA LOG</span>
        <span className="zh">日志</span>
        <span className="sub">STREAM // 结构化日志</span>
      </div>

      <div className="ck-tools">
        <button className="ck-btn" onClick={loadLogs}>{isLoading ? '读取中…' : <><RefreshCw size={12} /> 刷新</>}</button>
        <button className="ck-btn" onClick={openDir}><FolderOpen size={12} /> 打开目录</button>
        <button className="ck-btn danger" onClick={clearAllLogs}><Trash2 size={12} /> 清空</button>
        <div className="ck-spacer" />
        <Select size="sm" w="150px" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as 'all' | LogLevel)}>
          <option value="all">全部级别</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </Select>
        <Select size="sm" w="190px" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}>
          <option value="all">全部模块</option>
          {scopes.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
        </Select>
        <span className="ck-util">显示 {filteredEntries.length} / {entries.length} 条</span>
      </div>

      <div className="ck-hairline" style={{ marginTop: 4 }}>RECENT // 最近日志 <span className="n">{filteredEntries.length}</span></div>

      <div className="ck-list">
        {filteredEntries.length === 0 ? (
          <div className="ck-empty"><div className="code">NO DATA</div>暂无日志</div>
        ) : (
          filteredEntries.map((entry, index) => (
            <div key={index} className="ck-row" style={{ alignItems: 'flex-start' }}>
              <span className="ck-util" style={{ flexShrink: 0, minWidth: 130 }}>{formatTime(entry.time)}</span>
              <span className={LEVEL_CLASS[entry.level]} style={{ flexShrink: 0, width: 44, fontSize: 10, letterSpacing: '0.08em' }}>{entry.level.toUpperCase()}</span>
              <span className="ck-sub" style={{ flexShrink: 0, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.scope}</span>
              <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-all', fontSize: 12 }}>
                {entry.message}
                {entry.meta ? <span className="ck-dim"> {JSON.stringify(entry.meta)}</span> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Box, Button, Flex, Heading, Select, Text, useToast } from '@chakra-ui/react';
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

function levelColor(level: LogLevel): string {
  if (level === 'error') return 'red';
  if (level === 'warn') return 'orange';
  if (level === 'info') return 'blue';
  return 'gray';
}

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
    <Box h="calc(100vh - 132px)" minH="520px" bg="gray.50" borderRadius="lg" overflow="hidden" border="1px solid" borderColor="gray.100">
      <Flex direction="column" h="100%" minH={0}>
        <Box px={4} py={3} borderBottom="1px solid" borderColor="gray.100" bg="white">
          <Flex justify="space-between" align="center" gap={3} mb={2}>
            <Box minW={0}>
              <Heading size="sm">日志管理</Heading>
              <Text fontSize="xs" color="gray.500" noOfLines={1}>{logPath || '日志路径加载中...'}</Text>
            </Box>
            <Flex gap={2} flexShrink={0}>
              <Button size="sm" leftIcon={<RefreshCw size={14} />} onClick={loadLogs} isLoading={isLoading}>刷新</Button>
              <Button size="sm" leftIcon={<FolderOpen size={14} />} onClick={openDir}>打开目录</Button>
              <Button size="sm" colorScheme="red" variant="outline" leftIcon={<Trash2 size={14} />} onClick={clearAllLogs}>清空</Button>
            </Flex>
          </Flex>
          <Flex gap={2} align="center">
            <Select size="sm" w="140px" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as 'all' | LogLevel)}>
              <option value="all">全部级别</option>
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </Select>
            <Select size="sm" w="180px" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}>
              <option value="all">全部模块</option>
              {scopes.map((scope) => <option key={scope} value={scope}>{scope}</option>)}
            </Select>
            <Text fontSize="xs" color="gray.500">显示 {filteredEntries.length} / {entries.length} 条</Text>
          </Flex>
        </Box>

        <Box flex={1} minH={0} overflow="auto" p={3}>
          {filteredEntries.length === 0 ? (
            <Flex h="100%" align="center" justify="center" color="gray.500" fontSize="sm">暂无日志</Flex>
          ) : (
            <Flex direction="column" gap={2}>
              {filteredEntries.map((entry, index) => (
                <Box key={`${entry.time}-${index}`} bg="white" border="1px solid" borderColor="gray.100" borderRadius="md" p={3} boxShadow="0 6px 16px rgba(15, 23, 42, 0.04)">
                  <Flex gap={2} align="center" mb={1} wrap="wrap">
                    <Badge colorScheme={levelColor(entry.level)}>{entry.level}</Badge>
                    <Badge variant="subtle" colorScheme="purple">{entry.scope}</Badge>
                    <Text fontSize="xs" color="gray.500">{formatTime(entry.time)}</Text>
                  </Flex>
                  <Text fontSize="sm" fontWeight="medium" color="gray.800">{entry.message}</Text>
                  {entry.meta && (
                    <Box as="pre" mt={2} p={2} bg="gray.50" borderRadius="md" overflowX="auto" fontSize="xs" color="gray.600" whiteSpace="pre-wrap">
                      {JSON.stringify(entry.meta, null, 2)}
                    </Box>
                  )}
                </Box>
              ))}
            </Flex>
          )}
        </Box>
      </Flex>
    </Box>
  );
}

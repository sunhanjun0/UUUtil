import React, { useEffect, useState } from 'react';
import { Box, Button, Flex, Heading, IconButton, Text, useToast } from '@chakra-ui/react';
import { Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react';
import { foregroundRoutes } from '../router';
import type { RouteConfig } from '../router';
import type { TabLayout } from '../../src/shared/types';

interface TabItem {
  path: string;
  label: string;
  icon: RouteConfig['icon'];
  visible: boolean;
}

/** 依据布局配置把前台路由展开成有序、带显隐标记的列表（含被隐藏项）。 */
function buildItems(layout: TabLayout): TabItem[] {
  const byPath = new Map(foregroundRoutes.map((route) => [route.path, route]));
  const seen = new Set<string>();
  const ordered: RouteConfig[] = [];
  for (const path of layout.order) {
    const route = byPath.get(path);
    if (route && !seen.has(path)) {
      ordered.push(route);
      seen.add(path);
    }
  }
  for (const route of foregroundRoutes) {
    if (!seen.has(route.path)) ordered.push(route);
  }
  const hidden = new Set(layout.hidden);
  return ordered.map((route) => ({
    path: route.path,
    label: route.label,
    icon: route.icon,
    visible: !hidden.has(route.path),
  }));
}

export default function InterfaceSettingsPage() {
  const toast = useToast();
  const [items, setItems] = useState<TabItem[]>(() => buildItems({ order: [], hidden: [] }));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const layout = await window.assistant.ui.getTabLayout();
      setItems(buildItems(layout));
    } catch { /* browser 环境无 assistant */ }
  }

  function toggleVisible(path: string) {
    setItems((prev) => prev.map((item) => (item.path === path ? { ...item, visible: !item.visible } : item)));
  }

  function handleDrop(targetIndex: number) {
    setItems((prev) => {
      if (dragIndex === null || dragIndex === targetIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function save() {
    setSaving(true);
    try {
      const layout: TabLayout = {
        order: items.map((item) => item.path),
        hidden: items.filter((item) => !item.visible).map((item) => item.path),
      };
      const result = await window.assistant.ui.saveTabLayout(layout);
      if (result.success) {
        window.dispatchEvent(new Event('uuutil:tab-layout-changed'));
        toast({ title: '已保存', status: 'success', duration: 1500 });
      } else {
        toast({ title: '保存失败', status: 'error', duration: 2500 });
      }
    } catch {
      toast({ title: '保存失败', status: 'error', duration: 2500 });
    } finally {
      setSaving(false);
    }
  }

  function resetDefault() {
    setItems(buildItems({ order: [], hidden: [] }));
  }

  const visibleCount = items.filter((item) => item.visible).length;

  return (
    <Flex direction="column" h="100%" minH={0}>
      <Box p={3} borderBottom="1px solid" borderColor="gray.100">
        <Flex align="center" justify="space-between" mb={1}>
          <Box>
            <Heading size="sm">界面设置 · TAB 栏</Heading>
            <Text fontSize="xs" color="gray.500">拖动排序，点击眼睛图标切换显隐（仅影响前台工具栏）</Text>
          </Box>
          <Flex gap={2} flexShrink={0}>
            <Button size="sm" variant="outline" leftIcon={<RotateCcw size={14} />} onClick={resetDefault}>恢复默认</Button>
            <Button size="sm" colorScheme="blue" onClick={save} isLoading={saving}>保存</Button>
          </Flex>
        </Flex>
        <Text fontSize="xs" color="gray.500">当前显示 {visibleCount} / {items.length} 个标签</Text>
      </Box>

      <Box flex={1} minH={0} overflow="auto" p={3}>
        <Flex direction="column" gap={2}>
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <Flex
                key={item.path}
                align="center"
                gap={3}
                p={2}
                pl={2}
                bg="white"
                border="1px solid"
                borderColor={dragIndex === index ? 'blue.300' : 'gray.100'}
                borderRadius="md"
                boxShadow="0 6px 16px rgba(15, 23, 42, 0.04)"
                opacity={item.visible ? 1 : 0.5}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(index)}
                onDragEnd={() => setDragIndex(null)}
                cursor="grab"
                transition="border-color 0.15s"
              >
                <Box color="gray.400" flexShrink={0}><GripVertical size={16} /></Box>
                <Box color="gray.600" flexShrink={0}><Icon size={16} strokeWidth={1.8} /></Box>
                <Text flex={1} fontSize="sm" fontWeight={500} color="gray.800">{item.label}</Text>
                <IconButton
                  size="xs"
                  variant="ghost"
                  aria-label={item.visible ? '隐藏' : '显示'}
                  title={item.visible ? '隐藏' : '显示'}
                  color={item.visible ? 'blue.500' : 'gray.400'}
                  icon={item.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                  onClick={() => toggleVisible(item.path)}
                />
              </Flex>
            );
          })}
        </Flex>
      </Box>
    </Flex>
  );
}

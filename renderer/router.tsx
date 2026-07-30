import React, { Suspense, lazy, ComponentType } from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { Bell, Bot, Calculator, Clipboard, Clock, Code2, FileText, Home, Languages, MessageCircle, Palette, ScrollText, SlidersHorizontal, Terminal } from 'lucide-react';
import type { TabLayout } from '../src/shared/types';

const HomePage = lazy(() => import('./pages/HomePage'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'));
const TranslationPage = lazy(() => import('./pages/TranslationPage'));
const AssistantPage = lazy(() => import('./pages/AssistantPage'));
const CalculatorPage = lazy(() => import('./pages/CalculatorPage'));
const DevUtilsPage = lazy(() => import('./pages/DevUtilsPage'));
const ColorResearchPage = lazy(() => import('./pages/ColorResearchPage'));
const AiConfigPage = lazy(() => import('./pages/AiConfigPage'));
const LogsPage = lazy(() => import('./pages/LogsPage'));
const TerminalPage = lazy(() => import('./pages/TerminalPage'));
const FocusPage = lazy(() => import('./pages/FocusPage'));
const ReminderCenterPage = lazy(() => import('./pages/ReminderCenterPage'));
const ClipboardHistoryPage = lazy(() => import('./pages/ClipboardHistoryPage'));
const InterfaceSettingsPage = lazy(() => import('./pages/InterfaceSettingsPage'));

export interface RouteConfig {
  path: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  component: ComponentType;
  panel: 'front' | 'back';
}

export const routes: RouteConfig[] = [
  { path: '/', label: '首页', icon: Home, component: HomePage, panel: 'front' },
  { path: '/focus', label: '焦点', icon: Clock, component: FocusPage, panel: 'front' },
  { path: '/reminders', label: '提醒', icon: Bell, component: ReminderCenterPage, panel: 'front' },
  { path: '/clipboard', label: '剪贴板', icon: Clipboard, component: ClipboardHistoryPage, panel: 'front' },
  { path: '/knowledge-base', label: '知识库', icon: ScrollText, component: KnowledgeBasePage, panel: 'front' },
  { path: '/assistant', label: '助手', icon: MessageCircle, component: AssistantPage, panel: 'front' },
  { path: '/translation', label: '翻译', icon: Languages, component: TranslationPage, panel: 'front' },
  { path: '/calculator', label: '计算器', icon: Calculator, component: CalculatorPage, panel: 'front' },
  { path: '/dev-utils', label: '开发工具', icon: Code2, component: DevUtilsPage, panel: 'front' },
  { path: '/terminal', label: '终端', icon: Terminal, component: TerminalPage, panel: 'front' },
  { path: '/color-research', label: '配色', icon: Palette, component: ColorResearchPage, panel: 'front' },
  { path: '/ai-config', label: 'AI 配置', icon: Bot, component: AiConfigPage, panel: 'back' },
  { path: '/logs', label: '日志', icon: FileText, component: LogsPage, panel: 'back' },
  { path: '/interface-settings', label: '界面设置', icon: SlidersHorizontal, component: InterfaceSettingsPage, panel: 'back' },
];

export const foregroundRoutes = routes.filter((route) => route.panel === 'front');
export const backgroundRoutes = routes.filter((route) => route.panel === 'back');

/**
 * 按布局配置（顺序 + 隐藏）过滤并排序一组路由，仅用于前台可配置 tab。
 * - order 中出现的路径按其顺序排列；未在 order 中的路由（如新增 tab）按原顺序追加到末尾。
 * - hidden 中的路径被过滤掉。
 */
export function applyTabLayout(list: RouteConfig[], layout: TabLayout): RouteConfig[] {
  const byPath = new Map(list.map((route) => [route.path, route]));
  const seen = new Set<string>();
  const ordered: RouteConfig[] = [];
  for (const path of layout.order) {
    const route = byPath.get(path);
    if (route && !seen.has(path)) {
      ordered.push(route);
      seen.add(path);
    }
  }
  for (const route of list) {
    if (!seen.has(route.path)) ordered.push(route);
  }
  const hidden = new Set(layout.hidden);
  return ordered.filter((route) => !hidden.has(route.path));
}

const fallback = (
  <Box display="flex" alignItems="center" justifyContent="center" py={10}>
    <Spinner size="sm" color="blue.500" />
  </Box>
);

export function RouteRenderer({ path }: { path: string }) {
  const route = routes.find((r) => r.path === path);
  if (!route) return null;
  const Page = route.component;
  return (
    <Suspense fallback={fallback}>
      <Page />
    </Suspense>
  );
}

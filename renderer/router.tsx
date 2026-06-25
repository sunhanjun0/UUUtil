import React, { Suspense, lazy, ComponentType } from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { Bot, Calculator, Code2, FileText, Home, Languages, MessageCircle, Palette, ScrollText, Terminal } from 'lucide-react';

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

export interface RouteConfig {
  path: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  component: ComponentType;
  panel: 'front' | 'back';
}

export const routes: RouteConfig[] = [
  { path: '/', label: '首页', icon: Home, component: HomePage, panel: 'front' },
  { path: '/knowledge-base', label: '知识库', icon: ScrollText, component: KnowledgeBasePage, panel: 'front' },
  { path: '/assistant', label: '助手', icon: MessageCircle, component: AssistantPage, panel: 'front' },
  { path: '/translation', label: '翻译', icon: Languages, component: TranslationPage, panel: 'front' },
  { path: '/calculator', label: '计算器', icon: Calculator, component: CalculatorPage, panel: 'front' },
  { path: '/dev-utils', label: '开发工具', icon: Code2, component: DevUtilsPage, panel: 'front' },
  { path: '/terminal', label: '终端', icon: Terminal, component: TerminalPage, panel: 'front' },
  { path: '/color-research', label: '配色', icon: Palette, component: ColorResearchPage, panel: 'front' },
  { path: '/ai-config', label: 'AI 配置', icon: Bot, component: AiConfigPage, panel: 'back' },
  { path: '/logs', label: '日志', icon: FileText, component: LogsPage, panel: 'back' },
];

export const foregroundRoutes = routes.filter((route) => route.panel === 'front');
export const backgroundRoutes = routes.filter((route) => route.panel === 'back');

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

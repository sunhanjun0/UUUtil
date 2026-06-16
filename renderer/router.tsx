import React, { Suspense, lazy, ComponentType } from 'react';
import { Box, Spinner } from '@chakra-ui/react';

const HomePage = lazy(() => import('./pages/HomePage'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'));
const CalculatorPage = lazy(() => import('./pages/CalculatorPage'));
const DevUtilsPage = lazy(() => import('./pages/DevUtilsPage'));
const ColorResearchPage = lazy(() => import('./pages/ColorResearchPage'));

export interface RouteConfig {
  path: string;
  label: string;
  icon: string;
  component: ComponentType;
}

export const routes: RouteConfig[] = [
  { path: '/', label: '首页', icon: '🏠', component: HomePage },
  { path: '/knowledge-base', label: '知识库', icon: '📚', component: KnowledgeBasePage },
  { path: '/calculator', label: '计算器', icon: '🔢', component: CalculatorPage },
  { path: '/dev-utils', label: '开发工具', icon: '🛠', component: DevUtilsPage },
  { path: '/color-research', label: '配色', icon: '🎨', component: ColorResearchPage },
];

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

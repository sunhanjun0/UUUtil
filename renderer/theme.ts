/**
 * Chakra UI 主题配置 + 可切换主题（浅色 Chakra / 暗色驾驶舱）
 *
 * 切换机制：两个完整 Chakra 主题共用一套组件/全局样式，仅 `colors` 调色板不同。
 * 页面里到处用的 `bg="white"` / `color="gray.800"` / `colorScheme="blue"` 都落在
 * `theme.colors` 上，换主题对象即可整体换肤，无需逐页改写颜色。
 */

import { createContext, useContext } from 'react';

// ============ 驾驶舱调色板工具 ============
function mix(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{6})$/i.exec(a);
  const pb = /^#([0-9a-f]{6})$/i.exec(b);
  if (!pa || !pb) return a;
  const A = parseInt(pa[1], 16);
  const B = parseInt(pb[1], 16);
  const rA = (A >> 16) & 255, gA = (A >> 8) & 255, bA = A & 255;
  const rB = (B >> 16) & 255, gB = (B >> 8) & 255, bB = B & 255;
  const rr = Math.round(rA + (rB - rA) * t);
  const gg = Math.round(gA + (gB - gA) * t);
  const bb = Math.round(bA + (bB - bA) * t);
  return '#' + ((1 << 24) + (rr << 16) + (gg << 8) + bb).toString(16).slice(1);
}

const DARK = '#0b1424';
const WHITE = '#ffffff';

/** 语义色 ramp：50–400 向深底淡化（微妙底色），500/600 本体，700–900 向白提亮（文本强调）。 */
function accentRamp(hex: string) {
  return {
    50: mix(hex, DARK, 0.92),
    100: mix(hex, DARK, 0.84),
    200: mix(hex, DARK, 0.70),
    300: mix(hex, DARK, 0.45),
    400: mix(hex, DARK, 0.20),
    500: hex,
    600: mix(hex, DARK, 0.10),
    700: mix(hex, WHITE, 0.25),
    800: mix(hex, WHITE, 0.45),
    900: mix(hex, WHITE, 0.60),
  };
}

/**
 * 驾驶舱 colors 覆盖（只覆盖需要换的关键 key，其余自动并入 Chakra 默认）。
 * 设计来源：ui-design-language.md §二（#060d18 深空 / #67e8f9 磷光青 / #fbbf24 琥珀 / #f87171 红 / #34d399 绿）。
 * gray 反相：浅色主题里 gray.800 是深文字 → 驾驶舱里是浅色墨；gray.50/100 是浅底 → 深底。
 */
const cockpitColors = {
  white: '#0b1424',
  black: '#030810',
  whiteAlpha: {
    50: 'rgba(6, 13, 24, 0.04)',
    100: 'rgba(6, 13, 24, 0.06)',
    200: 'rgba(6, 13, 24, 0.08)',
    300: 'rgba(6, 13, 24, 0.16)',
    400: 'rgba(6, 13, 24, 0.24)',
    500: 'rgba(6, 13, 24, 0.36)',
    600: 'rgba(6, 13, 24, 0.48)',
    700: 'rgba(6, 13, 24, 0.64)',
    800: 'rgba(6, 13, 24, 0.80)',
    900: 'rgba(6, 13, 24, 0.92)',
  },
  gray: {
    50: '#0a1424',
    100: '#0d1b2e',
    200: '#13253b',
    300: '#3b6b7e',
    400: '#5f8098',
    500: '#6f93ac',
    600: '#8fb3c7',
    700: '#b7cfe0',
    800: '#d7ecf5',
    900: '#eaf6fc',
  },
  blue: accentRamp('#67e8f9'),
  cyan: accentRamp('#67e8f9'),
  teal: accentRamp('#2dd4bf'),
  green: accentRamp('#34d399'),
  yellow: accentRamp('#fbbf24'),
  orange: accentRamp('#fb923c'),
  red: accentRamp('#f87171'),
  purple: accentRamp('#c4b5fd'),
  pink: accentRamp('#f9a8d4'),
};

// ============ 共享的组件 / 全局样式 ============
const baseStyles = {
  global: {
    'html, body, #root': { background: 'transparent', height: '100%', overflow: 'hidden' },
  },
};

const baseComponents = {
  Button: {
    baseStyle: {
      fontWeight: 500,
      transition: 'all 0.2s ease',
    },
  },
  Tabs: {
    variants: {
      unstyled: {
        root: { border: 'none' },
        tablist: { border: 'none', borderBottom: 'none !important' },
        tab: {
          border: 'none', boxShadow: 'none', outline: 'none',
          _focus: { boxShadow: 'none', outline: 'none', border: 'none' },
          _focusVisible: { boxShadow: 'none', outline: 'none', border: 'none' },
          _selected: { border: 'none', boxShadow: 'none', outline: 'none' },
          _hover: { border: 'none', boxShadow: 'none' },
        },
      },
    },
  },
};

export const chakraThemeConfig = {
  config: { initialColorMode: 'light' as const, useSystemColorMode: false },
  styles: baseStyles,
  components: baseComponents,
};

export const cockpitThemeConfig = {
  config: { initialColorMode: 'dark' as const, useSystemColorMode: false },
  styles: baseStyles,
  components: baseComponents,
  colors: cockpitColors,
};

// ============ 主题模式：持久化 + 上下文 ============
export type ThemeMode = 'chakra' | 'cockpit';

export const THEME_MODE_KEY = 'uuutil:theme';

export function readThemeMode(): ThemeMode {
  try {
    return localStorage.getItem(THEME_MODE_KEY) === 'cockpit' ? 'cockpit' : 'chakra';
  } catch {
    return 'chakra';
  }
}

export interface ThemeModeValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeModeContext = createContext<ThemeModeValue>({
  mode: 'chakra',
  setMode: () => {},
});

export function useThemeMode(): ThemeModeValue {
  return useContext(ThemeModeContext);
}
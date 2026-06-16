import React, { useState, useMemo } from 'react';
import {
  Box, Flex, Heading, Input, Text, Button, Stack, Select, Badge, Code, Tabs, TabList, Tab, TabPanels, TabPanel, SimpleGrid,
} from '@chakra-ui/react';

// ===== 颜色工具函数 =====
function hexToHsl(hex: string) {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16) / 255;
    g = parseInt(hex[2] + hex[2], 16) / 255;
    b = parseInt(hex[3] + hex[3], 16) / 255;
  } else {
    r = parseInt(hex.slice(1, 3), 16) / 255;
    g = parseInt(hex.slice(3, 5), 16) / 255;
    b = parseInt(hex.slice(5, 7), 16) / 255;
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToHex(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function hexToRgb(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}
function blend(c1: string, c2: string, t: number) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

// ===== 配色方案推荐库 =====
interface ComboRec {
  name: string;
  desc: string;
  style: string;
  primary: string;
  accent: string;
  bg: string;
  surface: string;
  text: string;
}
const recommendedCombos: ComboRec[] = [
  { name: 'GitHub 暗色', desc: '经典开发者主题', style: '科技', primary: '#58a6ff', accent: '#f78166', bg: '#0d1117', surface: '#161b22', text: '#c9d1d9' },
  { name: 'Notion 轻量', desc: '简约知识管理', style: '简约', primary: '#37352f', accent: '#e16259', bg: '#ffffff', surface: '#f7f6f3', text: '#37352f' },
  { name: 'Stripe 渐变', desc: '现代支付风格', style: '现代', primary: '#635bff', accent: '#00d4ff', bg: '#ffffff', surface: '#f6f9fc', text: '#1a1f36' },
  { name: 'Figma 暗紫', desc: '设计工具范', style: '设计', primary: '#a259ff', accent: '#1abcfe', bg: '#1e1e1e', surface: '#2c2c2c', text: '#ffffff' },
  { name: 'Linear 渐变', desc: '项目管理新锐', style: '极简', primary: '#5e6ad2', accent: '#f2a900', bg: '#fcfcfc', surface: '#f2f2f2', text: '#1a1523' },
  { name: 'Vercel 黑白', desc: '部署平台极简', style: '极简', primary: '#000000', accent: '#0070f3', bg: '#ffffff', surface: '#fafafa', text: '#111111' },
  { name: 'Tailwind 青蓝', desc: '原子化 CSS 品牌', style: '清新', primary: '#06b6d4', accent: '#0ea5e9', bg: '#ffffff', surface: '#f8fafc', text: '#0f172a' },
  { name: 'Supabase 绿', desc: '开源后端平台', style: '活力', primary: '#3ecf8e', accent: '#24b47e', bg: '#1c1c1c', surface: '#2a2a2a', text: '#ededed' },
];

// 预设主色
const presets: Record<string, { brand: string; name: string }> = {
  blue:   { brand: '#2563eb', name: '经典蓝' },
  teal:   { brand: '#0d9488', name: '青碧' },
  purple: { brand: '#7c3aed', name: '紫罗兰' },
  rose:   { brand: '#e11d48', name: '玫瑰红' },
  amber:  { brand: '#d97706', name: '琥珀' },
  green:  { brand: '#16a34a', name: '翠绿' },
  cyan:   { brand: '#0891b2', name: '湖蓝' },
  pink:   { brand: '#db2777', name: '粉红' },
};

// ===== 拼色方案生成 =====
type Harmony = 'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'splitComplementary' | 'monochromatic';
const harmonyLabels: Record<Harmony, string> = {
  complementary: '互补色', analogous: '类似色', triadic: '三角色', tetradic: '四角色', splitComplementary: '分裂互补', monochromatic: '同色系',
};

function generateHarmony(hex: string, type: Harmony): string[] {
  const { h, s, l } = hexToHsl(hex);
  switch (type) {
    case 'complementary':      return [hex, hslToHex(h + 180, s, l)];
    case 'analogous':          return [hex, hslToHex(h + 30, s, l), hslToHex(h - 30, s, l)];
    case 'triadic':            return [hex, hslToHex(h + 120, s, l), hslToHex(h - 120, s, l)];
    case 'tetradic':           return [hex, hslToHex(h + 90, s, l), hslToHex(h + 180, s, l), hslToHex(h + 270, s, l)];
    case 'splitComplementary': return [hex, hslToHex(h + 150, s, l), hslToHex(h - 150, s, l)];
    case 'monochromatic':      return [hex, hslToHex(h, s, Math.min(l + 25, 90)), hslToHex(h, Math.max(s - 20, 10), Math.max(l - 15, 10)), hslToHex(h, Math.min(s + 10, 100), Math.min(l + 15, 85))];
  }
}

export default function ColorResearchPage() {
  const [brandColor, setBrandColor] = useState('#2563eb');
  const [secondColor, setSecondColor] = useState('#e11d48');
  const [harmonyType, setHarmonyType] = useState<Harmony>('complementary');
  const [tabIndex, setTabIndex] = useState(0);

  const palette = useMemo(() => {
    const bg = '#ffffff';
    const dark = '#111827';
    const shades = [0.05, 0.1, 0.2, 0.35, 0.6, 1, 1, 1].map((t, i) => {
      if (i < 5) return blend(brandColor, bg, 1 - (i + 1) * 0.18);
      if (i === 5) return brandColor;
      if (i === 6) return blend(brandColor, dark, 0.25);
      return blend(brandColor, dark, 0.5);
    });
    return { shades, lightBg: blend(brandColor, bg, 0.94) };
  }, [brandColor]);

  const harmonyColors = useMemo(() => generateHarmony(brandColor, harmonyType), [brandColor, harmonyType]);

  const comboColors = useMemo(() => {
    // 基于双色生成渐变条
    const stops: string[] = [];
    for (let i = 0; i < 8; i++) {
      stops.push(blend(brandColor, secondColor, i / 7));
    }
    return stops;
  }, [brandColor, secondColor]);

  function applyPreset(key: string) {
    setBrandColor(presets[key].brand);
  }

  return (
    <Box w="100%">
      {/* 主色选择 */}
      <Box bg="white" borderRadius="md" p={4} mb={1.5}>
        <Heading size="xs" mb={1.5}>主色调</Heading>
        <Flex gap={2} wrap="wrap" mb={2}>
          {Object.entries(presets).map(([key, p]) => (
            <Button key={key} size="xs" onClick={() => applyPreset(key)}
              variant={brandColor === p.brand ? 'solid' : 'outline'}
              colorScheme={key === 'teal' ? 'teal' : key === 'purple' ? 'purple' : key === 'rose' ? 'pink' : key === 'amber' ? 'yellow' : key === 'green' ? 'green' : key === 'cyan' ? 'cyan' : key === 'pink' ? 'pink' : 'blue'}
            >
              <Box as="span" w={2.5} h={2.5} borderRadius="full" bg={p.brand} mr={1.5} />
              {p.name}
            </Button>
          ))}
        </Flex>
        <Flex gap={3} align="center">
          <Input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} w="40px" h="40px" p={1} border="none" cursor="pointer" />
          <Input size="sm" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} w="120px" fontFamily="mono" />
        </Flex>
      </Box>

      {/* 色板预览 */}
      <Box bg="white" borderRadius="md" p={4} mb={1.5}>
        <Heading size="xs" mb={1.5}>同色系色板</Heading>
        <Flex gap={0} borderRadius="md" overflow="hidden" h="48px">
          {palette.shades.map((c, i) => (
            <Box key={i} flex={1} bg={c} display="flex" alignItems="flex-end" justifyContent="center" pb={1}>
              <Text fontSize="8px" fontFamily="mono" color={i >= 5 ? 'white' : 'gray.600'}>{c}</Text>
            </Box>
          ))}
        </Flex>
      </Box>

      {/* 拼色方案 */}
      <Box bg="white" borderRadius="md" p={4} mb={1.5}>
        <Heading size="xs" mb={1.5}>拼色方案</Heading>
        <Flex gap={2} wrap="wrap" mb={2}>
          {(Object.keys(harmonyLabels) as Harmony[]).map((h) => (
            <Button key={h} size="xs" onClick={() => setHarmonyType(h)}
              variant={harmonyType === h ? 'solid' : 'outline'}
              colorScheme="blue"
            >
              {harmonyLabels[h]}
            </Button>
          ))}
        </Flex>
        <Flex gap={2} mb={2}>
          {harmonyColors.map((c, i) => (
            <Box key={i} flex={1} h="48px" borderRadius="md" bg={c} display="flex" alignItems="flex-end" justifyContent="center" pb={1}>
              <Text fontSize="8px" fontFamily="mono" color={i === 0 ? 'white' : 'white'} fontWeight={i === 0 ? 800 : 400}>
                {c} {i === 0 ? '(主)' : ''}
              </Text>
            </Box>
          ))}
        </Flex>

        {/* 拼色应用预览 */}
        <Heading size="xs" mb={1.5}>拼色应用示例</Heading>
        <Box borderRadius="md" overflow="hidden">
          <Flex h="28px" bg={harmonyColors[0]} align="center" px={2}>
            <Text fontSize="10px" color="white" fontWeight={600}>导航栏</Text>
          </Flex>
          <Flex>
            <Box w="60px" bg={harmonyColors[1] || harmonyColors[0]} minH="60px" display="flex" alignItems="center" justifyContent="center">
              <Text fontSize="8px" color="white">侧栏</Text>
            </Box>
            <Box flex={1} bg="gray.50" p={2}>
              <Flex gap={1} mb={1}>
                <Box px={2} py={0.5} bg={harmonyColors[0]} borderRadius="sm"><Text fontSize="8px" color="white">主按钮</Text></Box>
                <Box px={2} py={0.5} border="1px solid" borderColor={harmonyColors[2] || harmonyColors[0]} borderRadius="sm"><Text fontSize="8px" color={harmonyColors[2] || harmonyColors[0]}>次按钮</Text></Box>
              </Flex>
              <Box bg="white" p={1.5} borderRadius="sm" borderLeft="3px solid" borderLeftColor={harmonyColors[0]}>
                <Text fontSize="8px" color="gray.600">卡片内容区域</Text>
              </Box>
            </Box>
          </Flex>
        </Box>
      </Box>

      {/* 双色渐变 */}
      <Box bg="white" borderRadius="md" p={4} mb={1.5}>
        <Heading size="xs" mb={1.5}>双色渐变</Heading>
        <Text fontSize="xs" color="gray.400" mb={2}>选择两个颜色，查看渐变过渡效果</Text>
        <Flex gap={3} align="center" mb={2}>
          <Input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} w="36px" h="36px" p={0.5} border="none" cursor="pointer" />
          <Text fontSize="xs" color="gray.400">→</Text>
          <Input type="color" value={secondColor} onChange={(e) => setSecondColor(e.target.value)} w="36px" h="36px" p={0.5} border="none" cursor="pointer" />
          <Input size="xs" value={secondColor} onChange={(e) => setSecondColor(e.target.value)} w="100px" fontFamily="mono" />
        </Flex>
        <Flex gap={0} borderRadius="md" overflow="hidden" h="48px">
          {comboColors.map((c, i) => (
            <Box key={i} flex={1} bg={c} />
          ))}
        </Flex>
      </Box>

      {/* 推荐配色方案 */}
      <Box bg="white" borderRadius="md" p={4} mb={1.5}>
        <Heading size="xs" mb={1.5}>推荐配色方案</Heading>
        <Text fontSize="xs" color="gray.400" mb={2}>知名产品配色参考，点击可应用</Text>
        <SimpleGrid columns={2} gap={2}>
          {recommendedCombos.map((combo, i) => (
            <Box
              key={i}
              bg={combo.bg}
              borderRadius="md"
              p={3}
              cursor="pointer"
              onClick={() => { setBrandColor(combo.primary); setSecondColor(combo.accent); }}
              _hover={{ opacity: 0.9, transform: 'scale(1.02)' }}
              transition="all 0.15s"
              position="relative"
              overflow="hidden"
            >
              <Text fontSize="10px" fontWeight={700} color={combo.text} mb={0.5}>{combo.name}</Text>
              <Text fontSize="8px" color={combo.text} opacity={0.5} mb={1.5}>{combo.desc}</Text>
              <Flex gap={1.5} align="center">
                <Box w="14px" h="14px" borderRadius="full" bg={combo.primary} border="1px solid" borderColor="whiteAlpha.400" />
                <Box w="14px" h="14px" borderRadius="full" bg={combo.accent} border="1px solid" borderColor="whiteAlpha.400" />
                <Box w="14px" h="14px" borderRadius="full" bg={combo.surface} border="1px solid" borderColor="whiteAlpha.400" />
                <Badge fontSize="8px" colorScheme="gray" variant="subtle" ml="auto">{combo.style}</Badge>
              </Flex>
            </Box>
          ))}
        </SimpleGrid>
      </Box>

      {/* 组件预览 */}
      <Box bg="white" borderRadius="md" p={4} mb={1.5}>
        <Heading size="xs" mb={1.5}>组件预览</Heading>
        <Stack gap={2}>
          <Flex gap={2} wrap="wrap">
            <Button size="sm" bg={brandColor} color="white" _hover={{ bg: palette.shades[6] }}>主按钮</Button>
            <Button size="sm" variant="outline" borderColor={harmonyColors[1]} color={harmonyColors[1]}>次按钮</Button>
            <Button size="sm" variant="ghost">幽灵按钮</Button>
          </Flex>
          <Flex gap={2} wrap="wrap">
            <Badge bg={palette.lightBg} color={brandColor} variant="subtle">标签</Badge>
            <Badge bg={blend(harmonyColors[1], '#fff', 0.85)} color={harmonyColors[1]} variant="subtle">拼色标签</Badge>
            <Badge colorScheme="green" variant="subtle">成功</Badge>
            <Badge colorScheme="red" variant="subtle">危险</Badge>
          </Flex>
          <Flex gap={2}>
            <Code fontSize="xs" bg={palette.lightBg} color={brandColor}>代码块</Code>
            <Code fontSize="xs" bg={blend(harmonyColors[1], '#fff', 0.85)} color={harmonyColors[1]}>拼色代码</Code>
          </Flex>
        </Stack>
      </Box>

      {/* CSS 变量导出 */}
      <Box bg="white" borderRadius="md" p={4}>
        <Heading size="xs" mb={1.5}>CSS 变量导出</Heading>
        <Box as="pre" bg="gray.50" p={3} borderRadius="md" fontSize="xs" fontFamily="mono" whiteSpace="pre-wrap" overflow="auto" maxH={200}>
{`:root {
  --brand-50:  ${palette.shades[0]};
  --brand-100: ${palette.shades[1]};
  --brand-200: ${palette.shades[2]};
  --brand-300: ${palette.shades[3]};
  --brand-500: ${palette.shades[4]};
  --brand-600: ${palette.shades[5]};
  --brand-700: ${palette.shades[6]};
  --brand-800: ${palette.shades[7]};
  --accent:    ${harmonyColors[1]};
}`}
        </Box>
      </Box>
    </Box>
  );
}

import React, { useState, useMemo } from 'react';
import {
  Box, Flex, Heading, Input, Text, Button, Stack, Badge, Code, SimpleGrid,
} from '@chakra-ui/react';

// ===== 颜色工具函数 =====
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

// ===== 设计界经典拼配色方案 =====
interface ClassicScheme {
  name: string;
  desc: string;
  scene: string;
  principle: string;
  colors: { role: string; color: string; usage: string }[];
}

const classicSchemes: ClassicScheme[] = [
  {
    name: '60-30-10 经典比例',
    desc: '大面积中性色承托，品牌色建立识别，点缀色制造记忆点。',
    scene: 'SaaS / 工具 / 管理后台',
    principle: '60% 背景与表面，30% 主品牌，10% 高能点缀。',
    colors: [
      { role: 'Base', color: '#f8fafc', usage: '页面背景、空白区域' },
      { role: 'Primary', color: '#2563eb', usage: '主按钮、导航选中、关键状态' },
      { role: 'Accent', color: '#f59e0b', usage: '提醒、徽标、重点数据' },
      { role: 'Text', color: '#0f172a', usage: '标题与正文' },
    ],
  },
  {
    name: '黑白灰 + 单色焦点',
    desc: '用克制的灰阶做秩序，只让一个鲜明色承担交互焦点。',
    scene: '效率工具 / 极简产品 / 开发者产品',
    principle: '不要同时抢戏，强调色只用于可点击和当前状态。',
    colors: [
      { role: 'Ink', color: '#111827', usage: '标题、图标、主要文字' },
      { role: 'Surface', color: '#ffffff', usage: '卡片、弹层、输入区' },
      { role: 'Muted', color: '#e5e7eb', usage: '分割线、弱边框' },
      { role: 'Focus', color: '#10b981', usage: '主操作、成功态、激活态' },
    ],
  },
  {
    name: '莫兰迪低饱和',
    desc: '低饱和、带灰度的色彩组合，视觉温和但仍有层次。',
    scene: '知识管理 / 内容产品 / 个人效率',
    principle: '用灰度统一色相冲突，适合长时间阅读和记录。',
    colors: [
      { role: 'Sage', color: '#8fa99b', usage: '主色、标签、状态块' },
      { role: 'Clay', color: '#c9a27e', usage: '提示、次级重点' },
      { role: 'Mist', color: '#e8e3da', usage: '背景、浅色卡片' },
      { role: 'Charcoal', color: '#3f3a36', usage: '文字、图标' },
    ],
  },
  {
    name: '冷暖对比',
    desc: '冷色建立专业可信，暖色用于情绪和行动召唤。',
    scene: 'AI 产品 / 数据分析 / 金融科技',
    principle: '冷色做系统骨架，暖色只在需要用户行动时出现。',
    colors: [
      { role: 'Cool', color: '#1d4ed8', usage: '导航、信息态、主视觉' },
      { role: 'Warm', color: '#f97316', usage: 'CTA、升级、关键提醒' },
      { role: 'Ice', color: '#eff6ff', usage: '信息背景、浅色区域' },
      { role: 'Night', color: '#172033', usage: '深色文字、深色区块' },
    ],
  },
  {
    name: '自然绿 + 土色',
    desc: '来自自然景观的绿、土、米色组合，稳定、亲和、不刺激。',
    scene: '生活方式 / 健康 / 个人空间',
    principle: '绿色表达生长，土色提供温度，米色降低界面压力。',
    colors: [
      { role: 'Leaf', color: '#2f855a', usage: '主按钮、确认、积极状态' },
      { role: 'Soil', color: '#a16207', usage: '强调、图表辅助色' },
      { role: 'Linen', color: '#f5f1e8', usage: '背景、卡片底色' },
      { role: 'Bark', color: '#2d2926', usage: '标题、正文' },
    ],
  },
  {
    name: '包豪斯原色',
    desc: '高识别度的红黄蓝组合，适合强视觉、强模块化界面。',
    scene: '创意工具 / 设计实验 / 品牌展示',
    principle: '原色只用于模块标识，留足白色和黑色做秩序。',
    colors: [
      { role: 'Blue', color: '#0057b8', usage: '主模块、链接、导航' },
      { role: 'Red', color: '#e11d48', usage: '警示、删除、强强调' },
      { role: 'Yellow', color: '#facc15', usage: '提示、标签、装饰块' },
      { role: 'Black', color: '#111111', usage: '文字、线条、结构' },
    ],
  },
  {
    name: '高级黑金',
    desc: '深色背景配合金色点缀，营造高端、稀缺和仪式感。',
    scene: '会员体系 / 高端品牌 / 金融资产',
    principle: '黑色做空间，金色只用于身份、权益和关键价值点。',
    colors: [
      { role: 'Obsidian', color: '#0b0b0f', usage: '主背景、沉浸式区域' },
      { role: 'Gold', color: '#d4af37', usage: '会员标识、价格、荣誉感' },
      { role: 'Champagne', color: '#f3e7c9', usage: '浅色文字、柔和高光' },
      { role: 'Slate', color: '#2f3340', usage: '卡片、边框、次级区域' },
    ],
  },
  {
    name: '科技霓虹暗色',
    desc: '暗色基底叠加高亮蓝紫绿，适合强调未来感和技术感。',
    scene: 'AI / 开发工具 / 数据大屏',
    principle: '暗底降低噪音，霓虹色只承担状态、路径和实时反馈。',
    colors: [
      { role: 'Void', color: '#080b16', usage: '主背景、控制台区域' },
      { role: 'Cyan', color: '#22d3ee', usage: '链接、实时状态、选中态' },
      { role: 'Violet', color: '#8b5cf6', usage: 'AI、智能、生成态' },
      { role: 'Lime', color: '#a3e635', usage: '成功、运行中、性能指标' },
    ],
  },
  {
    name: '日系留白柔色',
    desc: '大量米白留白搭配轻柔粉橙，亲和、安静、没有攻击性。',
    scene: '笔记 / 日程 / 个人工具',
    principle: '用低对比保证舒适度，靠小面积暖色建立情绪。',
    colors: [
      { role: 'Paper', color: '#fbf7ef', usage: '页面背景、阅读底色' },
      { role: 'Coral', color: '#f4a7a1', usage: '重点按钮、情绪提示' },
      { role: 'Apricot', color: '#f7d9b0', usage: '标签、轻提示、装饰' },
      { role: 'Ink', color: '#3b332f', usage: '正文、标题、图标' },
    ],
  },
  {
    name: '医疗可信蓝绿',
    desc: '蓝色表达专业可信，绿色表达安全和恢复，整体清洁克制。',
    scene: '医疗健康 / 保险 / 安全产品',
    principle: '蓝绿负责信任与安全，浅背景保持干净和可读。',
    colors: [
      { role: 'Trust', color: '#0f75bc', usage: '品牌主色、导航、主要信息' },
      { role: 'Care', color: '#22a06b', usage: '成功、健康、确认状态' },
      { role: 'Clean', color: '#f1f8fb', usage: '页面背景、信息区块' },
      { role: 'Navy', color: '#123047', usage: '标题、正文、深色控件' },
    ],
  },
  {
    name: '电商促销红橙',
    desc: '红橙带来行动冲动，浅暖底降低压迫感，适合转化场景。',
    scene: '电商 / 营销页 / 活动专题',
    principle: '高能色集中给价格、折扣和购买按钮，其他区域降噪。',
    colors: [
      { role: 'Sale', color: '#ef4444', usage: '价格、折扣、紧急提示' },
      { role: 'Action', color: '#f97316', usage: '购买按钮、主 CTA' },
      { role: 'Cream', color: '#fff7ed', usage: '活动背景、优惠卡片' },
      { role: 'Brown', color: '#431407', usage: '标题、说明文字' },
    ],
  },
  {
    name: '数据可视化四色',
    desc: '区分度高但不过分刺眼，适合图表、状态和分类展示。',
    scene: '仪表盘 / 报表 / 运营分析',
    principle: '色彩用于分类而不是装饰，避免多个高饱和色争夺注意力。',
    colors: [
      { role: 'Blue', color: '#3b82f6', usage: '主指标、稳定增长' },
      { role: 'Emerald', color: '#10b981', usage: '正向、完成、健康' },
      { role: 'Amber', color: '#f59e0b', usage: '波动、预警、待处理' },
      { role: 'Rose', color: '#f43f5e', usage: '异常、下降、风险' },
    ],
  },
  {
    name: '教育清新蓝黄',
    desc: '蓝色保证清晰可靠，黄色带来鼓励和活力，适合轻松学习。',
    scene: '教育 / 儿童产品 / 学习工具',
    principle: '蓝色承载知识结构，黄色负责奖励、提示和正反馈。',
    colors: [
      { role: 'Learn', color: '#2563eb', usage: '课程、导航、主按钮' },
      { role: 'Reward', color: '#facc15', usage: '徽章、积分、完成反馈' },
      { role: 'Sky', color: '#dbeafe', usage: '背景、知识卡片' },
      { role: 'Pencil', color: '#1f2937', usage: '正文、标题、题目' },
    ],
  },
  {
    name: '女性向柔粉紫',
    desc: '粉色提供亲和与情绪，紫色提升精致感，适合轻奢和社区感。',
    scene: '美妆 / 社区 / 情绪记录',
    principle: '粉色大面积要降饱和，紫色用于建立层次和品牌记忆。',
    colors: [
      { role: 'Blush', color: '#f9a8d4', usage: '情绪点缀、标签、装饰' },
      { role: 'Plum', color: '#9333ea', usage: '主按钮、品牌识别' },
      { role: 'Petal', color: '#fdf2f8', usage: '背景、柔和卡片' },
      { role: 'Grape', color: '#3b0764', usage: '标题、深色文字' },
    ],
  },
  {
    name: '复古海报色',
    desc: '带有印刷感的红、蓝、米、棕组合，适合有故事感的界面。',
    scene: '文化内容 / 博客 / 展览专题',
    principle: '避免纯色过亮，使用带灰度的复古色维持统一质感。',
    colors: [
      { role: 'Poster Red', color: '#b91c1c', usage: '标题强调、重要标记' },
      { role: 'Dusty Blue', color: '#3f6f8f', usage: '模块色、链接、图形' },
      { role: 'Aged Paper', color: '#f4ead5', usage: '背景、内容底色' },
      { role: 'Sepia', color: '#4a2f1b', usage: '文字、线条、边框' },
    ],
  },
  {
    name: '北欧冷淡风',
    desc: '冷灰、浅木、雾蓝组合，理性、干净、有空间感。',
    scene: '家居 / 作品集 / 高级工具',
    principle: '低饱和色做氛围，减少边框和装饰，靠空间建立品质。',
    colors: [
      { role: 'Fog', color: '#eef2f3', usage: '页面背景、浅色区块' },
      { role: 'Nordic Blue', color: '#6b8fa3', usage: '主色、链接、选中态' },
      { role: 'Wood', color: '#c7a17a', usage: '暖色点缀、提示' },
      { role: 'Graphite', color: '#2f3a3d', usage: '文字、深色图标' },
    ],
  },
  {
    name: '企业稳重蓝灰',
    desc: '蓝灰体系降低风险感，适合需要稳定、正式和可信的产品。',
    scene: 'B2B / 企业服务 / 协同办公',
    principle: '主色不要过艳，交互层级靠深浅和面积区分。',
    colors: [
      { role: 'Corporate', color: '#1e40af', usage: '品牌主色、核心操作' },
      { role: 'Steel', color: '#64748b', usage: '次级导航、辅助信息' },
      { role: 'Cloud', color: '#f1f5f9', usage: '背景、表格区块' },
      { role: 'Navy', color: '#0f172a', usage: '标题、正文、强信息' },
    ],
  },
  {
    name: '开发者终端绿',
    desc: '黑底绿字来自终端语境，适合代码、日志和技术状态表达。',
    scene: '终端 / 监控 / 开发者工具',
    principle: '绿色表达运行和通过，错误色要克制，否则会破坏终端氛围。',
    colors: [
      { role: 'Terminal', color: '#020617', usage: '主背景、代码区' },
      { role: 'Matrix', color: '#22c55e', usage: '成功、运行中、命令提示' },
      { role: 'Cyan', color: '#38bdf8', usage: '链接、变量、可点击对象' },
      { role: 'Line', color: '#334155', usage: '边框、分隔线、弱文本' },
    ],
  },
];

function getPreviewKind(scheme: ClassicScheme): string {
  const text = `${scheme.name} ${scheme.scene}`;
  if (/电商|营销|活动/.test(text)) return 'commerce';
  if (/终端|监控|开发者/.test(text)) return 'terminal';
  if (/数据|报表|仪表盘|分析/.test(text)) return 'dashboard';
  if (/AI|金融科技/.test(text)) return 'ai';
  if (/会员|高端|金融资产/.test(text)) return 'premium';
  if (/教育|学习|儿童/.test(text)) return 'education';
  if (/医疗|健康|保险|安全/.test(text)) return 'health';
  if (/知识|笔记|日程|个人工具|内容|博客/.test(text)) return 'notes';
  if (/创意|设计|品牌|作品集|展览/.test(text)) return 'creative';
  if (/美妆|社区|情绪/.test(text)) return 'community';
  if (/生活方式|个人空间|家居/.test(text)) return 'lifestyle';
  if (/极简|效率工具|企业|B2B|协同|SaaS|管理后台/.test(text)) return 'workspace';
  return 'workspace';
}

function getSchemePreviewCopy(kind: string): { title: string; subtitle: string } {
  const copy: Record<string, { title: string; subtitle: string }> = {
    commerce: { title: '活动转化页', subtitle: '高能色集中给价格、优惠和购买按钮' },
    terminal: { title: '运行监控台', subtitle: '深色底承载日志，亮色表达状态' },
    dashboard: { title: '运营仪表盘', subtitle: '色彩用于区分指标、状态和风险' },
    ai: { title: 'AI 分析工作台', subtitle: '冷色建立专业感，暖色引导行动' },
    premium: { title: '会员权益卡', subtitle: '深色空间配合高价值点缀' },
    education: { title: '学习任务页', subtitle: '清晰结构配合奖励反馈' },
    health: { title: '健康信息卡', subtitle: '可信、安全、干净的状态表达' },
    notes: { title: '知识记录页', subtitle: '低干扰背景适合长时间阅读' },
    creative: { title: '创意画布', subtitle: '高识别模块和视觉节奏' },
    community: { title: '社区内容流', subtitle: '柔和色彩建立情绪和亲和力' },
    lifestyle: { title: '生活空间页', subtitle: '自然色彩提供舒适和稳定感' },
    workspace: { title: '效率工作台', subtitle: '结构、操作和信息层级清晰分离' },
  };
  return copy[kind] || copy.workspace;
}

function SchemePreview({ scheme, colors }: { scheme: ClassicScheme; colors: string[] }) {
  const kind = getPreviewKind(scheme);
  const copy = getSchemePreviewCopy(kind);
  const [c0, c1, c2, c3] = colors;
  const bg = c2 || '#f8fafc';
  const primary = c0 || '#2563eb';
  const accent = c1 || '#f59e0b';
  const text = c3 || '#0f172a';
  const surface = blend(bg, '#ffffff', 0.72);

  if (kind === 'commerce') {
    return (
      <Box bg={bg} p={3} minH="132px">
        <Flex justify="space-between" align="center" mb={2}>
          <Text fontSize="10px" fontWeight={800} color={text}>{copy.title}</Text>
          <Badge bg={accent} color="white" fontSize="8px">限时</Badge>
        </Flex>
        <Flex gap={2}>
          <Box flex={1} bg={surface} borderRadius="sm" p={2} border="1px solid" borderColor="blackAlpha.100">
            <Text fontSize="8px" color={text} opacity={0.65}>精选套装</Text>
            <Text fontSize="18px" fontWeight={900} color={primary}>¥199</Text>
            <Text fontSize="8px" color={text} opacity={0.55}>{copy.subtitle}</Text>
          </Box>
          <Flex w="72px" direction="column" justify="space-between">
            <Box bg={accent} color="white" borderRadius="sm" px={2} py={1}><Text fontSize="8px" fontWeight={800}>立即购买</Text></Box>
            <Box bg={blend(accent, '#ffffff', 0.78)} borderRadius="sm" px={2} py={1}><Text fontSize="8px" color={text}>优惠券</Text></Box>
          </Flex>
        </Flex>
      </Box>
    );
  }

  if (kind === 'terminal') {
    return (
      <Box bg={primary} p={3} minH="132px" fontFamily="mono">
        <Flex gap={1} mb={2}><Box w="6px" h="6px" borderRadius="full" bg={accent} /><Box w="6px" h="6px" borderRadius="full" bg={c2} /><Box w="6px" h="6px" borderRadius="full" bg={c3} /></Flex>
        <Text fontSize="9px" color={accent}>$ uuutil agent status</Text>
        <Text fontSize="8px" color={c2}>✓ connector ready</Text>
        <Text fontSize="8px" color={c2}>✓ whiteboard indexed</Text>
        <Box mt={2} h="6px" w="74%" bg={accent} borderRadius="full" />
        <Text mt={2} fontSize="8px" color={c2} opacity={0.78}>{copy.subtitle}</Text>
      </Box>
    );
  }

  if (kind === 'dashboard' || kind === 'ai') {
    return (
      <Box bg={bg} p={3} minH="132px">
        <Flex justify="space-between" mb={2}><Text fontSize="10px" fontWeight={800} color={text}>{copy.title}</Text><Badge bg={accent} color="white" fontSize="8px">Live</Badge></Flex>
        <SimpleGrid columns={3} gap={1.5} mb={2}>
          {[primary, accent, text].map((color, index) => <Box key={index} bg={surface} borderRadius="sm" p={1.5}><Text fontSize="7px" color={text} opacity={0.55}>Metric</Text><Text fontSize="11px" fontWeight={800} color={color}>{[86, 42, 19][index]}%</Text></Box>)}
        </SimpleGrid>
        <Flex align="end" gap={1} h="36px" bg={surface} borderRadius="sm" p={1.5}>{[18, 28, 14, 34, 24, 40].map((h, i) => <Box key={i} flex={1} h={`${h}px`} bg={i % 2 ? accent : primary} borderRadius="1px" opacity={0.86} />)}</Flex>
      </Box>
    );
  }

  if (kind === 'premium') {
    return (
      <Box bg={primary} p={3} minH="132px">
        <Box border="1px solid" borderColor={accent} borderRadius="md" p={3} bg={blend(primary, c3 || '#ffffff', 0.12)}>
          <Text fontSize="9px" color={accent} fontWeight={800}>ELITE PASS</Text>
          <Text fontSize="16px" color={c2 || '#fff'} fontWeight={900}>{copy.title}</Text>
          <Text fontSize="8px" color={c2 || '#fff'} opacity={0.7}>{copy.subtitle}</Text>
          <Flex mt={3} gap={1}>{[0, 1, 2].map((i) => <Box key={i} h="5px" flex={1} bg={i === 0 ? accent : c3} opacity={i === 0 ? 1 : 0.45} borderRadius="full" />)}</Flex>
        </Box>
      </Box>
    );
  }

  if (kind === 'education') {
    return (
      <Box bg={bg} p={3} minH="132px">
        <Text fontSize="10px" fontWeight={800} color={text} mb={2}>{copy.title}</Text>
        <Box bg={surface} borderRadius="sm" p={2} mb={2}><Text fontSize="8px" color={text}>今日课程</Text><Box mt={1} h="6px" bg={primary} borderRadius="full" w="68%" /></Box>
        <Flex gap={1.5}><Badge bg={accent} color={text} fontSize="8px">+20 积分</Badge><Badge bg={blend(primary, '#ffffff', 0.78)} color={primary} fontSize="8px">已完成 3/5</Badge></Flex>
      </Box>
    );
  }

  if (kind === 'health' || kind === 'lifestyle') {
    return (
      <Box bg={bg} p={3} minH="132px">
        <Text fontSize="10px" fontWeight={800} color={text} mb={2}>{copy.title}</Text>
        <Flex gap={2} align="center"><Box w="44px" h="44px" borderRadius="full" bg={primary} display="flex" alignItems="center" justifyContent="center"><Text color="white" fontSize="11px" fontWeight={800}>OK</Text></Box><Box flex={1}><Text fontSize="8px" color={text}>{copy.subtitle}</Text><Box mt={2} h="7px" bg={blend(primary, '#ffffff', 0.7)} borderRadius="full"><Box h="7px" w="72%" bg={accent} borderRadius="full" /></Box></Box></Flex>
      </Box>
    );
  }

  if (kind === 'notes' || kind === 'community') {
    return (
      <Box bg={bg} p={3} minH="132px">
        <Text fontSize="10px" fontWeight={800} color={text} mb={2}>{copy.title}</Text>
        <SimpleGrid columns={2} gap={2}>
          <Box bg={surface} p={2} borderRadius="sm" borderTop="3px solid" borderTopColor={primary}><Text fontSize="8px" color={text} fontWeight={700}>灵感记录</Text><Text fontSize="7px" color={text} opacity={0.55}>{copy.subtitle}</Text></Box>
          <Box bg={blend(accent, '#ffffff', 0.74)} p={2} borderRadius="sm"><Text fontSize="8px" color={text} fontWeight={700}>待办提醒</Text><Text fontSize="7px" color={text} opacity={0.55}>标签、情绪、片段</Text></Box>
        </SimpleGrid>
      </Box>
    );
  }

  if (kind === 'creative') {
    return (
      <Box bg={bg} p={3} minH="132px" position="relative" overflow="hidden">
        <Text fontSize="10px" fontWeight={900} color={text}>{copy.title}</Text>
        <Box position="absolute" right="18px" top="24px" w="42px" h="42px" borderRadius="full" bg={accent} />
        <Box position="absolute" left="22px" bottom="18px" w="58px" h="30px" bg={primary} transform="rotate(-8deg)" />
        <Box position="absolute" right="62px" bottom="20px" w="36px" h="36px" border="4px solid" borderColor={text} />
        <Text position="absolute" left="12px" bottom="8px" fontSize="8px" color={text} opacity={0.7}>{copy.subtitle}</Text>
      </Box>
    );
  }

  return (
    <Box bg={bg} p={3} minH="132px">
      <Flex h="26px" bg={text} align="center" justify="space-between" px={2} borderRadius="sm" mb={2}>
        <Text fontSize="9px" color="white" fontWeight={700}>{copy.title}</Text>
        <Flex gap={1}><Box w="18px" h="5px" borderRadius="full" bg={primary} /><Box w="18px" h="5px" borderRadius="full" bg={accent} /></Flex>
      </Flex>
      <Flex gap={2}>
        <Box w="56px" minH="58px" bg={primary} borderRadius="sm" p={2}><Text fontSize="8px" color="white" fontWeight={700}>导航</Text></Box>
        <Box flex={1} bg={surface} p={2} borderRadius="sm" borderLeft="3px solid" borderLeftColor={accent}><Text fontSize="8px" color={text} fontWeight={700}>内容卡片标题</Text><Text fontSize="8px" color={text} opacity={0.55}>{copy.subtitle}</Text></Box>
      </Flex>
    </Box>
  );
}

export default function ColorResearchPage() {
  const [brandColor, setBrandColor] = useState('#2563eb');
  const [secondColor, setSecondColor] = useState('#e11d48');
  const [activeSchemeIndex, setActiveSchemeIndex] = useState(0);

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

  const activeScheme = classicSchemes[activeSchemeIndex];
  const schemeColors = activeScheme.colors.map((item) => item.color);

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
      <Box bg="white" borderRadius="sm" p={4} mb={1.5}>
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
      <Box bg="white" borderRadius="sm" p={4} mb={1.5}>
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
      <Box bg="white" borderRadius="sm" p={4} mb={1.5}>
        <Heading size="xs" mb={1.5}>经典拼配色方案</Heading>
        <Text fontSize="xs" color="gray.500" mb={2}>不是机械色相换算，而是设计中常用的配色套路：比例、角色、场景和使用边界。</Text>
        <Flex gap={2} wrap="wrap" mb={3}>
          {classicSchemes.map((scheme, index) => (
            <Button
              key={scheme.name}
              size="xs"
              onClick={() => setActiveSchemeIndex(index)}
              variant={activeSchemeIndex === index ? 'solid' : 'outline'}
              colorScheme="blue"
            >
              {scheme.name}
            </Button>
          ))}
        </Flex>

        <Box border="1px solid" borderColor="gray.100" borderRadius="sm" overflow="hidden">
          <Flex h="54px">
            {activeScheme.colors.map((item) => (
              <Box key={item.role} flex={1} bg={item.color} display="flex" alignItems="flex-end" px={2} py={1}>
                <Text fontSize="8px" fontFamily="mono" color="white" textShadow="0 1px 3px rgba(0,0,0,0.45)">{item.color}</Text>
              </Box>
            ))}
          </Flex>
          <Box p={3}>
            <Flex justify="space-between" gap={3} align="flex-start" mb={2}>
              <Box>
                <Heading size="xs" mb={1}>{activeScheme.name}</Heading>
                <Text fontSize="xs" color="gray.600">{activeScheme.desc}</Text>
              </Box>
              <Badge colorScheme="purple" flexShrink={0}>{activeScheme.scene}</Badge>
            </Flex>
            <Text fontSize="xs" color="gray.500" mb={3}>{activeScheme.principle}</Text>
            <SimpleGrid columns={2} gap={2} mb={3}>
              {activeScheme.colors.map((item) => (
                <Flex key={item.role} gap={2} align="center" bg="gray.50" borderRadius="sm" p={2}>
                  <Box w="18px" h="18px" borderRadius="full" bg={item.color} border="1px solid" borderColor="blackAlpha.100" flexShrink={0} />
                  <Box minW={0}>
                    <Text fontSize="10px" fontWeight={700}>{item.role}</Text>
                    <Text fontSize="9px" color="gray.500" noOfLines={1}>{item.usage}</Text>
                  </Box>
                </Flex>
              ))}
            </SimpleGrid>

            {/* 拼色应用预览 */}
            <Heading size="xs" mb={1.5}>应用预览 · {getSchemePreviewCopy(getPreviewKind(activeScheme)).title}</Heading>
            <Box borderRadius="sm" overflow="hidden" border="1px solid" borderColor="gray.100">
              <SchemePreview scheme={activeScheme} colors={schemeColors} />
            </Box>
          </Box>
        </Box>
      </Box>

      {/* 双色渐变 */}
      <Box bg="white" borderRadius="sm" p={4} mb={1.5}>
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
      <Box bg="white" borderRadius="sm" p={4} mb={1.5}>
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
      <Box bg="white" borderRadius="sm" p={4} mb={1.5}>
        <Heading size="xs" mb={1.5}>组件预览</Heading>
        <Stack gap={2}>
          <Flex gap={2} wrap="wrap">
            <Button size="sm" bg={brandColor} color="white" _hover={{ bg: palette.shades[6] }}>主按钮</Button>
            <Button size="sm" variant="outline" borderColor={schemeColors[1]} color={schemeColors[1]}>次按钮</Button>
            <Button size="sm" variant="ghost">幽灵按钮</Button>
          </Flex>
          <Flex gap={2} wrap="wrap">
            <Badge bg={palette.lightBg} color={brandColor} variant="subtle">标签</Badge>
            <Badge bg={blend(schemeColors[1], '#fff', 0.85)} color={schemeColors[1]} variant="subtle">拼色标签</Badge>
            <Badge colorScheme="green" variant="subtle">成功</Badge>
            <Badge colorScheme="red" variant="subtle">危险</Badge>
          </Flex>
          <Flex gap={2}>
            <Code fontSize="xs" bg={palette.lightBg} color={brandColor}>代码块</Code>
            <Code fontSize="xs" bg={blend(schemeColors[1], '#fff', 0.85)} color={schemeColors[1]}>拼色代码</Code>
          </Flex>
        </Stack>
      </Box>

      {/* CSS 变量导出 */}
      <Box bg="white" borderRadius="sm" p={4}>
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
  --accent:    ${schemeColors[1]};
}`}
        </Box>
      </Box>
    </Box>
  );
}

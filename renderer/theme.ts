/**
 * Chakra UI 主题配置
 * 后续添加主题配置功能时只需修改此文件
 */

export const chakraThemeConfig = {
  config: { initialColorMode: 'light' as const, useSystemColorMode: false },
  styles: {
    global: {
      'html, body, #root': { background: 'transparent', height: '100%', overflow: 'hidden' },
    },
  },
  components: {
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
  },
};

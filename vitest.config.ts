import { defineConfig } from 'vitest/config';
import path from 'path';

// 单元测试配置（node 环境，覆盖核心纯逻辑与插件 API）。
// sql.js 为 CJS + WASM 模块，交给 Node 原生加载（external），避免 vite 转换 wasm 出错。
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        external: ['sql.js'],
      },
    },
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});

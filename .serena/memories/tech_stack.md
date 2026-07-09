# 技术栈

## 核心框架与运行时

- **框架**: Electron 42.4.0 + React 18.3.0 + TypeScript 5.6.0
- **包管理器**: npm
- **构建工具**: Vite 6.0.0 (渲染进程) + TypeScript 编译器 (主进程)

## 关键依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| sql.js | 1.12.0 | 本地 SQLite 数据库（WASM）|
| react-router-dom | 7.17.0 | 前端路由 |
| @chakra-ui/react | 2.10.10 | UI 组件库 |
| @emotion/react | 11.14.0 | CSS-in-JS |
| @assistant-ui/react | 0.14.23 | AI 对话 UI 组件 |
| node-pty | 1.10.0 | 终端模拟 |
| uuid | 9.0.0 | ID 生成 |

## 开发依赖

- electron-builder 25.1.0 - 应用打包
- concurrently 9.1.0 - 并行运行主进程和渲染进程开发服务
- @types/react 18.3.0 - React 类型定义

## 构建设计

- **双 TypeScript 配置**:
  - `tsconfig.json` - 渲染进程 + core + shared（ESNext 模块，Vite 解析）
  - `tsconfig.main.json` - 主进程专用（commonjs 模块，Node 解析）

- **路径别名**:
  - `@core/*` → `src/core/*`
  - `@shared/*` → `src/shared/*`
  - 两个配置中都已定义

## 平台

- 开发环境: Darwin (macOS)
- 输出目标: macOS 桌面应用
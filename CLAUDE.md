# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

插件化个人辅助软件 —— Electron + React + TypeScript，基于 sql.js (SQLite) 的本地桌面应用脚手架。

## 构建与运行

```bash
npm run dev          # 开发模式（Vite HMR + Electron）
npm run build        # 生产构建
npm run start        # 运行已构建的 Electron
npm run dev:main     # 仅编译并运行主进程
npm run dev:renderer # 仅启动 Vite 开发服务器
```

## 双 TypeScript 配置

- `tsconfig.json` — 渲染进程 + core + shared 的配置，ESNext 模块，Vite bundler 解析。include 排除 `src/main/`
- `tsconfig.main.json` — 主进程专用，commonjs 模块（Electron 主进程要求 Node 模块解析）。include 排除 `renderer/`

路径别名 `@core/*` → `src/core/*`、`@shared/*` → `src/shared/*` 在两个配置中都有定义。

## 架构

```
src/
├── core/           # 内核：EventBus、PluginLoader、DB
│   ├── event-bus.ts    # 全局单例 bus，插件间唯一通信通道
│   ├── plugin-loader.ts # 扫描 src/plugins/ 目录，动态加载激活插件
│   └── db.ts           # sql.js 内存数据库 + 手动 saveToDisk() 持久化
├── main/
│   ├── index.ts        # Electron 主进程入口，启动顺序: initDatabase → loadAllPlugins → createWindow
│   └── preload.ts      # contextBridge 暴露 window.assistant API 给渲染进程
├── plugins/
│   └── hello-world/    # 示例插件模板
│       ├── index.ts    # manifest + activate/deactivate（通过 bus 通信）
│       └── api.ts      # 插件对外暴露的唯一合法 API 接口
├── shared/
│   └── types.ts        # 所有模块共享的类型定义
└── types/
    └── sql.js.d.ts     # sql.js 的类型声明
renderer/               # Vite + React 渲染进程
```

## 核心设计规则（铁律，来自 docs/CONVENTIONS.md）

1. **插件隔离**：插件之间禁止直接 `import`，所有跨模块通信必须通过 `bus` (EventBus) 的 `bus.emit()` / `bus.on()`
2. **插件 API**：每个插件对外暴露的唯一接口在 `api.ts` 中定义，其他地方禁止 import 插件内部实现
3. **数据库统一入口**：所有数据库操作通过 `core/db` 的 `getDatabase()` 获取连接，写操作后必须调用 `autoSave()` 持久化
4. **事件命名**：`core:*` 为内核事件（插件不得发送），`plugin-id:*` 为插件命名空间
5. **错误处理**：EventBus handler 不抛异常（会被静默捕获），插件自行处理内部异常

## 启动顺序

```
app.whenReady()
  → initDatabase()        # 加载 WASM，创建/打开 SQLite，建系统表
  → loadAllPlugins()      # 扫描 src/plugins/，require 每个插件的 index.js
  → bus.emit('core:ready') # 通知所有插件核心就绪
  → createWindow()        # 开发模式加载 localhost:5173，生产模式加载 HTML 文件
```

## 插件开发模式

复制 `src/plugins/hello-world/` 目录：
1. `index.ts` 导出 `manifest`、`activate`、`deactivate`
2. `activate()` 中通过 `bus.on()` 注册事件监听
3. `api.ts` 导出对外 API 对象（类型定义在 `shared/types.ts`）
4. 编译后在插件目录生成 `index.js`，plugin-loader 通过 `require()` 加载

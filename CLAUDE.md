# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

插件化个人辅助桌面软件 —— Electron + React + TypeScript，基于 sql.js (SQLite) 的本地桌面应用。核心只负责窗口、事件总线、插件加载、数据库、日志、AI 与 CLI 能力，具体功能由插件独立实现。

## 构建与运行

```bash
npm run dev           # 开发模式（Vite HMR + Electron）
npm run build         # 生产构建（主进程 tsc + 渲染进程 vite）
npm run start         # 运行已构建的 Electron
npm run dev:main      # 仅编译并运行主进程
npm run dev:renderer  # 仅启动 Vite 开发服务器
npm run pack          # electron-builder 打包目录版 macOS 应用
npm test              # 运行单元测试（Vitest，node 环境）
npm run verify:plugins # 校验插件启用状态
```

## 双 TypeScript 配置

- `tsconfig.json` — 渲染进程 + core + shared 的配置，ESNext 模块，Vite bundler 解析。include 排除 `src/main/`
- `tsconfig.main.json` — 主进程专用，commonjs 模块（Electron 主进程要求 Node 模块解析）。include 排除 `renderer/`

路径别名 `@core/*` → `src/core/*`、`@shared/*` → `src/shared/*` 在两个配置中都有定义。

## 架构

```
src/
├── core/                 # 内核
│   ├── event-bus.ts       # 全局单例 bus，插件间唯一通信通道
│   ├── plugin-loader.ts   # 扫描/加载/启用禁用插件（_plugins.enabled 为唯一开关）
│   ├── db.ts              # sql.js 内存库 + autoSave 持久化 + 事件日志清理
│   ├── logger.ts          # JSON Lines 结构化日志 + 5MB 轮转
│   ├── command-registry.ts# CLI 命令声明式注册表（plugin.action）
│   ├── ui-settings.ts     # TAB 栏布局持久化
│   ├── ai.ts              # AI 兼容入口（转发到 ai-runtime）
│   └── ai-runtime/        # AI 运行时：provider/connector/chat-runtime
├── main/
│   ├── index.ts           # bootstrap 调度（仅编排，不堆业务）
│   ├── windows.ts         # 悬浮球 + 面板双窗口 + 托盘 + 动画
│   ├── cli.ts             # 沙箱 shell 命令执行
│   ├── cli-server.ts      # CLI loopback HTTP（127.0.0.1:17878）
│   ├── terminal.ts        # node-pty + tmux 持久化终端
│   ├── whiteboard.ts      # 白板状态与附件
│   ├── plugin-bridge.ts   # bus 请求/响应桥接
│   ├── preload.ts         # contextBridge 暴露 window.assistant
│   └── ipc/               # 声明式 IPC 模块（defineInvoke/defineSend）
├── cli/                   # uuutil CLI 薄转发器（bin）
├── plugins/               # 8 个插件
│   ├── hello-world/       # 示例插件（默认禁用，需显式 plugin.enable）
│   ├── calculator/        # 表达式计算
│   ├── dev-utils/         # JSON/SQL/Base64/时间戳/正则/UUID
│   ├── knowledge-base/    # 笔记/分类/标签/搜索
│   ├── focus/             # 注意力观察（FIE 客户端，无本地库）
│   ├── clipboard/         # 剪贴板历史（文本/富文本/图片/文件）
│   ├── reminder/          # 提醒框架（notify/ask/agent）
│   └── todo/              # 事项管理
├── shared/
│   ├── types.ts           # 共享类型
│   ├── event-map.ts       # 事件名 → 载荷类型映射
│   ├── assistant-api.ts   # window.assistant 类型合同
│   └── ball-menu.ts       # 悬浮球环形菜单几何
└── types/
    └── sql.js.d.ts        # sql.js 类型声明
renderer/                  # Vite + React 渲染进程
├── App.tsx                # 悬浮球/面板入口 + 环形菜单
├── router.tsx             # 面板路由（前台 12 + 后台 3）
├── theme.ts               # Chakra 主题
├── components/            # 功能组件
└── pages/                 # 页面
```

## 核心设计规则（铁律，来自 docs/CONVENTIONS.md）

1. **插件隔离**：插件之间禁止直接 `import`，所有跨模块通信必须通过 `bus` (EventBus) 的 `bus.emit()` / `bus.on()`
2. **插件 API**：每个插件对外暴露的唯一接口在 `api.ts` 中定义，其他地方禁止 import 插件内部实现
3. **数据库统一入口**：所有数据库操作通过 `core/db` 的 `getDatabase()` 获取连接，写操作后必须调用 `autoSave()` 持久化
4. **事件命名**：`core:*` 为内核事件（插件不得发送），`plugin-id:*` 为插件命名空间
5. **错误处理**：EventBus handler 不抛异常（会被静默捕获），插件自行处理内部异常
6. **日志统一入口**：主进程/核心用 `core/logger`，渲染进程用 `window.assistant.log()`；禁止散落文件日志，禁止记录 API Key、Token、完整用户输入、附件原文和 base64
7. **IPC 与 preload**：主进程 IPC 统一经 `src/main/ipc/*.ipc.ts` 声明并在 `ipc/index.ts` 聚合注册；`window.assistant` 类型合同维护在 `src/shared/assistant-api.ts`
8. **CLI 接入**：外部工具经 `uuutil call <plugin.action>` 访问能力；命令由插件经 `command-registry` 声明式注册，CLI / HTTP 只负责转发
9. **终端安全**：PTY 是完整交互式 shell，仅供用户手动操作，禁止接入 AI 或远程内容驱动的调用链

## 启动顺序

```
app.whenReady()
  → initLogger()             # JSON Lines 日志 + 轮转
  → initDatabase()           # sql.js WASM + 系统表
  → initAi()                 # ai_providers / ai_settings + 注册 openai 连接器
  → loadAllPlugins()         # 扫描 src/plugins/，按 _plugins.enabled 加载激活
  → registerPluginCommands() # plugin.list / plugin.enable / plugin.disable
  → bus.emit('core:ready')   # 通知插件核心就绪
  → registerAllIpc()         # 注册全部 IPC 模块
  → startCliServer()         # loopback HTTP（17878）
  → createBallWindow() / createTray() / registerGlobalShortcuts()
```

## 插件开发模式

复制 `src/plugins/hello-world/` 目录（注意：`hello-world` 是示例插件，默认禁用，需 `uuutil call plugin.enable --json '{"id":"hello-world"}'` 后重启启用；复制开发的新插件用新目录名即可正常加载）：
1. `index.ts` 导出 `manifest`、`activate`、`deactivate`
2. `activate()` 中通过 `bus.on()` 注册事件监听、`registerCommand()` 注册 CLI 命令
3. `api.ts` 导出对外 API 对象（类型定义在 `shared/types.ts`）
4. 编译后在插件目录生成 `index.js`，plugin-loader 通过 `require()` 加载

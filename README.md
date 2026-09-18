# UUUtil

插件化个人辅助桌面工具，基于 Electron + React + TypeScript 构建，使用 sql.js/SQLite 做本地持久化。

项目目标是把日常高频的小工具沉淀成可扩展插件：核心只负责窗口、事件总线、插件加载和数据库能力，具体功能由插件独立实现。

## 当前功能

- 悬浮球入口：桌面常驻悬浮球，单击展开环形菜单（便签/剪贴板/截图/提醒/助手/设置），双击展开/收起右侧工具面板，背面每隔一分钟翻转为时钟。
- 全局快捷键：支持 `Control + Shift + U` 切换面板，`Alt + Space` 作为备用快捷键。
- 系统托盘：支持从 macOS 托盘展开/关闭面板、退出应用。
- 面板动效：导航切换时内容区横向滑入/滑出，多卡片按顺序错峰进入；前台/后台双面 3D 翻转。
- 多功能白板：首页提供多画布临时记录，支持便签、文本框、图片、附件、粘贴导入、拖拽缩放、本地持久化、撤销和 SVG 涂鸦绘图。
- 插件系统：通过 `manifest` + `activate/deactivate` 注册插件，通过事件总线通信，支持运行时启用/禁用。
- 本地数据库：基于 sql.js 的 SQLite 文件，默认保存到 Electron `userData/assistant.db`。
- 知识库：支持笔记、分类、标签、搜索、创建、编辑和删除。
- 计算器：支持鼠标与键盘输入、连续计算和最多 10 条历史记录。
- 开发工具：支持 JSON、SQL、Base64、时间戳、正则测试、UUID 生成。
- 剪贴板历史：监听系统剪贴板，记录文本/富文本/图片/文件四类内容，支持搜索、置顶、一键回贴、图片缩略图与文件打开/定位。
- 提醒中心：外部工具经 CLI 推送提醒或阻塞式确认（ask），支持 Agent 专属模式（update/wait/query/close）。
- 事项管理：面板内瞬态事项工具，支持清单、优先级、截止日、标签、子任务与多视图过滤。
- 终端：基于 node-pty 的交互式终端，tmux 作为持久化后端，标签会话可跨重启恢复。
- 配色研究页：用于沉淀 UI 色彩方案实验。
- AI 核心框架：提供可配置 Provider、默认模型参数、统一 Chat/Streaming 调用接口和独立助手页，便于后续接入翻译、白板 Agent、知识库问答等能力。
- AI 助手：支持流式输出、Markdown 渲染、停止生成、耗时/Token 页脚、会话历史、新对话侧边栏和图片/音频等多模态附件输入。
- 焦点看板：以注意力观察为目标，展示由助手、Skill 或外部系统上报并由 FIE 归因的关注对象、检视记录、健康度、权重和告警，不作为手动 TODO 使用。
- CLI 外部接入：`uuutil call <plugin.action>` 经 loopback HTTP 向本机外部工具暴露能力（list/help/ping/call）。
- 界面设置：TAB 栏显隐与排序可配置并持久化。
- 日志框架：主进程提供 JSON Lines 结构化日志、日志轮转、渲染进程日志上报 IPC，并内置日志管理页用于查看、过滤、打开目录和清空日志。

## 技术栈

- Electron 42
- React 18
- TypeScript 5
- Vite 6
- Chakra UI
- sql.js
- react-router-dom
- node-pty / xterm.js（终端）
- assistant-ui（AI 助手界面）
- framer-motion（动效）
- Vitest（单元测试）

## 快速开始

```bash
npm install
npm run dev
```

开发模式会同时启动：

- Electron 主进程：`npm run dev:main`
- Vite 渲染进程：`npm run dev:renderer`

## 常用命令

```bash
npm run dev          # 开发模式：Vite HMR + Electron
npm run build        # 构建主进程和渲染进程
npm run start        # 运行已构建的 Electron 应用
npm run dev:main     # 仅编译并运行主进程
npm run dev:renderer # 仅启动 Vite 开发服务器
npm run pack         # 使用 electron-builder 打包目录版 macOS 应用
npm test             # 运行单元测试（Vitest）
npm run verify:plugins # 校验插件启用状态
```

## 目录结构

```text
src/
├── core/                 # 内核：事件总线、插件加载、数据库、日志、AI、命令注册表
│   ├── ai.ts             # AI 兼容入口（转发到 ai-runtime）
│   ├── command-registry.ts # CLI 命令声明式注册表
│   ├── db.ts             # sql.js 内存库 + autoSave
│   ├── event-bus.ts      # 全局单例 bus
│   ├── logger.ts         # JSON Lines 结构化日志
│   ├── plugin-loader.ts  # 插件扫描/加载/开关
│   ├── ui-settings.ts    # TAB 栏布局持久化
│   └── ai-runtime/       # AI 运行时（provider/connector/chat-runtime）
├── main/                 # Electron 主进程
│   ├── index.ts          # bootstrap 调度
│   ├── windows.ts        # 悬浮球 + 面板双窗口 + 托盘
│   ├── cli.ts / cli-server.ts # 沙箱命令执行 + loopback HTTP
│   ├── terminal.ts       # node-pty + tmux 终端
│   ├── whiteboard.ts     # 白板状态/附件
│   ├── plugin-bridge.ts  # bus 请求/响应桥接
│   ├── preload.ts        # contextBridge 暴露 window.assistant
│   └── ipc/              # 声明式 IPC 模块
├── cli/                  # uuutil CLI 薄转发器
├── plugins/              # 插件目录（8 个）
│   ├── calculator/
│   ├── clipboard/
│   ├── dev-utils/
│   ├── focus/
│   ├── hello-world/      # 示例插件（默认禁用）
│   ├── knowledge-base/
│   ├── reminder/
│   └── todo/
├── shared/               # 共享类型与 API 契约
└── types/                # 第三方类型补充

renderer/
├── components/           # 功能组件
├── pages/                # 页面
├── App.tsx               # 悬浮球/面板入口 + 环形菜单
├── router.tsx            # 面板路由配置（前台 12 + 后台 3）
└── theme.ts              # Chakra 主题
```

## 架构约定

项目遵循 `docs/CONVENTIONS.md` 中的核心规则：

1. 插件之间禁止直接 `import`，跨模块通信统一走 `bus.emit()` / `bus.on()`。
2. 每个插件唯一对外接口放在自身的 `api.ts`。
3. 数据库统一通过 `core/db` 的 `getDatabase()` 获取连接。
4. 数据写入后必须调用 `autoSave()` 持久化。
5. `core:*` 为内核事件，插件使用 `plugin-id:*` 命名空间。
6. 日志统一走 `src/core/logger.ts` 与主进程 IPC，禁止新增散落的文件日志实现；错误日志应避免写入 API Key、完整用户输入和大体积附件内容。
7. IPC 统一经 `src/main/ipc/*.ipc.ts` 声明并在 `ipc/index.ts` 聚合注册；`window.assistant` 类型合同维护在 `src/shared/assistant-api.ts`。
8. CLI 面向外部工具，命令由插件经 `command-registry` 声明式注册；终端 PTY 仅供用户手动操作，禁止接入 AI。

## 插件开发

新增插件推荐复制 `src/plugins/hello-world/` 作为模板：

```text
src/plugins/my-plugin/
├── index.ts  # manifest + activate/deactivate
└── api.ts    # 插件对外 API
```

最小插件需要导出：

- `manifest`：插件元信息。
- `activate()`：注册事件监听、初始化插件。
- `deactivate()`：释放资源或发送停用事件。
- `api`：插件对外能力集合。

插件加载器会扫描 `src/plugins/`，加载并激活启用状态的插件。

## 白板能力

首页白板面向临时记录、资料收集和轻量绘图，当前支持：

- 多画布：可新增、切换、重命名、删除和清空画布。
- 内容元素：便签、文本框、图片、文件附件均支持拖拽移动，文本和图片支持尺寸调整。
- 本地附件：图片和文件保存到应用数据目录的 `attachments/whiteboard` 下，白板状态只保存附件引用和元数据，避免把大体积 `dataUrl` 写入 SQLite。
- 图片缩略图：导入图片时生成 `75x75` 缩略图，图片元素可双击在原图和缩略图之间切换。
- 文件操作：附件支持双击打开、在目录中显示、打开附件目录和删除确认。
- 元数据：画布、白板元素和 SVG 图形均记录 `createdAt` / `updatedAt`，用于后续 Agent 索引和上下文组织。
- SVG 绘图层：支持直线、箭头、矩形、椭圆和自由画笔；绘图层与普通白板元素分离。
- 图形编辑：支持选择、框选、多选移动、删除、矩形/椭圆缩放变形；线条和箭头使用贝塞尔曲线，支持起点、终点和曲率控制点调节。
- 连续绘制：绘制工具支持连续绘制，右键退出绘图并切换到选择/框选模式。

## AI 框架

AI 能力集中在 `src/core/ai.ts`，目前提供：

- Provider 配置：支持保存多个 `openai-compatible` Provider，例如 OpenAI、DeepSeek、通义千问兼容接口或本地兼容服务。
- 运行配置：支持默认 Provider、默认模型、`temperature`、`maxTokens`、`timeoutMs`。
- 统一调用：通过 `chat(request)` 发起文本生成，通过 `streamChat(request, callbacks, signal?)` 发起流式生成；后续翻译、助理、摘要等插件可复用同一入口。
- 流式通信：渲染进程回调 `onChunk` 接收逐字增量，支持 `AbortSignal` 取消生成和空闲超时（流式超时重置机制）。
- 多模态消息结构：`AiMessage.content` 支持 `string | AiMessageContentPart[]`，含 `text`、`image_url`、`input_audio` 类型。
- IPC 暴露：渲染进程可通过 `window.assistant.ai` 管理配置、调用模型和发起流式对话。

Provider 的 `baseUrl` 应填写兼容接口根路径，例如：

```text
https://api.openai.com/v1
https://api.deepseek.com/v1
http://localhost:11434/v1
```

实际请求会发送到 `{baseUrl}/chat/completions`。

## 焦点看板

焦点功能已经按 `report/uuutil-focus-redesign-proposal.md` 重建为注意力观察系统。它不承担任务管理、完成状态或人工维护职责，而是记录“用户和助手实际把注意力放在哪里”。

核心设计：

- 数据输入：主要来自 Codex Skill、内部助手或其他外部系统，以事件形式上报给 FIE；渲染界面只做观察与展示。
- 焦点对象：代表项目、产品方向、调试线索、架构风险、反复出现的问题或长期关注主题。
- 检视记录：通过 `focus_check_in` 追加，记录本轮进展、能量状态、阻塞和下一步。
- 权重变化：权重会随时间衰减，也会因重复检视恢复；UI 不直接显示数字权重，而用泡泡尺寸表达。
- 健康度：根据最近检视、权重、能量状态和告警计算 `aligned` / `drifting` / `neglected` / `cooling`。
- 标签：标签以 JSON 形式存储，通过 FIE 事件与 IPC 维护。

看板展示：

- 中心越近代表越近期关注，位置按小时级对数时间圈分布，避免当天焦点全部挤在一起。
- 泡泡内容只显示图标，悬停时展示名称、状态、描述、最近检视等详情。
- 泡泡直径与权重关联，弱化数字负担。
- 当泡泡遮挡超过阈值时，悬停会触发轻量星形扩散和连线，便于访问被覆盖焦点。
- 悬浮球收到外部写入活动时会出现短暂光圈提示，用于确认外部调用已经进入系统。

## 外部接入（FIE 与 CLI）

外部系统对 UUUtil 的接入分两条路径，均不再依赖已删除的应用内 MCP 服务。

焦点数据由独立运行的 FIE（Focus Ingestion Engine，默认 `http://127.0.0.1:17879`）承接。应用只作为 FIE 的只读视图与事件摄取代理：写入路径是把 `AttentionEvent` 转发给 FIE，读取路径是拉取 FIE 返回的 focuses / runs / trend。详见 `docs/focus-fie-integration.md`。

通用能力调度由 CLI 承接（设计阶段，待开发）。CLI 是面向本机外部工具的能力出口：外部程序通过 `uuutil call <plugin.action> --json '{...}'` 把命令打进运行中的 UUUtil，由命令注册表分发到对应插件并回传结构化结果，通信走 loopback HTTP。设计详见 `docs/cli-integration.md`。


## 日志框架

日志能力集中在 `src/core/logger.ts`，目前提供：

- 结构化日志：按 JSON Lines 写入，字段包含 `time`、`level`、`scope`、`message`、`meta`。
- 文件位置：默认写入 Electron `userData/logs/uuutil.log`。
- 日志轮转：单文件超过 5 MB 后自动轮转，最多保留 5 个历史文件。
- 主进程 API：`debug/info/warn/error`、`readRecentLogs()`、`openLogsDir()`、`clearLogs()`。
- 渲染进程上报：通过 `window.assistant.log(level, scope, message, meta)` 进入主进程统一写入。
- 日志管理页：后台入口“日志”支持查看最近日志、按级别/模块过滤、刷新、打开目录和清空日志。

日志约束：

- 禁止记录 API Key、Token、完整请求头、完整用户隐私输入和附件原文/base64。
- 可记录 Provider ID、模型名、耗时、Token 用量、finishReason、错误摘要等诊断信息。
- 插件和页面不要自行创建日志文件，统一复用核心日志与 IPC 能力。

## 数据与构建产物

以下内容默认不会提交到 Git：

- `node_modules/`
- `dist/`
- `release/`
- `.data/`
- `.playwright-mcp/`
- 本地环境变量和日志文件

## 相关文档

- `docs/CONVENTIONS.md`：编码与架构约定。
- `docs/requirements.md`：当前产品需求与交互约定。
- `docs/ai-architecture.md`：AI / Agent 旁路运行时与 Connector 架构原则。
- `docs/assistant-ui-integration.md`：assistant-ui 接入边界、阶段计划和开发约束。
- `docs/focus-fie-integration.md`：焦点 FIE 接入、事件摄取模型、只读看板和排查手册。
- `docs/cli-integration.md`：CLI 面向外部工具的能力出口设计（通信、命令风格、注册表）。
- `docs/changes/001-scaffold.md`：项目脚手架记录。
- `docs/changes/002-first-packaging-issues.md`：首次打包问题记录。
- `docs/changes/003-whiteboard-panel-tools.md`：面板交互、白板与工具能力迭代记录。
- `docs/changes/004-ai-assistant-logging.md`：AI 助手、流式输出、多模态附件与日志框架迭代记录。
- `docs/changes/005-focus-mcp-rebuild.md`：焦点管理重建、MCP 服务和 Skill 分发记录。

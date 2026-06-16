# UUUtil

插件化个人辅助桌面工具，基于 Electron + React + TypeScript 构建，使用 sql.js/SQLite 做本地持久化。

项目目标是把日常高频的小工具沉淀成可扩展插件：核心只负责窗口、事件总线、插件加载和数据库能力，具体功能由插件独立实现。

## 当前功能

- 悬浮球入口：桌面悬浮球点击展开右侧工具面板。
- 系统托盘：支持从 macOS 托盘展开/关闭面板、退出应用。
- 插件系统：通过 `manifest` + `activate/deactivate` 注册插件，通过事件总线通信。
- 本地数据库：基于 sql.js 的 SQLite 文件，默认保存到 `.data/assistant.db`。
- 知识库：支持笔记、分类、标签、搜索、创建、编辑和删除。
- 计算器：支持简单表达式计算。
- 开发工具：支持 JSON 格式化、Base64、时间戳、正则测试、UUID 生成。
- 配色研究页：用于沉淀 UI 色彩方案实验。

## 技术栈

- Electron 42
- React 18
- TypeScript 5
- Vite 6
- Chakra UI
- sql.js
- react-router-dom

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
```

## 目录结构

```text
src/
├── core/                 # 内核能力：事件总线、插件加载、数据库
│   ├── db.ts
│   ├── event-bus.ts
│   └── plugin-loader.ts
├── main/                 # Electron 主进程与 preload
│   ├── index.ts
│   └── preload.ts
├── plugins/              # 插件目录
│   ├── calculator/
│   ├── dev-utils/
│   ├── hello-world/
│   └── knowledge-base/
├── shared/               # 共享类型
└── types/                # 第三方类型补充

renderer/
├── components/           # 功能组件
├── pages/                # 页面
├── App.tsx               # 悬浮球/面板入口
├── router.tsx            # 面板路由配置
└── theme.ts              # Chakra 主题
```

## 架构约定

项目遵循 `docs/CONVENTIONS.md` 中的核心规则：

1. 插件之间禁止直接 `import`，跨模块通信统一走 `bus.emit()` / `bus.on()`。
2. 每个插件唯一对外接口放在自身的 `api.ts`。
3. 数据库统一通过 `core/db` 的 `getDatabase()` 获取连接。
4. 数据写入后必须调用 `autoSave()` 持久化。
5. `core:*` 为内核事件，插件使用 `plugin-id:*` 命名空间。

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
- `docs/changes/001-scaffold.md`：项目脚手架记录。
- `docs/changes/002-first-packaging-issues.md`：首次打包问题记录。

# UUUtil 项目核心结构

**项目定位**: 插件化个人辅助软件 — Electron + React + TypeScript 本地桌面应用脚手架

## 目录结构

```
src/
├── core/           # 内核模块
│   ├── ai.ts           # AI 统一入口兼容导出
│   ├── logger.ts       # JSON Lines 结构化日志、轮转、读取、清理
│   ├── event-bus.ts    # 全局单例 EventBus，插件间唯一通信通道
│   ├── plugin-loader.ts # 扫描 src/plugins/ 目录，动态加载激活插件
│   └── db.ts           # sql.js 内存数据库 + 手动 saveToDisk() 持久化
├── main/           # Electron 主进程
│   ├── index.ts        # 主进程入口，控制启动顺序
│   ├── preload.ts      # contextBridge 暴露 window.assistant API
│   └── ipc/            # IPC 通信模块（拆分后）
├── plugins/        # 插件目录（每个插件独立目录）
│   ├── hello-world/    # 示例插件模板
│   ├── calculator/     # 计算器插件
│   ├── dev-utils/      # 开发工具插件
│   ├── focus/          # 专注模式插件（开发中）
│   └── knowledge-base/ # 知识库插件
├── shared/         # 共享模块
│   ├── types.ts        # 所有模块共享的类型定义
│   └── assistant-api.ts # API 定义
└── types/          # 类型声明
    └── sql.js.d.ts     # sql.js 类型声明
renderer/           # Vite + React 渲染进程
├── components/     # React 组件
├── pages/          # 页面组件
├── App.tsx         # 根组件
├── main.tsx        # 渲染入口
└── router.tsx      # 路由配置
```

## 核心设计规则（铁律）

参见 `mem:conventions`

## 启动顺序

```
app.whenReady()
  → initLogger()
  → initDatabase()
  → initAi()
  → loadAllPlugins()
  → bus.emit('core:ready')
  → createWindow()
```

## 已有插件

- `hello-world` - 示例模板
- `calculator` - 计算器
- `dev-utils` - 开发工具
- `focus` - 专注模式（开发中，未完成）
- `knowledge-base` - 知识库

## 开发状态

- 主干分支 `main`，领先远程 10 个提交
- 正在开发 Focus 专注功能，涉及 IPC 重构、新增前端组件和插件模块

技术栈参见 `mem:tech_stack`，构建命令参见 `mem:suggested_commands`，约定参见 `mem:conventions`。
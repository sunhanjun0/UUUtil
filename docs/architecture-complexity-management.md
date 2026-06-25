# 架构方案：复杂度管理机制

> 状态：**待评审**（设计提案，未实施）
> 目标：在功能持续增长的前提下，让"新增一个功能"只改一处，靠约定与类型自动贯通进程边界。

---

## 1. 背景与问题

应用已从工具集合扩展到 AI 助手、白板、知识库、CLI、终端、日志等多个子系统。当前规模（截至本提案）：

| 指标 | 数值 |
|------|------|
| `src/main/index.ts` 行数 | 993 |
| `index.ts` 中 `ipcMain.handle/on` 数量 | 44 |
| `preload.ts` 中 `ipcRenderer.invoke/send` 数量 | 48 |
| `renderer/App.tsx` 行数（含 `window.assistant` 类型声明） | 694 |
| 渲染页面总行数 | 4298 |

问题不在"功能多"，而在**边界没有随功能增长而抽象**。三个具体热点：

### 热点 1：`src/main/index.ts` 是上帝文件

一个文件混入 6 类完全不同的职责：

- 窗口尺寸常量与圆角 shape
- 悬浮球窗口
- 面板窗口创建、显示、最大化、逐帧动画
- 系统托盘
- 悬浮球右键菜单
- **44 个 IPC handler**（白板 / 插件 / 知识库 / AI / CLI / 日志全堆在一起）

### 热点 2：IPC 通道三处重复定义（最痛）

每新增一个功能要同步修改 3 个文件，漏一处即静默失败：

1. `src/main/index.ts` —— `ipcMain.handle('channel', handler)`
2. `src/main/preload.ts` —— `ipcRenderer.invoke('channel', ...)` 转发
3. `renderer/App.tsx` —— `window.assistant` 的 TypeScript 类型声明

三处的"通道名 + 参数 + 返回类型"必须人工保持一致，没有任何编译期约束。

### 热点 3：插件抽象没有延伸到 IPC 边界

虽然内核有 `bus` / plugin-loader，遵循"插件隔离"铁律，但**知识库插件的 13 个方法是在 `index.ts` 里逐个手写桥接的**。插件并不自包含——新增插件仍要回头改内核三件套，违背了"复制目录即新增功能"的设计初衷。

---

## 2. 设计目标

1. **单一数据源**：一个 IPC 功能只定义一次（通道名 + handler + 类型）。
2. **编译期贯通**：`window.assistant` 类型从 handler 签名自动推导，改了 handler 类型，渲染层立刻报错。
3. **职责隔离**：主进程窗口逻辑与 IPC 逻辑分文件，`index.ts` 退化为 bootstrap 调度。
4. **渐进式**：分阶段落地，每阶段独立可验证、可回滚，不要求一次性大重构。
5. **不破坏现有铁律**：仍遵守插件隔离、bus 通信、core/db、core/logger 等既有约定。

---

## 3. 机制 A：IPC 注册表（单一数据源）

### 3.1 核心结构

定义一个"IPC 模块"为一组通道声明。每个声明同时承载运行时 handler 与静态类型：

```typescript
// src/main/ipc/types.ts
export interface IpcInvokeDef<Args extends any[], Result> {
  channel: string;
  kind: 'invoke';                       // ipcMain.handle
  handler: (...args: Args) => Result | Promise<Result>;
}

export interface IpcSendDef<Args extends any[]> {
  channel: string;
  kind: 'send';                         // ipcMain.on（无返回）
  handler: (event: IpcMainEvent, ...args: Args) => void;
}

export type IpcDef = IpcInvokeDef<any[], any> | IpcSendDef<any[]>;
export type IpcModule = { namespace: string; defs: IpcDef[] };
```

### 3.2 内核侧：模块自己声明通道

```typescript
// src/main/ipc/terminal.ipc.ts
import { defineInvoke, defineSend } from './define';
import { createTerminal, writeTerminal, ... } from '../terminal';

export const terminalIpc: IpcModule = {
  namespace: 'core:terminal',
  defs: [
    defineInvoke('core:terminal:create', (opts?: CreateOptions) => createTerminal(opts)),
    defineSend('core:terminal:input', (_e, id: string, data: string) => writeTerminal(id, data)),
    // ...
  ],
};
```

### 3.3 注册：`index.ts` 只剩一行调度

```typescript
// src/main/ipc/index.ts
import { registerIpcModules } from './register';
import { windowIpc, whiteboardIpc, pluginIpc, aiIpc, cliIpc, terminalIpc, logsIpc } from './...';

export function registerAllIpc() {
  registerIpcModules([windowIpc, whiteboardIpc, pluginIpc, aiIpc, cliIpc, terminalIpc, logsIpc]);
}
```

`registerIpcModules` 遍历每个 def，按 `kind` 调用 `ipcMain.handle` 或 `ipcMain.on`，并在 dev 下校验通道名唯一、命名空间合规（`core:*` / `plugin-id:*`）。

### 3.4 类型自动推导 → preload + 渲染层

preload 用一个泛型 `bridge` 工具，把模块声明转成 `window.assistant` 的实现，**类型由 def 推导**：

```typescript
// 从 IpcModule[] 推导出渲染层可见的 API 类型
type ApiFromModules<M extends IpcModule[]> = ...; // 利用 channel + handler 签名映射

// renderer 侧直接 import 这个类型，删除 App.tsx 里手写的 window.assistant 声明
declare global { interface Window { assistant: AssistantApi } }
```

> 注：流式通道（`ai:chat-stream`、`terminal:onData/onExit`）涉及事件回调而非简单 invoke，需在注册表中单列一种 `stream` kind，保留现有 listener 管理逻辑，不强行套用 invoke 模型。

### 3.5 收益

- 三处重复 → 一处声明。
- 改 handler 签名，渲染层编译期报错，杜绝静默失败。
- `index.ts` 的 44 个 handler 全部迁出，约缩减 300+ 行。

---

## 4. 机制 B：主进程按职责拆分

```
src/main/
├── index.ts            # 仅 bootstrap：initDb → loadPlugins → registerAllIpc → createWindows
├── windows/
│   ├── ball.ts         # 悬浮球窗口
│   ├── panel.ts        # 面板窗口（创建/显示/最大化）
│   ├── shape.ts        # 圆角 shape
│   └── animation.ts    # 展开/收起/最大化逐帧动画
├── tray.ts             # 系统托盘 + 右键菜单
├── terminal.ts         # （已存在）PTY 会话管理
└── ipc/
    ├── types.ts / define.ts / register.ts
    ├── window.ipc.ts
    ├── whiteboard.ipc.ts
    ├── plugin.ipc.ts
    ├── ai.ipc.ts
    ├── cli.ipc.ts
    ├── terminal.ipc.ts
    └── logs.ipc.ts
```

机制 A 完成后，拆分几乎是自然结果——handler 已经按命名空间分组迁出。

---

## 5. 机制 C：把 IPC 桥接纳入插件契约（可选，后置）

插件 `api.ts` 除导出函数外，额外导出 IPC 声明；plugin-loader 加载时自动把它注册进 IPC 表：

```typescript
// src/plugins/knowledge-base/api.ts
export const ipc: IpcModule = {
  namespace: 'plugin:knowledge-base',
  defs: [ defineInvoke('plugin:knowledge-base:getNotes', getNotes), ... ],
};
```

实现后，知识库插件在 `index.ts` 里的 13 个手写桥接全部消失，真正做到"复制目录即新增功能"。**建议等下次实际新增插件时再做**，避免空转重构。

---

## 6. 渲染层（机制 D，暂不动）

页面总计 4298 行，`AssistantPage` 较大但仍可维护，**当前不是瓶颈**。待机制 A/B 落地、IPC 边界稳定后再评估是否抽公共 hooks（如 `useAssistantApi`）。

---

## 7. 分阶段实施计划

| 阶段 | 内容 | 验证 | 风险 |
|------|------|------|------|
| 0 | 提交当前未提交改动（终端 / AI 思考 / 最大化），锁定基线 | `npm run build` 通过 | 无 |
| 1 | 落地机制 A 骨架：`ipc/types.ts`、`define.ts`、`register.ts`，先迁移 **terminal + logs**（通道少、风险低）验证模式 | 终端、日志页功能不回归 | 低 |
| 2 | 迁移 AI（含 stream kind）、CLI、白板、窗口控制 | 助手流式、CLI、白板、最大化均不回归 | 中（流式回调需特殊处理）|
| 3 | 删除 `App.tsx` 手写 `window.assistant` 类型，改为自动推导类型 | 渲染层零类型错误 | 中 |
| 4 | 执行机制 B：拆分 `windows/`、`tray.ts`，`index.ts` 瘦身为 bootstrap | 启动流程、窗口动画不回归 | 低 |
| 5（可选）| 机制 C：插件自带 IPC 声明，迁移知识库 13 个桥接 | 知识库功能不回归 | 低 |

每阶段独立提交，便于回滚。

---

## 8. 新增开发约定（实施后写入 CONVENTIONS.md）

1. 新增 IPC 功能：只在对应 `ipc/*.ipc.ts` 用 `defineInvoke/defineSend/defineStream` 声明一次，禁止再手写 `ipcMain.handle` / preload 转发 / `App.tsx` 类型。
2. 通道命名沿用现有约定：`core:*` 为内核，`plugin-id:*` 为插件。
3. 插件对外的 IPC 必须通过 `api.ts` 的 `ipc` 声明导出，不在内核里手写桥接。
4. `src/main/index.ts` 只允许包含 bootstrap 调度，不再新增业务 handler 或窗口逻辑。

---

## 9. 决策记录（已确认）

1. **阶段 0 先提交基线**：接受。先提交当前未提交的功能改动（终端 / AI 思考 / 最大化 / CLI 日志），锁定回滚点，再开始重构。
2. **API 类型过渡方案**：先采用"手动维护但集中在一个文件"的 `window.assistant` API 类型（替代当前散落在 `App.tsx` 的声明）。**类型自动推导暂不做**；后续结构化维护交由 agent 按约定生成/校对，不靠人工长期手维护。
3. **机制范围**：本轮执行 **A + B**（IPC 注册表 + 主进程拆分）。机制 C（插件自带 IPC 声明）推迟到下次实际新增插件时再做。


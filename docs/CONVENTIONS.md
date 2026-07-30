# 编码约定

## 铁律（不可违反）

### 1. 插件间禁止直接引用
```typescript
// ❌ 禁止
import { something } from '../plugins/knowledge/internal';

// ✅ 允许：通过事件总线通信
bus.emit('knowledge:search', query);
bus.on('knowledge:results', handler);
```

### 2. 每个插件暴露的接口定义在 api.ts
- 文件位置：`plugins/{plugin-id}/api.ts`
- 其他地方禁止 import 插件内部实现
- api.ts 是插件的「合同」，改了等于破坏向后兼容

### 3. 数据库操作统一走 core/db
- 插件不直接创建 SQLite 连接
- 通过 `getDatabase()` 获取已初始化的连接
- 写操作后调用 `autoSave()` 持久化到磁盘
- sql.js 是内存数据库 + 手动持久化模式
- 外部系统不要绕过应用主进程直接长期写 `.data/assistant.db`；需要跨进程接入时优先调用应用主进程的 IPC / CLI 入口
- 如果存在外部写入，读取前应使用 `reloadDatabaseIfChanged()` 之类的受控刷新能力，避免内存数据库覆盖新文件

### 4. 日志统一走 core/logger
- 主进程和核心模块使用 `src/core/logger.ts` 的 `debug/info/warn/error`
- 渲染进程通过 `window.assistant.log(level, scope, message, meta)` 上报日志
- 禁止在插件、页面或组件中自行创建分散日志文件
- 禁止记录 API Key、Token、完整请求头、完整用户隐私输入、附件原文和 base64 内容
- 推荐记录：模块 scope、操作名称、耗时、Token 用量、finishReason、错误摘要、资源 ID 等可诊断但不敏感的信息

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 插件目录 | 全小写横线分隔 | `screenshot-ocr` |
| TypeScript 文件 | 全小写横线或点分隔 | `event-bus.ts` |
| React 组件 | PascalCase | `PluginCard` |
| 数据库表名 | 蛇形命名 | `_plugins`, `plugin_todo_items` |
| 事件名 | `domain:action` | `core:ready`, `todo:item-created` |
| 日志 scope | 小写横线或冒号分层 | `app`, `ai`, `renderer:whiteboard` |

## 事件命名约定

- `core:*` — 内核事件（插件不要发 core 事件）
- `plugin-id:*` — 插件自己的事件命名空间

## 插件开关约定

- `_plugins.enabled` 是插件启用 / 禁用的唯一开关。`loadAllPlugins()` 加载前先查表，`enabled=0` 的插件目录整体跳过（不 require、不激活）。
- 目录在而表中无记录（首次启动 / 新增插件）由加载器自动注册并默认 `enabled=1`；注册走 upsert，只同步 `name` / `version`，禁止重置 `enabled`。
- 运行时改开关统一走 `setPluginEnabled()`（core/plugin-loader），经 CLI `plugin.enable` / `plugin.disable` 或 IPC `plugin:set-enabled` 暴露。
- 生效时机：禁用即时（已激活则调用 `deactivate()` 并卸载，发 `core:plugin-deactivated`），启用下次启动生效（避免同会话重复注册监听与命令）。因此插件的 `deactivate()` 应尽可能释放资源（定时器、监听器）。

## 数据库操作模式

```typescript
const db = getDatabase();
db.run('INSERT INTO ... VALUES (?, ?)', [val1, val2]);
autoSave(); // 写操作后必须调用
```

## IPC 与 preload API 管理

- 主进程 IPC 只能通过 `src/main/ipc/*.ipc.ts` 声明，并在 `src/main/ipc/index.ts` 聚合注册；不要在 `src/main/index.ts` 里新增 `ipcMain.handle/on`。
- 新 IPC 使用 `defineInvoke` / `defineSend`，由 `registerIpcModules()` 统一注册，避免通道重复和入口分散。
- `src/main/index.ts` 只负责 bootstrap 调度；窗口、CLI、白板、终端、插件桥接等业务逻辑放在各自模块。
- `window.assistant` 的类型合同统一维护在 `src/shared/assistant-api.ts`；preload 新增、删除或改签名时必须同步更新该文件。
- `src/main/preload.ts` 只暴露经过 `contextBridge` 包装的最小 API，不直接暴露 `ipcRenderer`、Node API 或任意命令执行能力。
- 终端 PTY API 仅供用户手动操作，禁止接入 AI 或远程内容驱动的调用链。

## CLI 接入约定

- CLI 是面向本机外部工具的能力出口，通信走 loopback HTTP（默认 `http://127.0.0.1:17878/cmd`），不做鉴权。
- CLI 站在 EventBus 前面，做「外部命令 → 内部 bus 事件」的翻译与请求/响应配对；内部代码一律直接用 `bus`，不经过 CLI。
- 命令风格只提供机器路径：`uuutil call <plugin.action> --json '{...}'`，参数优先 `--json`，缺省从 stdin 读；另有 `list` / `help` / `ping` 内建元命令。
- 命令 id 用 `plugin.action` 点号命名，与 bus 的 `plugin-id:action` 冒号命名区分。
- 命令由插件声明式注册（命令 id、描述、参数 schema、对应 bus 事件）；CLI 与 HTTP server 不持有插件业务知识，`list` / `help` 从注册表实时生成。
- 校验与分发全归 App 侧注册表；请求/响应按 requestId 配对，超时返回明确错误。
- CLI 调用进入统一日志，scope 建议 `cli`，记录命令 id、耗时、成功/失败和错误摘要，不记录完整参数正文、Token 或附件内容。
- 应用内 MCP 服务已废弃并删除，不再作为外部接入入口。

## 焦点功能约定

- 焦点是注意力观察对象，不是 TODO、任务完成状态或手动打卡系统。
- 焦点数据主要由 Skill、内部助手或其他外部系统以事件形式上报给 FIE 写入；渲染界面默认只读展示。
- 新增焦点写入能力时优先扩展 `src/plugins/focus/api.ts` 的合同，再通过 IPC / CLI 暴露。
- `focus_check_in` 是主要追加入口；不要为一次性小动作创建大量重复焦点。
- 权重、健康度、告警和检视节奏应由系统计算，不在 UI 中要求用户手动维护。
- 开发期清库只能通过 FIE 侧或明确的内部接口完成，不暴露为正式外部命令。

## 错误处理

- event-bus 中的 handler 不抛异常（会被静默捕获），但必须通过核心日志记录错误摘要。
- 插件内部自行处理异常，不传播到核心层。
- IPC 边界返回明确的 `{ success, error }` 或业务响应结构，不把未处理异常直接暴露给 UI。

## 日志记录模式

主进程和核心模块：

```typescript
import { info, warn, error } from './logger';

info('ai', 'chat_stream_completed', { durationMs, finishReason, usage });
warn('ai', 'chat_stream_cancelled', { streamId });
error('event-bus', '事件处理器出错', { event, error: message });
```

渲染进程：

```typescript
window.assistant.log('warn', 'assistant', '发送消息失败', { reason });
```

日志内容要求：

- `message` 使用稳定、可搜索的动作描述，不写整段用户输入。
- `meta` 只放诊断字段，避免敏感信息和大对象。
- 上传附件只记录文件名、mime、大小、类型，不记录文件内容或 dataUrl。
- 需要展示给用户的错误仍使用 toast/UI；日志只用于诊断和追踪。

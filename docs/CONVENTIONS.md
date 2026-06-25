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

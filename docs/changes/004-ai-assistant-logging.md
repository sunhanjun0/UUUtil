# 004 - AI 助手、流式输出、多模态附件与日志框架

## 背景

随着应用功能从工具集合扩展到 AI 助手、白板、知识库和后台配置，单纯依赖控制台输出已经不足以定位问题。本轮重点补齐 AI 对话体验、长内容生成能力、会话管理、多模态输入，并引入统一日志框架和日志管理页面。

---

## 主要变更

### 1. AI 助手流式输出

- OpenAI-compatible Connector 支持 `stream: true` 的 SSE 响应。
- 支持解析以下兼容格式：
  - `choices[0].delta.content`
  - `choices[0].message.content`
  - `choices[0].text`
- 支持最终尾部 buffer 解析，避免无换行尾包导致内容丢失。
- 渲染进程通过 `window.assistant.ai.chatStream()` 接收 chunk 并实时更新助手消息。
- 主进程使用 `AbortController` 管理每个 `streamId`，支持取消生成。
- 流式超时从“总耗时超时”调整为“空闲超时”，每次收到数据后重置计时器。

相关文件：

- `src/core/ai-runtime/connectors/openai-compatible.ts`
- `src/core/ai-runtime/chat-runtime.ts`
- `src/core/ai-runtime/types.ts`
- `src/main/index.ts`
- `src/main/preload.ts`
- `renderer/pages/AssistantPage.tsx`

---

### 2. Markdown 与回答元信息

- 助手消息改为 Markdown 渲染，使用 `@uiw/react-markdown-preview`。
- 用户消息保持纯文本展示。
- AI 回答页脚展示：
  - 耗时
  - prompt / completion / total Token
  - provider / model
  - `finishReason`
- 当 `finishReason === 'length'` 时提示回答可能被截断。
- Provider 未返回 usage 时，使用近似 Token 估算兜底。

相关文件：

- `renderer/pages/AssistantPage.tsx`
- `src/shared/types.ts`
- `src/core/ai-runtime/connectors/openai-compatible.ts`

---

### 3. 会话历史与侧边栏

- 助手页新增本地会话历史，使用 localStorage 持久化。
- 支持新对话、切换会话、清空当前会话。
- 会话入口从顶部按钮调整到左侧栏，避免主聊天区堆叠过多控制项。
- 侧边栏展示会话标题、更新时间和消息数量。

相关文件：

- `renderer/pages/AssistantPage.tsx`

---

### 4. 多模态附件输入

- 用户消息支持添加附件。
- 图片附件转换为 `image_url` part。
- 音频附件转换为 `input_audio` part。
- 普通文件暂不解析正文，只把文件名、mime、大小作为文本上下文发送。
- 附件卡片在用户消息中展示类型、文件名和大小。

当前限制：

- 图片、音频支持取决于具体 Provider 是否兼容 OpenAI 风格多模态消息。
- PDF、Office、文本文件尚未做内容提取。
- 附件 dataUrl 只用于请求构造，不应进入日志。

相关文件：

- `renderer/pages/AssistantPage.tsx`
- `src/shared/types.ts`

---

### 5. 日志框架

新增 `src/core/logger.ts` 作为统一日志入口：

- JSON Lines 结构化日志。
- 默认写入 Electron `userData/logs/uuutil.log`。
- 单文件 5 MB 自动轮转。
- 最多保留 5 个历史日志文件。
- 提供 `debug/info/warn/error`。
- 提供 `readRecentLogs()`、`openLogsDir()`、`clearLogs()`。
- 主进程启动时初始化日志，退出前关闭日志流。

已接入日志的位置：

- 应用启动、数据库初始化、AI 初始化、插件加载、核心就绪、应用退出。
- AI 普通调用开始/结束/失败。
- AI 流式调用开始/结束/失败/取消。
- EventBus handler 异常。
- 渲染进程可通过 IPC 上报日志。

相关文件：

- `src/core/logger.ts`
- `src/core/index.ts`
- `src/core/event-bus.ts`
- `src/main/index.ts`
- `src/main/preload.ts`
- `renderer/App.tsx`

---

### 6. 日志管理页面

新增后台“日志”页面，支持：

- 查看最近日志。
- 按 level 过滤。
- 按 scope 过滤。
- 刷新日志。
- 打开日志目录。
- 清空当前和轮转日志。
- 展示 `meta` JSON。

相关文件：

- `renderer/pages/LogsPage.tsx`
- `renderer/router.tsx`
- `src/main/index.ts`
- `src/main/preload.ts`
- `renderer/App.tsx`

---

## 新增开发约束

1. 日志统一走 `src/core/logger.ts` 或 `window.assistant.log()`，禁止新增分散日志文件。
2. 日志中禁止记录 API Key、Token、完整请求头、完整用户输入、附件原文和 base64。
3. AI 请求日志只记录 Provider ID、模型名、耗时、Token 用量、finishReason、错误摘要等诊断信息。
4. EventBus handler 不向外抛异常，但必须记录错误摘要。
5. 流式 AI 请求使用空闲超时语义，不再使用固定总耗时超时中断长回答。
6. UI 显示错误和日志记录分离：用户需要 toast/页面提示，日志用于定位问题。

---

## 验证

已执行：

```bash
npm run build
```

主进程 TypeScript 编译和渲染进程 Vite 构建均通过。

---

## 已知限制

1. Markdown 渲染依赖体积较大，生产构建存在 chunk size warning，但不影响运行。
2. 多模态消息是否可用取决于 Provider 对 `image_url` / `input_audio` 的兼容程度。
3. 普通文件附件尚未做内容提取，只传递元数据。
4. 日志管理页当前展示最近日志，尚未支持全文搜索、复制单条日志和导出诊断包。

---

## 后续建议

- 为白板、知识库、附件处理等高风险交互补充渲染进程日志上报。
- 日志管理页增加关键字搜索、复制、导出诊断包。
- 为 AI 多模态能力增加 Provider 能力标记和格式适配。
- 对普通文件附件补充安全的文本/PDF 提取能力。
- 评估 Markdown 依赖拆分或替换，降低助手页加载体积。

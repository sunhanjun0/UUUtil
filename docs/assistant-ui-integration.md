# assistant-ui 接入约束

本文档记录 UUUtil 接入 assistant-ui 的定位、边界和阶段计划，用于后续 AI 助手、白板 Agent、知识库问答等功能开发。

## 定位

assistant-ui 在本项目中定位为：

- AI 会话层
- Copilot / Agent 操作展示层
- 多轮上下文交互 UI 层

assistant-ui 不作为通用 UI 框架替代品，也不负责白板、知识库、插件等业务模块的核心逻辑。

## 基本原则

1. assistant-ui 仅运行在 renderer 进程。
2. 模型请求必须通过 `window.assistant.ai` 走 preload / IPC，不允许 renderer 直接请求模型服务。
3. API Key、Provider 配置和工具执行权限留在主进程 / core runtime 中。
4. assistant-ui adapter 只做消息格式适配，不承载业务规则。
5. Agent 工具调用必须由 core runtime 仲裁，不由 UI 组件直接调用插件内部实现。
6. UI 首版优先使用 assistant-ui primitives + Chakra UI 包装，保持项目视觉一致性。
7. PoC 阶段先使用非流式 `chat`，后续再扩展 streaming IPC。

## 推荐接入架构

```text
assistant-ui React components
        ↓
ChatModelAdapter
        ↓
window.assistant.ai.chat(...)
        ↓
Electron preload / IPC
        ↓
src/core/ai-runtime
        ↓
OpenAI-compatible Connector
```

## 阶段计划

### P0：独立 AI Assistant 页面

目标：验证 assistant-ui 与当前 Electron / React / AI runtime 的适配。

范围：

- 独立 `/assistant` 页面。
- 单线程对话。
- 非流式响应。
- 使用当前默认 Provider / 模型配置。
- 错误信息在对话或页面提示中展示。

不做：

- 工具调用。
- 白板上下文注入。
- 知识库检索。
- 会话持久化。
- streaming。

### P1：白板上下文助手

目标：让用户可以围绕当前画布提问。

范围：

- 当前画布摘要注入。
- 使用白板元素的名称、类型、时间戳、附件元数据作为上下文。
- AI 只回答和建议，不直接修改画布。

### P2：知识库问答

目标：支持基于笔记、分类、标签的问答和总结。

范围：

- 搜索命中笔记作为上下文。
- 支持当前笔记总结、改写、提纲生成。
- 支持分类/标签聚合总结。

### P3：工具调用与流式响应

目标：进入 Agent 化交互。

范围：

- streaming IPC。
- 工具调用过程展示。
- 工具执行权限控制。
- 会话持久化和线程列表。

## 适合场景

- 通用 AI 助手。
- 白板问答与整理。
- 知识库问答与总结。
- 翻译、改写、润色。
- 开发工具中的解释、修复、生成类辅助。

## 不适合场景

- 替代白板画布交互。
- 替代计算器、时间戳转换等强工具型页面。
- 直接从 renderer 请求模型服务。
- 在 UI 层直接执行插件内部逻辑。

## 后续持久化建议

后续如需持久化 assistant-ui thread，可在 SQLite 中设计：

```text
ai_threads
ai_messages
ai_message_context_refs
```

用于保存普通助手会话、白板上下文会话、知识库问答会话，以及消息与上下文来源的关联。

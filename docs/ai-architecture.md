# AI / Agent 架构原则

## 目标

AI / Agent 能力作为旁路运行时接入主应用，核心业务不直接绑定 Mastra、LangGraph、AI SDK 或其他具体框架。

核心应用只依赖项目内部定义的 Connector 协议。具体 AI 框架、模型供应商、Agent Runtime、Workflow 引擎都作为 Connector 实现接入。

## 设计原则

1. **框架无关**：业务代码不得直接依赖具体 Agent 框架。
2. **旁路接入**：AI Runtime 不作为主应用基础依赖，失败时不影响普通工具能力。
3. **Connector 边界**：所有外部模型、Agent、Workflow、MCP 能力通过 Connector 适配。
4. **能力声明**：通过 capabilities 判断能力，不通过 provider 名称硬编码逻辑。
5. **插件隔离**：Agent 工具能力通过统一 Tool Bridge 暴露，不直接 import 插件内部实现。
6. **渐进演进**：先支持 chat，再扩展 stream、tools、memory、workflow、RAG、MCP。

## 分层

```txt
Renderer UI
  ↓
Core AI / Agent Facade
  ↓
Connector Registry
  ↓
Connectors
  ├── openai-compatible
  ├── mastra
  ├── langgraph
  ├── ai-sdk
  └── local-agent
```

## 推荐目录

```txt
src/core/ai-runtime/
├── index.ts
├── types.ts
├── provider-store.ts
├── runtime-config.ts
├── chat-runtime.ts
├── connector-registry.ts
└── connectors/
    └── openai-compatible.ts
```

后续 Agent 能力可独立扩展：

```txt
src/core/agent-runtime/
├── index.ts
├── types.ts
├── runtime.ts
├── connector-registry.ts
├── tool-registry.ts
├── memory.ts
└── connectors/
    ├── mastra.ts
    ├── langgraph.ts
    └── local.ts
```

## Connector 协议

Model Connector 负责模型层调用：

```ts
interface ModelConnector {
  id: string;
  name: string;
  providerType: string;
  capabilities: Array<'chat' | 'stream' | 'vision' | 'embedding'>;
  chat(request: ConnectorChatRequest): Promise<AiChatResponse>;
}
```

Agent Connector 后续负责 Agent / Workflow：

```ts
interface AgentConnector {
  id: string;
  name: string;
  capabilities: Array<'tools' | 'memory' | 'workflow' | 'stream' | 'mcp'>;
  run(request: AgentRunRequest): Promise<AgentRunResponse>;
}
```

## 当前实现

当前阶段只落地 Model Connector：

- `openai-compatible`：兼容 OpenAI Chat Completions API。

现有 renderer / IPC 对外 API 保持不变：

- `listAiProviders()`
- `upsertAiProvider()`
- `deleteAiProvider()`
- `getAiRuntimeConfig()`
- `updateAiRuntimeConfig()`
- `chat()`

## 后续接入 Mastra 的方式

Mastra 只作为 Connector，不进入核心业务层：

```txt
UUUtil AgentRequest
  ↓
MastraConnector
  ↓
Mastra Agent / Workflow
```

禁止在业务页面、插件或主进程 IPC 中直接调用 Mastra API。所有调用必须经过 Agent Runtime / Connector Registry。
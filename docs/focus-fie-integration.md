# 焦点管理与 FIE 接入

## 定位

UUUtil Focus 是注意力观察系统，不是 TODO、任务管理或手动打卡系统。它的核心价值是让助手、Agent 和外部系统把“本轮实际关注了什么”作为**事件**上报给本地的 FIE（Focus Ingestion Engine，焦点摄取引擎），由引擎自动完成归因，用户随后可以通过看板回看近期注意力、焦点分布、归因决策和趋势。

从 v0.3.0 起，Focus 插件不再持有本地 SQLite 数据，也不再提供人工创建 / check-in 表单。它是 **FIE 的纯只读视图 + 事件摄取代理**：

- 唯一数据源是独立运行的 FIE 服务（默认 `http://127.0.0.1:17879`）。
- 应用内 MCP 服务（旧端口 17878）已废弃并删除。
- UI 只读展示 FIE 返回的 focuses / runs / trend。
- 唯一的写入路径是把 `AttentionEvent` 事件转发给 FIE，由引擎决定 skip / check_in / create_and_check_in。

适合上报为注意力事件的内容包括：

- 持续产品方向、功能重建、架构风险和调试线索。
- 一轮实质性实现、排查、评审、验证或工具接入。
- 反复回到的同一问题、决策、阻塞或下一步。
- Agent / Skill / 自动化带来的工作状态变化。

不适合上报的内容包括：

- 打招呼、闲聊、简单问答和一次性无上下文动作。
- 每个细碎 TODO、临时命令或不需要长期回看的操作。

## 数据流

```text
外部 Agent / Codex / 自动化
        ↓ 直接 HTTP 上报事件
FIE 焦点摄取引擎 (127.0.0.1:17879)
        ↑ HTTP 读取 / 事件转发
focus 插件 fie-client（Node http）
        ↑ IPC (focus:*)
焦点看板 UI（只读）
```

关键原则：

- **FIE 是唯一事实来源**，UUUtil 不再落地本地 focus 表。
- 外部 Agent 可以直接调用 FIE 的 HTTP 接口上报事件，无需经过 UUUtil。
- UUUtil 内部通过 `src/plugins/focus/fie-client.ts` 以 Node `http` 模块访问 FIE，零新增依赖。
- 客户端返回统一的 `FieResult<T>`（`{ ok:true, data } | { ok:false, error, offline? }`），UI 借此区分“离线 / 空数据 / 出错”。
- 渲染界面只负责展示，不提供人工 check-in 表单。

## 服务地址

默认 FIE 地址：

```text
http://127.0.0.1:17879
```

健康检查：

```bash
curl http://127.0.0.1:17879/health
# → {"ok":true,"service":"focus-ingestion-engine"}
```

可配置环境变量（UUUtil 侧的 fie-client 读取）：

```bash
UUUTIL_FIE_URL=http://127.0.0.1:17879   # 完整地址，优先级最高
FIE_HOST=127.0.0.1                      # 未设置 URL 时使用
FIE_PORT=17879
```

若设置了 `UUUTIL_FIE_URL`，则忽略 `FIE_HOST` / `FIE_PORT`。

## FIE HTTP 接口

UUUtil 使用以下 FIE 端点（详见 FIE 自身的 `/docs`）：

- `POST /v1/events/ingest`：上报单个注意力事件。
- `POST /v1/events/batch`：批量上报（1–100 条）。
- `GET /v1/runs?limit=`：读取归因运行记录（limit ≤ 200）。
- `GET /v1/runs/:id`：读取单次运行详情（候选、事件、check-in）。
- `GET /v1/focuses?limit=&includeArchived=`：读取焦点列表。
- `GET /v1/trend?days=&focusId=`：读取趋势（days ≤ 365）。
- `GET /health`：健康检查。

幂等键为 `source + sourceEventId`：重复上报同一事件会被去重。FIE 负责敏感信息脱敏。

### AttentionEvent 结构

```ts
interface AttentionEvent {
  source: string;          // 事件来源，如 "codex" / "uuutil"
  sourceEventId: string;   // 来源内唯一 ID，用于幂等去重
  occurredAt: string;      // ISO 时间
  type: string;            // 事件类型
  project?: string;        // 项目名，参与归因评分
  summary?: string;        // 简要说明
  content?: string;        // 正文（FIE 侧脱敏）
  metadata?: Record<string, unknown>;
}
```

### 归因决策

FIE 对事件与现有焦点计算匹配分（项目 +50、焦点名 +30、关键词各 +10、文件路径 25/8/4、近期活动 +5）：

- 分数 ≥ `T_MATCH`（默认 50）→ `check_in`，归入已有焦点。
- 分数 ≥ `T_CREATE`（默认 25）→ `create_and_check_in`，创建新焦点。
- 否则 → `skip`。

阈值由 FIE 侧的 `FIE_T_MATCH` / `FIE_T_CREATE` 环境变量控制。

## UUUtil 内部接口

渲染进程通过 `window.assistant.focus` 访问（preload 桥接到 IPC）：

- `focus.ingest(event)` → `focus:ingest`
- `focus.ingestBatch(events)` → `focus:ingest-batch`
- `focus.listFocuses(options)` → `focus:list-focuses`
- `focus.listRuns(limit)` → `focus:list-runs`
- `focus.getRun(id)` → `focus:get-run`
- `focus.trend(options)` → `focus:trend`
- `focus.health()` → `focus:health`

全部返回 `FieResult<T>`。插件在成功摄取事件后通过 `bus.emit('focus:ingested', ...)` 通知其他模块，并写入统一日志（scope `focus`，message `event_ingested`），供悬浮球活动提示读取。

## Agent 上报流程

每个实质性回合末尾建议：

1. 判断本轮是否有实质工作；打招呼 / 闲聊 / 简单回答则跳过。
2. 组装 `AttentionEvent`（填写 `source`、稳定的 `sourceEventId`、`project`、`summary`）。
3. 直接 `POST /v1/events/ingest` 到 FIE（或经 UUUtil 的 `focus.ingest`）。
4. 由 FIE 自动完成归因，无需手动创建焦点或选择归属。

## 日志与排查

摄取事件会进入统一日志系统，默认位于 Electron `userData/logs/uuutil.log`，scope 为 `focus`。日志记录来源、决策和错误摘要，不记录完整用户输入、Token、请求头、附件正文或 base64。

如果 UI 没有显示数据，优先排查：

1. FIE 服务是否正在运行：`curl http://127.0.0.1:17879/health`。
2. `UUUTIL_FIE_URL` / `FIE_HOST` / `FIE_PORT` 是否指向正确地址。
3. 焦点看板顶部是否出现离线提示（fie-client 判定连接被拒 / 超时时会标记 `offline`）。
4. 日志页中是否出现 scope 为 `focus` 的记录。
5. FIE 自身是否已成功归因（`GET /v1/runs` 查看最近运行与决策）。

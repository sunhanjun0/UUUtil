# 焦点管理与 MCP 接入

## 定位

UUUtil Focus 是注意力观察系统，不是 TODO、任务管理或手动打卡系统。它的核心价值是让助手、MCP 工具和外部系统把“本轮实际关注了什么”自动写入本地应用，用户随后可以通过看板回看近期注意力、漂移主题、阻塞和下一步。

适合写入 Focus 的内容包括：

- 持续产品方向、功能重建、架构风险和调试线索。
- 一轮实质性实现、排查、评审、验证或工具接入。
- 反复回到的同一问题、决策、阻塞或下一步。
- Agent / Skill / MCP / 自动化带来的工作状态变化。

不适合写入 Focus 的内容包括：

- 打招呼、闲聊、简单问答和一次性无上下文动作。
- 每个细碎 TODO、临时命令或不需要长期回看的操作。
- 人为完成状态、归档状态或手动维护的任务列表。

## 数据流

```text
Codex / 其他 Agent / 外部系统
        ↓ MCP tools
UUUtil 应用内 Streamable HTTP MCP 服务
        ↓ 串行化工具调用
focus 插件 API
        ↓ core/db + autoSave
sql.js / SQLite
        ↓ IPC 只读查询
焦点看板 UI
```

关键原则：

- Electron 主应用是默认数据库持有者。
- 外部系统统一调用应用内 HTTP MCP 服务，不各自启动 direct-db 进程抢写数据库。
- MCP 工具复用 `src/plugins/focus/api.ts`，不复制业务规则。
- 写工具在服务内串行执行，并在成功写入后 flush 数据库。
- 渲染界面只负责展示，不提供人工 check-in 表单。

## 服务地址

默认 MCP 地址：

```text
http://127.0.0.1:17878/mcp
```

健康检查：

```bash
curl http://127.0.0.1:17878/health
```

可配置环境变量：

```bash
UUUTIL_MCP_HOST=127.0.0.1
UUUTIL_MCP_PORT=17878
UUUTIL_MCP_PATH=/mcp
UUUTIL_MCP_URL=http://127.0.0.1:17878/mcp
```

`UUUTIL_MCP_URL` 主要用于 stdio 代理入口指定要转发的 HTTP MCP 地址。

## MCP Client 配置

推荐配置：

```json
{
  "mcpServers": {
    "uuutil": {
      "type": "streamable_http",
      "url": "http://127.0.0.1:17878/mcp"
    }
  }
}
```

兼容最小配置：

```json
{
  "mcpServers": {
    "uuutil": {
      "url": "http://127.0.0.1:17878/mcp"
    }
  }
}
```

如果某个客户端只支持 stdio，可使用仓库内入口代理到 HTTP 服务：

```json
{
  "mcpServers": {
    "uuutil": {
      "command": "node",
      "args": ["/Users/hanjun/UUUtil/dist/mcp/server.js"],
      "env": {
        "UUUTIL_MCP_URL": "http://127.0.0.1:17878/mcp"
      }
    }
  }
}
```

注意：使用 stdio 代理前需要先执行 `npm run mcp:build`，并确保 UUUtil 应用正在运行。

## 可用工具

- `focus_create`：创建一个关注对象。
- `focus_check_in`：追加一次检视记录，是最主要的写入入口。
- `focus_update_metadata`：修正名称、描述、期望退出条件和标签。
- `focus_get`：读取单个焦点及计算字段。
- `focus_list`：按健康度、标签、关注模式等筛选焦点列表。
- `focus_alerts`：读取当前告警。
- `focus_checkins`：读取某个焦点的检视历史。
- `focus_stats`：读取注意力分布统计。
- `focus_create_tag` / `focus_update_tag` / `focus_delete_tag` / `focus_list_tags`：维护标签。

不会暴露正式 `focus_reset_all` MCP 工具。开发期清空数据使用：

```bash
npm run focus:reset-all
```

## Agent 写入流程

每个实质性回合末尾建议执行：

1. 判断本轮是否有实质工作；如果只是打招呼、闲聊或简单回答，则跳过。
2. 调用 `focus_list` 查找是否已有匹配焦点。
3. 若无匹配焦点，调用 `focus_create` 创建稳定主题，不要按细碎动作创建重复焦点。
4. 调用 `focus_check_in` 记录本轮进展、阻塞和下一步。
5. 仅在元数据明显不准确时调用 `focus_update_metadata`。

`focus_check_in` 字段建议：

- `energy=engaged`：本轮有清晰推进或决策。
- `energy=neutral`：例行维护、整理、记录或不确定但未卡住。
- `energy=avoiding`：出现拖延、反复失败、归属不清或明显阻力。
- `notes`：简要说明发生了什么。
- `blocker`：仅记录真实阻塞，不要填泛泛描述。
- `nextAction`：记录下一步可执行动作；没有就省略。

## 日志与排查

MCP 调用会进入统一日志系统，默认位于 Electron `userData/logs/uuutil.log`。相关 scope：

- `mcp:http`：HTTP 服务启动、会话、请求和关闭。
- `mcp`：工具调用开始、完成、失败和数据库刷新。

日志会记录工具名、耗时、成功/失败和错误摘要，不记录完整用户输入、Token、请求头、附件正文或 base64。

如果 UI 没有显示数据，优先排查：

1. UUUtil 应用是否正在运行。
2. `curl http://127.0.0.1:17878/health` 是否返回正常。
3. 日志页中是否出现 `mcp` / `mcp:http` 记录。
4. MCP Client 是否配置到 `http://127.0.0.1:17878/mcp`。
5. 是否误用了 direct-db 进程导致数据写入了另一个数据库路径。


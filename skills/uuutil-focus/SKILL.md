---
name: uuutil-focus
description: 在每个实质性回合末尾，通过本机 `uuutil` CLI 把注意力事件上报给 UUUtil Focus。适用于涉及实现、调试、规划、产品/设计决策、评审、交接、阻塞、验证、工具/skill 开发或多轮讨论的回合。回合接近结束时，用 `uuutil call focus.ingest` 上报一条事件即可，归因（skip / check_in / create_and_check_in）由 FIE 引擎自动完成。仅在琐碎回合或用户明确拒绝时跳过。
---

# UUUtil Focus

用这个 skill 与用户的 UUUtil Focus 系统协作。Focus 是一个注意力观察看板，不是任务管理器。你的职责是把用户跨对话的真实注意力轨迹保留下来，而不需要用户手动维护焦点记录。

## 核心模型（重点：这里变了）

你**不需要**判断某个回合属于哪个焦点，也**不需要**自己创建焦点或写 check-in。你只负责**上报一条注意力事件**。由一个独立服务 FIE（Focus Ingestion Engine，焦点摄取引擎）接收事件并自行决定：

- `skip` —— 不值得记录。
- `check_in` —— 匹配到已有焦点，追加一条 check-in。
- `create_and_check_in` —— 没有合适匹配，新建一个焦点并写入 check-in。

所以对你来说写操作只有一个：`focus.ingest`。如实上报，把归因交给 FIE。不要自己去预匹配、去重或管理焦点对象。

把焦点理解为一个“活的注意力对象”：某个项目、产品方向、一类 bug、调查线索、架构隐忧、反复出现的风险或长期主题。它衡量的是**注意力随时间的变化**（进展、沉默、阻塞、决策、下一步、反复回到同一话题），而不是任务是否完成。

## Agent 职责

在自然的工作边界上充当“注意力记录员”。先完成用户交代的正事；在每个实质性回合接近结束、给出最终回复之前，上报一条注意力事件。把它当作回合末尾的默认动作，而不是可选项。

安静、自动地上报。除非用户明确禁止，或内容异常敏感，否则不必征求许可。有用时才简短提一句记录了什么，绝不让焦点记账占据最终回复。

出现以下任一情况时上报事件：

- 有意义的实现、重构、调试、评审或验证进展。
- 产品、交互、架构、流程或集成方面的决策。
- 阻塞、不确定性、依赖、未决风险或失败的尝试。
- 需要后续 agent 注意的交接、计划、下一步或状态小结。
- 跨回合反复讨论的同一话题。
- 改变未来工作方式的工具、skill、插件或自动化工作。

以下情况跳过：打招呼、附和、琐碎的事实性回答、纯机械的一次性命令、用完即弃的探索，或不产生持久上下文的回合。

默认规则：只要你改了文件、跑了验证、改了配置、查了 bug、做了设计决策，或用了多条消息打磨行为，就在最终回复前上报一条事件。只有回合明显琐碎时才跳过。

## 如何上报（唯一的命令）

```bash
uuutil call focus.ingest --json '{
  "source": "codex",
  "sourceEventId": "<每条事件唯一的-id>",
  "occurredAt": "2026-07-15T14:53:00+08:00",
  "type": "conversation.finished",
  "project": "<项目或仓库名>",
  "summary": "<一句话如实概括本回合发生了什么>"
}'
```

摘要较长时，改用 stdin 传 JSON，避免命令行转义麻烦：

```bash
echo '{"source":"codex","sourceEventId":"...","occurredAt":"...","type":"conversation.finished","project":"...","summary":"..."}' | uuutil call focus.ingest
```

字段说明：

- `source`：你的稳定来源标识，例如 `codex`。它与 `sourceEventId` 组成幂等键。
- `sourceEventId`：每条事件唯一。复用同一个值会被当作重复事件去重，所以每个新回合用一个新值（时间戳或 uuid）。
- `occurredAt`：ISO 8601 带时区偏移，例如 `2026-07-15T14:53:00+08:00`。
- `type`：形如 `domain.action` 的字符串。回合末尾常用 `conversation.finished`。
- `project`：项目/仓库名。它对归因到正确焦点影响很大。
- `summary`：一句如实的话，写清本回合改了什么、决定了什么或卡在哪。写给日后扫看板的 agent 看。
- `content`（可选）：更完整的正文，脱敏由 FIE 负责。
- `metadata`（可选）：任意键值；其中 `files`（字符串数组）可用于按文件路径跨工具匹配。

用用户的工作语言写摘要。对这位用户的 UUUtil 工作，通常用中文合适。

好的摘要：`补全 focus CLI 读命令（list/runs/run/trend/health）并端到端验证。`
差的摘要：`做了点东西。`

## 读取（可选，用于写得更准或核对）

上报本身不需要读，但读能帮你写出更准的 `summary`，或确认写入是否落地：

- `uuutil call focus.list --json '{"limit":20}'` —— 当前焦点（名称、项目、关键词、状态）。
- `uuutil call focus.runs --json '{"limit":10}'` —— 最近的归因决策。
- `uuutil call focus.run --json '{"id":"run_xxx"}'` —— 某次 run 的候选、事件和 check-in。
- `uuutil call focus.trend --json '{"days":30}'` —— 按天的活跃趋势。
- `uuutil call focus.health --json '{}'` —— 检查 FIE 是否可达。

## 输出与失败处理

每条命令都把 JSON 打到 stdout，成功 exit 0、失败非 0。成功时 `data` 里带着 FIE 的决策，例如：

```json
{ "ok": true, "data": { "decision": "check_in", "focusId": "focus_...", "reason": "..." } }
```

命令失败时：

- `code: "transport"` / “连接不上 UUUtil” —— UUUtil 桌面应用没在运行，或 CLI 服务未启动。不要转而去改数据库或用别的方式打 FIE。简短说明焦点记录未能完成，然后继续。
- `code: "handler_error"` 且消息含“FIE 服务不可达” —— FIE 引擎没在跑，同样处理。
- `code: "invalid_args"` —— 补齐缺失/非法字段后重试。

绝不让 Focus 记录失败拖垮用户的主任务。如果重要，用一句话说明这次没记上，并留足上下文供之后重试。

## 协作规则

Focus 是跨 agent、跨工具的共享状态：

- 只上报真实发生的事，绝不编造进展。
- 把不确定写成不确定，而不是写成已定的决策。
- 高层概括够用时，别把敏感细节写进 `summary` / `content`。
- 不要试图从这个 skill 删除、重置、合并或批量编辑焦点——设计上就没有这类命令。
- 归因交给 FIE。如果你的事件落到了预期之外的焦点上，那是 FIE 的判断，不是需要你纠正的错误。

## 最终回复行为

最终回复保持聚焦在用户交代的正事上。如果你上报了事件，有用时才简短提一句，例如：`已顺手记录到 UUUtil Focus。` 除非用户要求，不要展示原始 JSON 负载，也不要把焦点记录说得像是用户需要维护的任务。

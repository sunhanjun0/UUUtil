---
name: uuutil-reminder
description: 通过本机 `uuutil` CLI 把提醒或阻塞式确认推送到用户的 UUUtil 提醒中心。适用于需要用户注意但不必立即打断（notify），或必须在继续前拿到用户明确决定（ask）的场景，例如：告知一个长任务完成、上报一个刚发现的风险、请求批准一个破坏性操作、在计划分叉时让用户点选方向。仅在 agent 本身能确定处理、不需要用户视觉可见的琐碎步骤上跳过。
---

# UUUtil Reminder

用这个 skill 与用户的 UUUtil 提醒中心协作。它是一个通用的"消息 + 确认"底座，不是 vibecoding 的任务追踪。你的职责是在合适的时刻把该让用户看到的东西推过去，或在该等用户拍板的地方安静地等。

## 两种提醒，一种取舍

| 类型 | 语义 | 你等不等？ | 何时用 |
|---|---|---|---|
| `notify` (`info`/`action`) | 单向告知或提示"有事在等" | 不等，即发即退 | 长任务完成、后台失败、上报状态、留下痕迹供用户回头看 |
| `ask` | 阻塞式确认，返回用户选择 | 等，最长可 3600 秒 | 破坏性操作、方向抉择、需要 reason 的拒绝、跨会话恢复前的核对 |

判断规则：**如果不做这件事你就没法继续、或做了就没法撤，用 `ask`；否则一律 `notify`。**

## 何时上报

在自然的工作边界上主动使用。默认场景：

- 长跑动作跑完，用户可能已经切走：`notify` 一条 info。
- 发现了用户可能想知道的风险、隐忧或偏离预期：`notify` 一条 action（type=`action`, severity 视情况）。
- 要执行不可逆动作（删文件、改配置、发外部请求、重启服务、`git push --force` 类）且用户没显式授权：`ask`。
- 面对两条以上路径且你判断不了哪条更好：`ask`。
- 长会话即将交接给另一个 agent，且有一处非做不可的确认：`ask`。

不要在琐碎回合、机械回答、纯读代码/搜索时打扰用户。这个 skill 是"用户注意力入口"，滥用会让面板变噪音。

## 单向 notify

```bash
uuutil call reminder.notify --json '{
  "source": "codex",
  "type": "info",
  "severity": "info",
  "title": "构建完成",
  "body": "main 分支构建成功，耗时 42s",
  "key": "codex:build:main"
}'
```

字段：

- `source`：稳定来源，例如 `codex`。
- `type`：`info`（告知，悬浮球轻闪一次）或 `action`（需处理，悬浮球持续暖橙脉动直到被响应）。
- `severity`：`info` / `warning` / `error`，只影响面板配色。
- `title`：一句话主标题。
- `body`（可选）：详情正文。
- `key`（可选）：同 `source` 内的去重键。命中活跃行时更新而非新增，很适合"同一件事的进度更新"。
- `metadata`（可选）：任意 JSON 扩展。

返回结构里带 `deduped: true|false`，你可以据此判断这条是新增还是覆盖旧的。

## 阻塞式 ask

```bash
uuutil call reminder.ask --json '{
  "source": "codex",
  "title": "确认删除 /tmp/old-cache？",
  "body": "此操作不可撤销，将删除 42 个文件。",
  "severity": "warning",
  "key": "codex:cleanup:tmp-cache",
  "timeoutSec": 300,
  "actions": [
    { "id": "approve", "label": "允许", "style": "primary" },
    { "id": "deny",    "label": "拒绝", "style": "danger", "requiresReason": true }
  ]
}'
```

`actions` 是必填数组，1–5 条。每条：

- `id`：程序处理时用。
- `label`：面板按钮上显示的文字。
- `style`：`primary` / `danger` / `default`，只影响按钮配色。
- `requiresReason`：`true` 时面板要求用户在提交前填理由；不填则响应失败。

`timeoutSec` 默认 300，上限 3600。

**四种终态**，看 stdout `data.status` 与 exit code：

| status | exit code | 含义 | 你该怎么办 |
|---|---|---|---|
| `responded` | 0 | 用户点了按钮 | 读 `data.actionId` 与 `data.reason` 决定分支 |
| `timeout` | 2 | 到时间没人响应 | 默认视作"不做"，或按你的场景灵活处理 |
| `dismissed` | 3 | 用户在面板点了"忽略" | 视作"用户明确不想做" |
| `superseded` | 4 | 同 `source+key` 的更新版 ask 顶掉了这条 | 你的这次请求已被替代，交给新一位处理 |

`responded` 示例：

```json
{
  "ok": true,
  "data": {
    "status": "responded",
    "reminderId": "rem_abc...",
    "actionId": "approve",
    "reason": null,
    "respondedAt": "2026-07-16T09:00:00.000Z"
  }
}
```

## 主动收尾

如果你 `ask` 出去以后自己想通了、不需要用户回应了，用 `reminder.dismiss` 主动关掉那一条，别让面板上挂着无意义的等待卡片。挂在同一条上的等待方会收到 `status: dismissed`。

```bash
uuutil call reminder.dismiss --json '{"id":"rem_abc..."}'
```

面板背后走的接口也是同一套，因此人和 agent 用同一个流。

## 查询与只读

- `uuutil call reminder.list --json '{"status":"active","limit":20}'` —— 列出提醒。`status` 支持 `active` / `done` / `dismissed`。
- `uuutil call reminder.get --json '{"id":"rem_..."}'` —— 取单条详情。

## 失败与降级

- `code: "transport"` / "连接不上 UUUtil" —— 应用没开或 CLI 服务未启动。**不要**尝试写文件、发邮件、开 tab 之类替代方式；简短告知用户"这次没能送到提醒中心"，然后继续主线。
- `code: "handler_error"` 且消息带"未定义的 actionId" / "需要 reason" —— 参数写错了，改后重试。
- `code: "invalid_args"` —— 少必填字段，补齐重试。

提醒失败绝不能拖住你的主任务。如果这条提醒本身重要，用一句话讲清楚"没送到提醒中心，内容是……"，把上下文留给用户或下一位 agent。

## 何时不用这个 skill

- 想给自己做 TODO / 任务清单 —— 那是 focus 或知识库的事。
- 想批量给用户看很多条信息 —— 用一条 body 长一点的 notify，或把它们汇总成一份文档链接。别一次糊十条。
- 想跨会话记录注意力 —— 用 `uuutil-focus` skill，不要拿 reminder 当日志。
- 想在同一份代码内部通信 —— 那是插件间事件总线的活，不该出走 CLI。

## 与 Claude Code hook 的关系

用户本机的 Claude Code 挂了一个 PreToolUse hook（`docs/claude-hook/uuutil-preToolUse.sh`）：Claude 触发危险 Bash 时会自动 `reminder.ask` 一条给用户过一遍。这套流程对你（Codex）不是必须的知识，但你 `notify` / `ask` 出去的东西会和 Claude 的确认卡片并列显示在同一个面板里，所以 `source` 字段务必写清楚是 `codex`，`title` 尽量自带上下文，别让用户混淆是谁在说话。

## 最终回复行为

保持在用户交代的正事上。如果你 `notify` 了什么，可以简短提一句（"已把 X 结果推到提醒中心"），但不要贴出原始 JSON。如果你在 `ask` 后拿到 `responded`，把用户的选择自然地融进后续行为，不用赘述"你在面板上选了……"。如果拿到 `timeout` / `dismissed`，默认视作"用户没决定"，按更保守的方向继续或直接停下告诉用户。

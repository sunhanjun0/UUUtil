# UUUtil ↔ Claude Code Hook 接入

用 UUUtil 的 `reminder.ask` 命令给 Claude Code 做人工审核关：Claude 触发一次 Bash 时，
hook 判断是否命中危险模式，若命中则通过 UUUtil 提醒中心弹出待响应卡片，
根据你的按钮点击返回 approve/deny，Claude 收到 stderr 里的 reason 后据此调整。

## 契约（基于 Claude Code 2.1.201 实测）

Hook stdin 收到的 JSON（PreToolUse / Bash 场景）：

```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "/private/tmp",
  "prompt_id": "...",
  "permission_mode": "bypassPermissions",
  "effort": {"level": "high"},
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {"command": "...", "description": "..."},
  "tool_use_id": "..."
}
```

Hook 决策通过 exit code + stderr：

| 决策 | 退出码 | Claude 端行为 |
|---|---|---|
| 放行 | 0 | 静默继续执行工具 |
| 阻断 | 2 | Claude 看到形如 `PreToolUse:Bash hook error: [/path/to/hook.sh]: <stderr 原文>`，模型据此调整或告知用户 |
| 出错 | 其他非 0 | Claude 视为 hook 异常，一般也会阻断，行为不稳定；避免走这条 |

## 决策映射

| `reminder.ask` 返回 status | hook 行为 |
|---|---|
| `responded` + approve | exit 0 |
| `responded` + deny | exit 2 + stderr = 用户 reason |
| `timeout` | 默认 exit 0（放行）；`UUUTIL_HOOK_ON_TIMEOUT=deny` 时改为 exit 2 |
| `dismissed` | exit 2 |
| `superseded` | exit 0（同 key 的新 ask 已经接管） |
| CLI 报 transport 错（app 未开） | exit 0 |
| uuutil 未安装 | exit 0 |

## 危险模式（保守版）

- `rm -r/-rf/-fr/-f <路径>`
- `sudo ...`
- `dd if=...`
- `> /dev/(sd*|disk*|zero)`

未命中的 Bash 命令一律 exit 0 放行。要放宽或收紧改 `is_dangerous()`。

## 安装

```bash
mkdir -p ~/.claude/hooks
cp docs/claude-hook/uuutil-preToolUse.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/uuutil-preToolUse.sh
```

然后在 `~/.claude/settings.json` 加入：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/Users/<你>/.claude/hooks/uuutil-preToolUse.sh" }
        ]
      }
    ]
  }
}
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `UUUTIL_HOOK_TIMEOUT_SEC` | 180 | `reminder.ask` 等待秒数 |
| `UUUTIL_HOOK_ON_TIMEOUT` | `allow` | 超时行为：`allow` 放行 / `deny` 拦截 |

## 日志

所有决策追加到 `~/.claude/logs/uuutil-hook.jsonl`。

## 已知边角

- Claude Code 会把 hook stderr 前缀为 `PreToolUse:<Tool> hook error: [<path>]:`，
  因此 deny reason 建议写成完整、模型能直接读懂的一句话。
- `permission_mode` 为 `bypassPermissions`（`--dangerously-skip-permissions`）时 hook 仍会触发；
  这是这套人工审核关的意义所在。

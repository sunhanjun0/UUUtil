#!/bin/bash
#
# UUUtil Claude Code PreToolUse hook
#
# 只拦截 Bash 工具中命中危险模式的命令，交由 UUUtil 提醒中心人工确认。
# 面板未开 / uuutil 未装 / 其他不可预期错误 → 一律放行，不影响 Claude 正常工作。

set -o pipefail

LOG=~/.claude/logs/uuutil-hook.jsonl
mkdir -p "$(dirname "$LOG")"

PAYLOAD=$(cat)
export PAYLOAD

read_field() {
  KEY="$1" python3 -c "
import json, os
d = json.loads(os.environ['PAYLOAD'])
cur = d
for k in os.environ['KEY'].split('.'):
    if isinstance(cur, dict) and k in cur:
        cur = cur[k]
    else:
        cur = ''
        break
print(cur if isinstance(cur, str) else json.dumps(cur, ensure_ascii=False))
"
}

TOOL_NAME=$(read_field tool_name)
SESSION_ID=$(read_field session_id)
CWD=$(read_field cwd)

log_event() {
  DECISION="$1" DETAIL="$2" TOOL="$TOOL_NAME" SESSION="$SESSION_ID" CWDVAL="$CWD" python3 - <<'PY' >> "$LOG" 2>/dev/null
import json, os, time
entry = {
  "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
  "decision": os.environ.get("DECISION", ""),
  "detail": os.environ.get("DETAIL", ""),
  "tool_name": os.environ.get("TOOL", ""),
  "session_id": os.environ.get("SESSION", ""),
  "cwd": os.environ.get("CWDVAL", ""),
}
print(json.dumps(entry, ensure_ascii=False))
PY
}

# 仅对 Bash 生效
if [[ "$TOOL_NAME" != "Bash" ]]; then
  log_event allow "not_bash"
  exit 0
fi

CMD=$(read_field tool_input.command)
DESC=$(read_field tool_input.description)

# 危险模式判断（保守版：rm -r/-rf、sudo、dd if=、写块设备）
is_dangerous() {
  local cmd="$1"
  echo "$cmd" | grep -Eq '(^|[^A-Za-z0-9_])rm[[:space:]]+(-[a-zA-Z]*[rRfF][a-zA-Z]*[[:space:]]|-r[[:space:]]|-rf[[:space:]]|-fr[[:space:]]|-f[[:space:]])' && return 0
  echo "$cmd" | grep -Eq '(^|[^A-Za-z0-9_])sudo([[:space:]]|$)' && return 0
  echo "$cmd" | grep -Eq '(^|[^A-Za-z0-9_])dd[[:space:]]+if=' && return 0
  echo "$cmd" | grep -Eq '>[[:space:]]*/dev/(sd[a-z]|disk|zero)' && return 0
  return 1
}

if ! is_dangerous "$CMD"; then
  log_event allow "not_dangerous"
  exit 0
fi

if ! command -v uuutil >/dev/null 2>&1; then
  log_event allow "uuutil_not_installed"
  exit 0
fi

CMD_HASH=$(printf '%s' "$CMD" | shasum -a 256 | cut -c1-12)
KEY="claude:${SESSION_ID:0:8}:bash:${CMD_HASH}"
TIMEOUT=${UUUTIL_HOOK_TIMEOUT_SEC:-180}

ASK_JSON=$(CMD="$CMD" DESC="$DESC" KEY="$KEY" SESSION_ID="$SESSION_ID" CWD="$CWD" TIMEOUT="$TIMEOUT" python3 - <<'PY'
import json, os
payload = {
  "source": "claude",
  "key": os.environ["KEY"],
  "title": "Claude 想执行一条 Bash 命令",
  "body": os.environ["CMD"],
  "severity": "warning",
  "timeoutSec": int(os.environ["TIMEOUT"]),
  "actions": [
    {"id": "approve", "label": "允许", "style": "primary"},
    {"id": "deny", "label": "拒绝", "style": "danger", "requiresReason": True}
  ],
  "metadata": {
    "session_id": os.environ["SESSION_ID"],
    "cwd": os.environ["CWD"],
    "description": os.environ.get("DESC", "")
  }
}
print(json.dumps(payload, ensure_ascii=False))
PY
)

RESP=$(echo "$ASK_JSON" | uuutil call reminder.ask 2>/dev/null)
RC=$?

# transport 错（app 未开）→ 放行
if [[ $RC -ne 0 ]] && echo "$RESP" | grep -q '"code": *"transport"'; then
  log_event allow "uuutil_not_running"
  exit 0
fi

STATUS=$(RESP="$RESP" python3 -c "
import json, os, sys
try:
    d = json.loads(os.environ['RESP'])
    print(d.get('data', {}).get('status', '') if d.get('ok') else '')
except Exception:
    print('')
")

case "$STATUS" in
  responded)
    ACTION=$(RESP="$RESP" python3 -c "import json,os;print(json.loads(os.environ['RESP'])['data']['actionId'])")
    REASON=$(RESP="$RESP" python3 -c "import json,os;print(json.loads(os.environ['RESP'])['data'].get('reason') or '')")
    if [[ "$ACTION" == "approve" ]]; then
      log_event allow "user_approved"
      exit 0
    fi
    log_event deny "user_denied: $REASON"
    echo "用户在 UUUtil 面板拒绝：$REASON" >&2
    exit 2
    ;;
  timeout)
    if [[ "${UUUTIL_HOOK_ON_TIMEOUT:-allow}" == "deny" ]]; then
      log_event deny "timeout"
      echo "UUUtil 提醒超时未响应（按配置拦截）" >&2
      exit 2
    fi
    log_event allow "timeout"
    exit 0
    ;;
  dismissed)
    log_event deny "dismissed"
    echo "用户在 UUUtil 面板忽略了这条确认" >&2
    exit 2
    ;;
  superseded)
    log_event allow "superseded"
    exit 0
    ;;
  *)
    log_event allow "unknown_status:$STATUS"
    exit 0
    ;;
esac

---
name: uuutil-focus
description: Mandatory end-of-turn attention logging for UUUtil Focus through the uuutil MCP tools. Use for every substantive Codex turn involving implementation, debugging, planning, product/design decisions, reviews, handoffs, blockers, validation, MCP/skill/tooling work, or multi-step discussion; near the end of the turn, always consider UUUtil Focus, find or create the relevant focus, and call focus_check_in, focus_create, focus_list, focus_get, or focus_update_metadata unless the turn is trivial or the user explicitly opts out.
---

# UUUtil Focus

Use this skill to help Codex cooperate with the user's UUUtil Focus system. Focus is an attention observation dashboard, not a task manager. Preserve the user's real attention trail across conversations without asking the user to manually maintain focus records.

## Why This Exists

UUUtil Focus exists because meaningful work often happens inside assistant conversations and tool runs, but that attention disappears unless the assistant records it. The system should let the user later see what they have actually been paying attention to, what is drifting, and what needs another look.

Treat a focus as a living attention object: a project, product direction, bug class, investigation thread, architectural concern, recurring risk, or personal operating theme. The signal is not whether a task is complete. The signal is attention over time: progress, silence, avoidance, blockers, decisions, next actions, and repeated returns to the same topic.

Use Focus to answer questions like:

- What topics received real attention recently?
- Which important topics are becoming neglected or drifting?
- Which low-weight topics are receiving repeated attention and may deserve more weight?
- What blocker, decision, or next action emerged from a conversation?
- Which assistant conversations belong to the same sustained thread of work?

Do not use Focus as a TODO app. Do not create one focus per tiny task. Do not mark focus objects complete, delete them, reset weights, or manually maintain status.

## Agent Responsibility

Act as an attention scribe at natural work boundaries. Do the user's requested work first. Near the end of every substantive turn, run a Focus checkpoint: decide which existing focus this turn belongs to, create one only if needed, and record a check-in through MCP. Treat this as default end-of-turn hygiene, not an optional extra.

Prefer quiet, automatic maintenance. Do not ask the user for permission before routine check-ins unless the user explicitly forbids recording or the content is unusually sensitive. Mention the recorded focus only when useful; do not let focus bookkeeping dominate the final answer. If the turn required several back-and-forth UI/code refinements, still record one compact check-in summarizing the iteration.

Use this end-of-turn decision loop every time:

1. Ask: did this turn contain substantive work? If yes, continue. If it was only a greeting, casual chat, or a simple one-off answer, skip Focus.
2. Decide whether the work matches an existing focus or needs a new one. Prefer matching existing focus objects over creating duplicates.
3. Execute `focus_check_in` for the chosen focus. If no suitable focus exists, call `focus_create` first, then `focus_check_in`.


Record a check-in when the turn includes any of these:

- Meaningful implementation, refactor, debugging, review, or validation progress.
- Product, UX, architecture, workflow, or integration decisions.
- A blocker, uncertainty, dependency, unresolved risk, or failed attempt.
- A handoff, plan, next action, or state summary that future agents should notice.
- Repeated discussion of the same topic across turns.
- Tooling, MCP, skill, plugin, or automation work that changes how future work happens.

Skip recording for greetings, acknowledgements, trivial factual answers, purely mechanical commands, throwaway exploration, or turns that do not create durable context.

Default rule: if the assistant edited files, ran validation, changed configuration, investigated a bug, made a design decision, or spent multiple messages refining behavior, record a check-in before the final response. Only skip when the turn is clearly trivial.

## Core Workflow

Use this workflow near the end of every substantive turn, before the final response:

1. Identify the attention object: choose the stable topic the user would recognize later.
2. Search existing focuses with `focus_list`; reuse an existing focus when the work is clearly part of the same topic.
3. Create a focus with `focus_create` only when no existing focus fits.
4. Add a check-in with `focus_check_in` summarizing what happened, the blocker if any, and a concrete next action if known.
5. Use `focus_update_metadata` only to correct the focus name, description, tags, expected exit, or attention mode when the existing metadata is misleading.
6. Continue the user-facing response; do not block the main task on cosmetic metadata cleanup.

## How To Choose Or Create A Focus

Reuse an existing focus when the current work shares the same long-lived concern, even if the immediate task differs. For example, MCP logging, Codex MCP configuration, and tool smoke tests can all belong to one focus if they serve the same UUUtil assistant-integration effort.

Create a new focus when the topic has a different owner, product area, risk, or long-term purpose. Use names that are short and recognizable, such as `UUUtil Focus MCP integration`, `Focus attention redesign`, or `Electron app startup stability`.

When creating a focus, choose metadata this way:

- `name`: Use a stable noun phrase, not a one-off action.
- `description`: Explain why the topic deserves attention and what kind of work belongs there.
- `attentionMode`: Use `deep` for primary strategic work, `pulse` for recurring active work, `scan` for periodic monitoring, and `dormant` for low-activity watch items.
- `expectedExit`: Describe the condition where attention can naturally fade; treat it as display-only, not a status.
- `tags`: Use compact JSON-style categories such as `codex`, `mcp`, `uuutil`, `focus`, `debugging`, `design`, or `release`.

Avoid creating duplicate focuses because a name is slightly different. Prefer updating metadata when a better name or description becomes obvious.

## How To Write Check-Ins

Make check-ins useful to a future agent scanning the Focus dashboard. Keep them factual, compact, and tied to observable progress.

Use `energy` this way:

- `engaged`: Progress is active, clear, or gaining momentum.
- `neutral`: The turn records maintenance, routine progress, or uncertain-but-not-stuck work.
- `avoiding`: The conversation reveals deferral, friction, unclear ownership, repeated failure, or reluctance.

Use fields this way:

- `notes`: Summarize what changed, what was learned, or what decision was made.
- `blocker`: Record only a real impediment, ambiguity, missing dependency, failing validation, or external wait.
- `nextAction`: Record the next useful action if one is known; omit it when there is no meaningful next action.

Write check-ins in the same language as the user's work context unless there is a clear reason to do otherwise. For this user's UUUtil work, Chinese check-ins are usually appropriate.

Good check-in style:

- `notes`: `补充 uuutil-focus skill，使其说明记录目的、触发标准、MCP 调用流程和 Agent 协作方式。`
- `blocker`: `无。`
- `nextAction`: `如需要，可把该 skill 接入更多自动触发场景并验证 Codex 是否按回合末尾调用 MCP。`

Bad check-in style:

- `notes`: `Did stuff.`
- `nextAction`: `继续。`
- Creating a separate focus named `Update SKILL.md` for a one-time edit.

## MCP Tool Expectations

Prefer the configured `uuutil` MCP server over direct database access. The recommended transport is the UUUtil app's local Streamable HTTP MCP service at `http://127.0.0.1:17878/mcp`; stdio entries should proxy to that service instead of starting independent DB writers. The exact UI surface may expose tools with names like `focus_list`, `focus_create`, `focus_check_in`, `focus_get`, `focus_stats`, `focus_alerts`, and `focus_update_metadata`.

Before recording, assume the UUUtil desktop app should be running so the HTTP MCP service owns the single database connection. If the MCP server is unavailable, do not fall back to editing SQLite files directly; report the failure briefly and leave retry context.

Minimum useful sequence:

1. Call `focus_list` to find a matching focus.
2. Call `focus_create` if no matching focus exists.
3. Call `focus_check_in` for the chosen focus.

Use read tools when they help choose correctly:

- `focus_get`: Inspect one candidate focus before adding a check-in.
- `focus_stats`: Understand current distribution or verify records after many writes.
- `focus_alerts`: Notice neglected or drifting work before planning a follow-up.

Do not rely on the renderer UI to create check-ins. The UI is intentionally read-only for focus observation. Assistant/MCP/tool integrations are the primary writers. Do not run multiple direct-DB MCP servers for the same UUUtil database; use the app-hosted HTTP MCP service as the shared coordination point.

## Collaboration Rules

Cooperate with other agents and external systems by treating Focus as shared state:

- Prefer appending check-ins over rewriting history.
- Do not delete, reset, or bulk-clear data from a skill workflow.
- Do not fabricate progress; record only what happened in the conversation or tool results.
- Preserve uncertainty by writing it as uncertainty, not as a decision.
- Keep sensitive details out of check-ins when a high-level summary is sufficient.
- If another system already created the focus, reuse it instead of creating a competing one.

If MCP calls fail, do not fail the user's main task. State briefly that Focus recording could not be completed if it matters, and include enough context in the final answer for a later agent to retry.

## Final Response Behavior

Keep the final response focused on the user's requested work. If a Focus check-in was recorded, mention it only as a short note when helpful, such as: `已顺手记录到 UUUtil Focus。`

Do not expose raw MCP payloads unless the user asks. Do not make Focus recording sound like a separate task the user must maintain.

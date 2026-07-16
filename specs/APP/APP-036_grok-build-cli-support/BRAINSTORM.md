# Brainstorm · APP-036: Grok Build CLI Support

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

xAI **Grok Build** ships a local CLI with dual entrypoints that collide with Cursor’s historical short name:

| Entry | Typical resolve | Product |
|-------|-----------------|---------|
| `grok` | `~/.grok/bin/grok` → Grok binary | Grok Build |
| `agent` (Grok alias) | same Grok binary | Grok Build |
| `cursor-agent` | Cursor install path | Cursor Agent |
| historical bare `agent` | PATH-dependent | **contested** |

Atmos today encodes Cursor as:

```json
{ "id": "cursor", "label": "Cursor Agent", "cmd": "agent", ... }
```

### How titles work today

1. Shell shim emits OSC with the raw shell command (`CMD_START:<command>`) and CWD on idle.
2. `resolveAgentForTitle` / `getTerminalDisplayMeta` (`packages/shared/src/terminal/title.ts`) maps the dynamic title onto configured agents by matching the **first command token** against each agent’s `cmd`.
3. First match wins. Cursor’s `cmd: "agent"` owns bare `agent` (and even `cursor-agent` via substring `includes("agent")`).
4. Pane-level `agent` (from Agent Select) is only a fallback for runtime-wrapper / version-like titles — not when the OSC title itself looks like an agent command.

So bare `agent` **behaves** as “always Cursor”, even though it is not a hard-coded map. On machines where Grok owns `PATH`’s `agent`, launching “Cursor Agent” with `cmd: "agent"` may also start the **wrong binary**.

## Decisions (locked)

| # | Decision | Status |
|---|----------|--------|
| 1 | **Full surface support** for Grok Build (Agent Select + run config / model list + automation headless + agent hooks status) | locked |
| 2 | Atmos built-in Cursor launch command → **`cursor-agent`** | locked |
| 3 | Freehand bare `agent` identity follows **real CLI on PATH**, never hard-code Cursor/Grok | locked |
| 4 | Display label → **`Grok Build`** | locked |
| 5 | Stable built-in id → **`grok-build`** | locked |
| 6 | Automation headless uses **`--output-format streaming-json`** + **new `grok_streaming_json` parser** (do **not** reuse Cursor/Claude parsers) | locked |
| 7 | M1 includes **agent hooks status** for Grok Build (install/check/uninstall + state notifications) | locked |

## Goals (draft)

- Ship `grok-build` as a first-class terminal agent: interactive launch, run config, automations, hooks status.
- Make Cursor’s built-in launch unambiguous via `cursor-agent`.
- Make contested short-name `agent` resolve from **actual binary identity** for freehand use.
- Stream automation output (including thought) via a Grok-native NDJSON parser.
- Surface Grok session lifecycle as Atmos `idle` / `running` / `permission_request` like other agents.

## CLI capability matrix (live probe)

Probed against local install: **grok 0.2.101** (`grok version`, `grok version --json`). Docs: `~/.grok/docs/user-guide/`.

### Interactive (Agent Select / terminal TUI)

| Need | Grok support | Notes |
|------|--------------|-------|
| Unique launch cmd | **Yes** — `grok` | Canonical built-in `cmd`. |
| Alias binary | **Yes** — `agent` → same binary as `grok` | Contested with historical Cursor short name. |
| Auto-approve tools | **Yes** — `--always-approve` | Also `--permission-mode`. |
| Model select | **Yes** — `-m` / `--model <MODEL>` | |
| Reasoning effort | **Yes** — `--reasoning-effort` / `--effort` | |
| Initial prompt | **Yes** — positional `[PROMPT]` | |

**Draft interactive built-in:**

- `id`: `grok-build`
- `label`: `Grok Build`
- `cmd`: `grok`
- `interactiveParams`: `--always-approve` (or safer default — remaining PRD fork)
- `modelSupport`: `catalog`
- `reasoningSupport`: manual / enum on `--reasoning-effort`

### Model catalog

| Need | Support | Notes |
|------|---------|-------|
| List models | **Yes** — `grok models` | Human text; dedicated `grok_line_list` parser drops login/default preamble and strips `(default)`. |

```json
{
  "supported": true,
  "command": ["grok", "models"],
  "parser": "grok_line_list"
}
```

### Headless / automation (locked: streaming-json)

| Need | Support | Notes |
|------|---------|-------|
| Single-turn headless | **Yes** — `-p` / `--single <PROMPT>` | Live probe succeeded. |
| Streaming NDJSON | **Yes** — `--output-format streaming-json` | Sample below. |
| Auto-approve | **Yes** — `--always-approve` | Needed for unattended runs. |

**Live `streaming-json` sample:**

```text
{"type":"thought","data":"The"}
{"type":"thought","data":" user"}
{"type":"text","data":"ok"}
{"type":"end","stopReason":"EndTurn","sessionId":"…","usage":{…}}
```

Also verified:

- `plain` → raw assistant text only
- `json` → single final object with `text` / `thought` / `usage` (not stream)

**Locked draft headless built-in:**

```json
{
  "params": "--always-approve --output-format streaming-json -p",
  "promptStrategy": "prompt_flag",
  "stdoutParser": "grok_streaming_json"
}
```

**Parser requirements (`grok_streaming_json`)** — new enum variant in automation output rendering:

| Event `type` | Atmos handling |
|--------------|----------------|
| `thought` | Stream as thinking / reasoning channel if product surfaces it; otherwise buffer or drop per existing automation UX for other agents |
| `text` | Accumulate / emit assistant text deltas (`data` field) |
| `end` | Finalize turn; capture `stopReason`, optional usage metadata |
| unknown types | Fail-open: ignore with debug log |

Must **not** route through `cursor_stream_json` / Claude-like event shapes.

### Cursor changes (locked)

| Field | Today | Target |
|-------|-------|--------|
| `cmd` | `agent` | **`cursor-agent`** |
| `modelList.command` | `["agent", "--list-models"]` | `["cursor-agent", "--list-models"]` (or `models` subcommand) |

### Contested freehand `agent` → real CLI identity (locked)

Unique tokens win without probing: `grok` → Grok Build, `cursor-agent` → Cursor Agent.

For exact first token `agent`:

1. Resolve the same binary the shell would run (prefer tmux shell PATH if it differs from API process).
2. Classify via realpath fingerprints and/or `--version` / `--help` banners.
3. If unknown → show raw `agent`, never a wrong brand.

Probe signals observed:

| Signal | Grok | Cursor |
|--------|------|--------|
| Realpath | `/.grok/` | `cursor-agent/versions/` |
| `--version` | `grok 0.2.101…` | date-hash version |
| `--help` | `Grok Build TUI` | `Start the Cursor Agent` |

Also fix match algorithm: exact token + longer-first; kill dangerous `includes("agent")`.

---

## Agent hooks status (research + draft mapping)

### Does Grok Build support hooks?

**Yes — first-class.** Official guide: `~/.grok/docs/user-guide/10-hooks.md`.

Hooks can:

- Run a **command** (script / shell) or **HTTP POST** on lifecycle events
- Optionally **block** tool calls on `PreToolUse` (`{"decision":"allow|deny"}`)
- Be managed in TUI via `/hooks` (list / enable / trust project)

### Discovery locations

| Scope | Path | Trust |
|-------|------|-------|
| Global (native) | `~/.grok/hooks/*.json` | Always trusted |
| Project | `<repo>/.grok/hooks/*.json` | Requires folder trust |
| Plugin | plugin-bundled `hooks/hooks.json` | Per-plugin trust |
| Compat Claude | `~/.claude/settings.json` (+ local) | Always global / project trust |
| Compat Cursor | `~/.cursor/hooks.json` | Always global / project trust |

Compat scanning defaults **on** (`[compat.claude] hooks = true`, `[compat.cursor] hooks = true` in `~/.grok/config.toml`).

**Atmos install target (recommended):** dedicated global file under native path, e.g. `~/.grok/hooks/atmos-status.json` (or merge into a single atmos-managed file), using Claude-like nested JSON shape Grok already documents. Marker `ATMOS_MANAGED` for idempotent install/uninstall, matching other agents.

Do **not** rely only on Claude/Cursor compat hooks for Grok identity — those would POST to `/hooks/claude-code` or `/hooks/cursor` and mis-label the tool.

### Documented lifecycle events

| Grok event | When | Blocking? |
|------------|------|-----------|
| `SessionStart` | Session starts | No |
| `UserPromptSubmit` | User submits a prompt | No |
| `PreToolUse` | Tool about to run | **Yes** — can deny |
| `PostToolUse` | Tool succeeds | No |
| `PostToolUseFailure` | Tool fails | No |
| `PermissionDenied` | Permission system denies a tool | No |
| `Stop` | Agent turn ends (complete / cancel / error) | No |
| `StopFailure` | Turn ends due to API error | No |
| `Notification` | Agent sends a notification | No (matcher on notification type) |
| `SubagentStart` / `SubagentStop` (`SubagentEnd` alias) | Subagent lifecycle | No |
| `PreCompact` / `PostCompact` | Context compaction | No |
| `SessionEnd` | Session ends | No |

Cursor camelCase aliases are accepted (`sessionStart` → `SessionStart`, etc.).

**No dedicated `PermissionRequest` lifecycle event** (confirmed in open source `HookEventName`). Waiting-for-user is delivered as `Notification` with specific `notificationType` strings (below).

### Payload / wire shape (source: `xai-org/grok-build`)

Envelope (`HookEventEnvelope`, camelCase JSON on stdin):

| Field | Notes |
|-------|-------|
| `hookEventName` | Wire: **snake_case** (`notification`, `pre_tool_use`, …) via `#[serde(rename_all = "snake_case")]` on `HookEventName` |
| `sessionId` | Session id |
| `cwd` / `workspaceRoot` | Paths |
| `timestamp` | ISO string |
| optional | `transcriptPath`, `clientIdentifier`, `promptId` |
| + flattened payload | event-specific fields |

`Notification` payload variant (`HookPayload::Notification`):

```json
{
  "hookEventName": "notification",
  "sessionId": "…",
  "cwd": "…",
  "workspaceRoot": "…",
  "timestamp": "…",
  "notificationType": "permission_prompt",
  "message": "Tool permission requested",
  "title": null,
  "level": "info"
}
```

Env always injected: `GROK_HOOK_EVENT`, `GROK_HOOK_NAME`, `GROK_SESSION_ID`, `GROK_WORKSPACE_ROOT`, `CLAUDE_PROJECT_DIR`.

Atmos session resolution already prefers `X-Atmos-Pane`; payload fallbacks should accept `sessionId` / `session_id` / `GROK_SESSION_ID`.

### `notificationType` values — **confirmed from open source**

Source of truth: [xai-org/grok-build](https://github.com/xai-org/grok-build) (Apache-2.0, opened 2026-07-16).

These are the **lifecycle `Notification` hook** types Grok actually dispatches via `dispatch_notification_hook` / extension sinks. They are **not** the same vocabulary as UI `[ui.notifications] events`.

| `notificationType` | When it fires | Source paths |
|--------------------|---------------|--------------|
| **`permission_prompt`** | Tool permission requested (skipped in always-approve / yolo); plan approval (`exit_plan_mode`); diff review requested | `tool_calls.rs`, `hook_dispatch.rs` (`DiffReview`) |
| **`elicitation_dialog`** | Ask-user / user-question reverse request | `spawn.rs` |
| **`agent_error`** | Auto-recovery exhausted; retry exhausted / failed | `hook_dispatch.rs` (`AutoRecoveryExhausted`, `RetryState::{Exhausted,Failed}`) |
| **`task_complete`** | Background bash / monitor task completed | `notification_bridge.rs` |
| **`idle_prompt`** | Session stayed idle ~60s after a **completed** turn (message `"Turn complete"`) | `extensions/idle_prompt.rs` |

**Do not confuse with UI notification config** (`[ui.notifications] events` in `05-configuration.md` / pager):

| UI event id | Role |
|-------------|------|
| `turn_complete` | Terminal OS notification only |
| `approval_required` | Terminal OS notification only |
| `session_ready` | Terminal OS notification only |
| `task_complete` | Overlaps name with hook type; UI config, not the hook rail |
| `agent_error` | Overlaps name with hook type; UI config |

Atmos hooks must match **`notificationType` on the lifecycle hook**, especially **`permission_prompt`** (not `approval_required`).

Matcher on `Notification` hooks tests **notification type** (docs + `dispatcher.rs` matcher extraction).

### Atmos states today

`AgentHookState` is only three values:

- `Idle`
- `Running`
- `PermissionRequest`

`AgentToolType` needs a new variant, e.g. `GrokBuild` (`grok-build`), plus:

- engine install/check/uninstall module (`crates/core-engine/src/agent_hooks/grok_build.rs` or `grok.rs`)
- service handler (`crates/core-service/src/service/agent_hooks/…`)
- API route `POST /hooks/grok-build` (kebab like other tools)
- install report field + settings UI status row
- notification display name “Grok Build”

### Proposed event → Atmos state mapping (**locked enough for PRD**)

Primary mapping for **status notification** (not policy-blocking):

| Grok hook event | Atmos state | Rationale |
|-----------------|-------------|-----------|
| `SessionStart` | **Idle** | Session open, no active turn. |
| `UserPromptSubmit` | **Running** | User kicked off work. |
| `PreToolUse` | **Running** | Mid-turn tool activity. |
| `PostToolUse` | **Running** | Still mid-turn after a tool. |
| `PostToolUseFailure` | **Running** | Failure of one tool ≠ turn idle. |
| `Notification` + `notificationType == "permission_prompt"` | **PermissionRequest** | Tool / plan / diff approval waiting (Claude equivalent). |
| `Notification` + `notificationType == "elicitation_dialog"` | **PermissionRequest** | Waiting on user question (same “blocked on human” UX). |
| `Notification` + `agent_error` / `task_complete` / `idle_prompt` | **ignore** (no change) | Not “running agent turn”; `idle_prompt` is post-idle ping (message even says turn complete). |
| `PermissionDenied` | **ignore** | Already denied; not waiting on user. |
| `Stop` | **Idle** | Turn finished. |
| `StopFailure` | **Idle** | Turn finished via API error. |
| `SessionEnd` | **Idle** | Session closed. |
| `SubagentStart` / `SubagentStop` | **ignore** | Parent owns status. |
| `PreCompact` / `PostCompact` | **ignore** | Internal maintenance. |

Optional matcher install for Notification: `permission_prompt|elicitation_dialog` if we want fewer hook invocations; service still filters.

#### State machine sketch

```text
        SessionStart
             │
             ▼
           Idle ◄──────────────────────────────┐
             │                                 │
   UserPromptSubmit / PreToolUse /             │
   PostToolUse / PostToolUseFailure            │ Stop / StopFailure / SessionEnd
             │                                 │
             ▼                                 │
          Running ─────────────────────────────┤
             │                                 │
   Notification(permission_prompt              │
     | elicitation_dialog)                     │
             │                                 │
             ▼                                 │
    PermissionRequest ──(user resumes tools)───┘
             │              PreToolUse / UserPromptSubmit → Running
             └──────────────────────────────────────────► Idle via Stop*
```

When always-approve / yolo is on, `permission_prompt` is **not** dispatched for tool permissions (source: `tool_calls.rs` guards on `!is_yolo_mode()`). Status still works via Running ↔ Idle. Plan approval / elicitation may still fire depending on path.

### Install shape (draft, Claude-like)

Grok hook JSON uses nested `hooks` arrays (same family as Claude settings). Example third-party: `~/.grok/hooks/orca-status.json`.

Atmos should install **command** hooks that:

1. Gate on `[ "$ATMOS_MANAGED" = "1" ]`
2. `curl` POST JSON to `http://localhost:{port}/hooks/grok-build` with Atmos context headers + hook version
3. Forward **stdin envelope** so service can read `hookEventName` + `notificationType` (camelCase)
4. Stay fail-open (`|| true`)

Subscribe at minimum:

- `SessionStart`, `UserPromptSubmit`
- `PreToolUse`, `PostToolUse`, `PostToolUseFailure`
- `Notification` (all types, filter in service; or matcher `permission_prompt|elicitation_dialog`)
- `Stop`, `StopFailure`, `SessionEnd`

Status-only: do **not** install blocking PreToolUse denials.

### Compat / double-fire risk

If Grok also loads Atmos hooks from `~/.claude/settings.json` or `~/.cursor/hooks.json`, the **same session** may POST to Claude/Cursor endpoints while running Grok. Mitigation options (decide in TECH):

1. Rely on pane ownership + idle takeover rules already in handlers.
2. Ensure Grok-native Atmos hooks are the only intended path; document that Claude compat hooks may dual-fire if user has both installed.
3. Optionally detect Grok via payload env / `GROK_SESSION_ID` and ignore on Claude handler — fragile; prefer dedicated native hooks + ATMOS_MANAGED.

### PermissionRequest — resolved

| Agent | Permission waiting signal |
|-------|---------------------------|
| Claude Code | `PermissionRequest` event + `Notification(permission_prompt)` |
| Cursor | no dedicated permission state in Atmos handler today (only Running/Idle) |
| Grok Build | **no** `PermissionRequest` event; use **`Notification.notificationType = "permission_prompt"`** (+ **`elicitation_dialog`** for ask-user) |

Open-source confirmation closes the previous “capture a fixture first” gap for type strings. Live E2E still recommended at implement time, but types are no longer unknown.

---

## Options (narrowed)

### Option A — Minimal built-in without hooks (rejected)

Conflicts with locked decision #7.

### Option B — Full M1: unique cmds + identity probe + streaming parser + hooks status (recommended)

- Built-ins + Cursor `cursor-agent`
- `grok_streaming_json` automation parser
- Native `~/.grok/hooks` Atmos installer + `/hooks/grok-build` + state mapping table above
- Freehand `agent` real-CLI probe

**Pros:** Matches product intent; reuses Atmos hooks architecture.  
**Cons:** More surface area; Notification→PermissionRequest needs payload validation.

### Option C — Hooks Running/Idle only in M1; PermissionRequest in M1.1

If Notification types prove unstable.

**Fallback** only if validation fails.

## Key forks remaining

- **Interactive default flags**: `--always-approve` vs safer permission mode (PRD).
- **Thought streaming UX**: show thought channel in automation UI vs text-only consume (PRD/TECH).
- **Identity probe placement** and shell PATH fidelity (TECH).
- **Hooks file name / merge strategy** under `~/.grok/hooks/` (TECH).
- **Icon** — N1 Phase 1 assets. **AI usage / quota** — promoted into PRD M11 (cli-chat-proxy billing + `~/.grok/auth.json`).

## Open questions

- [x] Label / id / Cursor cmd / freehand policy / streaming parser / hooks in scope
- [x] `Notification.notificationType` strings (from `xai-org/grok-build` source)
- [ ] Confirm interactive default approval flags
- [ ] Model id normalization from `grok models` (`(default)` suffix)
- [ ] Whether `StopFailure` should trigger a different notification UX than `Stop` (Atmos only has Idle)
- [ ] Icon asset for Grok Build in M1

## Worked scenarios

| User action | Desired outcome |
|-------------|-----------------|
| Agent Select → Cursor | `cursor-agent …`, Cursor Agent title |
| Agent Select → Grok Build | `grok …`, Grok Build title |
| Freehand `agent` → Grok binary | Grok Build |
| Freehand `agent` → Cursor binary | Cursor Agent |
| Freehand `agent` unknown | raw `agent` |
| Automation run Grok | streaming-json parsed via `grok_streaming_json` |
| Grok turn starts / tools run | hooks → **Running** |
| Grok waits for approval | hooks Notification → **PermissionRequest** (if type known) |
| Grok turn ends | hooks Stop → **Idle** |

## References

- Built-ins: `resources/terminal-agents/builtin_agents.json`
- Title: `packages/shared/src/terminal/title.ts`
- Automation parsers: `crates/core-service/src/service/automation/output_rendering.rs`, `agents.rs`
- Hooks engine: `crates/core-engine/src/agent_hooks/*`
- Hooks service: `crates/core-service/src/service/agent_hooks/*`
- API routes: `apps/api/src/api/hooks/mod.rs`
- Precedent: `specs/APP/APP-032_antigravity-cli-support/`
- Grok docs: `~/.grok/docs/user-guide/10-hooks.md`, `05-configuration.md` (compat + notifications), `14-headless-mode.md`
- Open source: [xai-org/grok-build](https://github.com/xai-org/grok-build) — especially `crates/codegen/xai-grok-hooks/src/event.rs`, `…/shell/.../hook_dispatch.rs`, `tool_calls.rs`, `spawn.rs`, `notification_bridge.rs`, `extensions/idle_prompt.rs`
- Live CLI: grok 0.2.101; third-party example install at `~/.grok/hooks/orca-status.json`

## Ready to promote

- Promote to PRD:
  - Must-haves: `grok-build` agent, Cursor→`cursor-agent`, freehand identity, streaming automation parser, hooks status install + three-state mapping.
  - PermissionRequest maps from `Notification.notificationType` ∈ {`permission_prompt`, `elicitation_dialog`} (source-confirmed).
  - Out of scope: blocking security hooks, ACP agent mode (AI usage quota in M11).
- Promote to TECH:
  - Exact `builtin_agents.json` entries.
  - `StdoutParser::GrokStreamingJson` event table + tests from live samples.
  - Hooks install JSON, route, `AgentToolType::GrokBuild`, state match arms, session id field normalization.
  - Contested `agent` probe API + title matcher rewrite.
  - Compat double-fire mitigation.

# TECH · APP-036: Grok Build CLI Support

> Technical Design · HOW. Implements PRD APP-036 (M1–M10). Also ships N1 brand icons (assets provided at `/Users/lurunrun/Downloads/Grok_light_dark`).

## Scope summary

Add **Grok Build** as a first-class terminal agent end-to-end: built-in manifest, Cursor command migration to `cursor-agent`, title/identity resolution (including contested bare `agent`), automation `streaming-json` parser, native Grok hooks status, and UI/settings parity including icons.

**Addresses:** M1–M10, N1 (icons in Phase 1).  
**Deferred:** N2 richer thought UX beyond existing `[thinking]` channel; N3 auto-install hooks beyond existing global sync; N4 pane-pin priority (optional small follow-up if M7 is insufficient).  
**Out of scope:** AI usage/quota, ACP agent mode, blocking hooks.

## Architecture overview

```
                    ┌─────────────────────────────────────┐
  Grok CLI hooks    │  POST /hooks/grok-build (REST)      │
  ~/.grok/hooks/    │  apps/api                           │
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────┐
                    │  AgentHooksService                  │
                    │  crates/core-service                │
                    │  state: idle|running|permission_*   │
                    └──────────────┬──────────────────────┘
                                   │ broadcast AgentHookEvent
                                   ▼
                    ┌─────────────────────────────────────┐
                    │  WS AgentHookStateChanged           │
                    │  apps/web agent-hooks-store         │
                    └─────────────────────────────────────┘

  Agent Select / Automations
       │
       ▼
  resources/terminal-agents/builtin_agents.json
       │
       ├─► web run-config / CenterStage launch (interactive)
       └─► automation agents.rs resolve + OutputRenderer
              (StdoutParser::GrokStreamingJson)

  Terminal OSC title
       │
       ▼
  packages/shared terminal/title.ts
       │  unique cmds: exact match
       │  contested "agent": identity map from API probe
       ▼
  toolbar label/icon (AgentIcon + pane agent)
```

**External binaries:** `grok` / `cursor-agent` (user-installed).  
**Open source reference:** [xai-org/grok-build](https://github.com/xai-org/grok-build) for hook envelope + `notificationType` strings.

## PRD → design map

| PRD | Design |
|-----|--------|
| M1 built-in | `builtin_agents.json` + consumers already load it |
| M2 interactive | `interactiveParams: "--always-approve"` |
| M3 models | `modelList.command: ["grok","models"]`, `line_list` + normalize `(default)` |
| M4 reasoning | `reasoningSupport.mode: "manual", arg: "--reasoning-effort"` |
| M5 Cursor cmd | `cursor.cmd` + `modelList` → `cursor-agent` |
| M6 titles unique | exact first-token match; drop substring `includes` |
| M7 contested `agent` | backend identity probe + client title map |
| M8 automation stream | new `StdoutParser::GrokStreamingJson` |
| M9 hooks | engine install + service handler + API route |
| M10 UI | store/labels/settings cards + icons |
| N1 icons | `apps/web/public/agents/grok-build.svg` (+ mobile asset) from Downloads |

---

## Module-by-module design

### 1. Shared manifest — `resources/terminal-agents/builtin_agents.json`

**Add** after a stable neighbor (e.g. near `cursor` / end of list):

```json
{
  "id": "grok-build",
  "label": "Grok Build",
  "cmd": "grok",
  "params": "--always-approve --output-format streaming-json -p",
  "interactiveParams": "--always-approve",
  "promptStrategy": "prompt_flag",
  "stdoutParser": "grok_streaming_json",
  "modelSupport": "catalog",
  "reasoningSupport": {
    "mode": "manual",
    "arg": "--reasoning-effort",
    "placeholder": "e.g. high"
  },
  "modelList": {
    "supported": true,
    "command": ["grok", "models"],
    "parser": "line_list"
  }
}
```

**Modify Cursor entry:**

| Field | From | To |
|-------|------|-----|
| `cmd` | `agent` | `cursor-agent` |
| `modelList.command` | `["agent","--list-models"]` | `["cursor-agent","--list-models"]` |

Do **not** migrate user `~/.atmos/agent/terminal_code_agent.json` overrides.

**Consumers (already path-coupled — verify after edit):**

- `apps/web/src/features/agent/lib/terminal-agent-definitions.ts`
- `crates/core-service/src/service/automation/agents.rs` (JSON load + `stdoutParser` deserialize)

**Stdout parser string:** `grok_streaming_json` must map to new Rust enum variant (below). Extend TS definition types only if they validate parser names strictly (today mostly passthrough).

### 2. Automation — `crates/core-service`

#### 2.1 `StdoutParser` — `service/automation/agents.rs`

```rust
pub enum StdoutParser {
    Plain,
    ClaudeStreamJson,
    CodexJsonl,
    CursorStreamJson,
    OpencodeJson,
    GrokStreamingJson, // NEW — serde: "grok_streaming_json"
}
```

Wire `model_flag_for_agent`: add `"grok-build" => Some("--model")`.

Automation executable discovery checks `~/.grok/bin` in addition to process PATH and existing supported user bin directories, so non-login API/Desktop processes can find the official default install.

#### 2.2 Parser — `service/automation/output_rendering.rs`

```text
Grok NDJSON (verified):
  {"type":"thought","data":"..."}
  {"type":"text","data":"..."}
  {"type":"end","stopReason":"EndTurn", ...}
```

`parse_grok_streaming_json(value)`:

| `type` | Behavior |
|--------|----------|
| `text` | `final_stdout(data)` — assistant text, write_to_final |
| `thought` | `event_stdout(format!("[thinking] {data}"))` — same pattern as Claude thinking_delta (non-final) |
| `end` | optional `event_stdout` with stopReason; no more text |
| other / parse fail | ignore line (debug log) or pass-through non-JSON as non-final |

Unit tests: fixtures from live probe samples (plain multi-delta thought + text + end).

Structured JSONL parsers buffer raw bytes until a complete newline-delimited record before UTF-8 decoding; arbitrary process read boundaries must not corrupt multibyte text.

#### 2.3 Model catalog normalization — `parse_grok_model_catalog`

<!-- updated 2026-07-16: live Grok output includes login/default status lines -->
Begin after `Available models:` and accept only bullet rows. Strip trailing ` (default)` (case-insensitive) from model id/label and set `is_default: true`.

#### 2.4 Hooks service — `service/agent_hooks.rs` + new module

- `AgentToolType::GrokBuild` → Display `"grok-build"`, notification name `"Grok Build"`.
- `mod grok_build;` + `handle_grok_build_event`.
- `extract_session_id`: also accept `sessionId` (camelCase).
- `extract_cwd`: also accept `workspaceRoot` / `workspace_root`.

**Event normalization** (accept both wire forms):

```rust
fn hook_event_name(payload: &Value) -> &str {
  // prefer hook_event_name, then hookEventName
  // if value is snake_case from Grok wire ("notification"), map to PascalCase arms
}
```

**State mapping** (PRD M9):

| Normalized event | State |
|------------------|--------|
| `SessionStart` / `session_start` | Idle |
| `UserPromptSubmit` / `user_prompt_submit` | Running |
| `PreToolUse` / `pre_tool_use` | Running |
| `PostToolUse` / `post_tool_use` | Running |
| `PostToolUseFailure` / `post_tool_use_failure` | Running |
| `Notification` / `notification` | if `notificationType`/`notification_type` ∈ {`permission_prompt`,`elicitation_dialog`} → **PermissionRequest**; else **no-op** |
| `PermissionDenied` / `permission_denied` | no-op |
| `Stop` / `stop` / `StopFailure` / `stop_failure` | Idle |
| `SessionEnd` / `session_end` | Idle |
| Subagent* / *Compact | no-op |

Ownership rule: same as Claude — skip if session actively owned by another tool unless idle.

Tests: table-driven event → state; notification type matrix.

#### 2.5 Contested CLI identity probe — `core-service` + optional `core-engine` helper

**Decision:** probe on the **API host** (same machine as local runtime / tmux). Perfect shell-PATH parity is best-effort; document limitation.

```rust
pub enum ContestedCliOwner {
    GrokBuild,
    Cursor,
    Unknown,
}

pub fn resolve_command_identity(command: &str) -> ContestedCliOwner
// only "agent" required in M1; structure allows future contested names
```

**Algorithm for `agent`:**

<!-- updated 2026-07-16: implementation review found the shell lookup unbounded on an async worker -->
1. Scan the API process `PATH` directly for an executable `agent`; do not start a login shell.
2. `fs::canonicalize` realpath.
3. Classify:
   - path contains `/.grok/` or filename matches `grok*` → `GrokBuild`
   - path contains `cursor-agent` → `Cursor`
   - else run `agent --version` / `agent --help` with short timeout (~800ms):
     - stdout/stderr contains `Grok Build` or starts with `grok ` → `GrokBuild`
     - contains `Start the Cursor Agent` or Cursor version pattern → `Cursor`
   - else `Unknown`
4. Cache in process memory: key = `(command, which_path, mtime)` TTL **60s** success / **15s** unknown.
5. Run the complete resolver in `spawn_blocking`; share one ~800ms deadline across banner fallbacks.
6. Spawn each banner probe in its own process group, drain stdout/stderr concurrently, and terminate inherited descendants before collecting output within the deadline.

### 3. Hook install engine — `crates/core-engine/src/agent_hooks`

#### 3.1 New `grok_build.rs`

- **Detected if:** the resolved Grok root exists **or** `which grok` / `which agent` resolves to Grok fingerprint.
- **Grok root:** non-empty `GROK_HOME`, otherwise `~/.grok`.
- **Config path:** `${grok_root}/hooks/atmos-status.json` (dedicated file; merge only Atmos-managed content; do not clobber third-party files like `orca-status.json`).
- **Install shape** (Claude-like nested hooks; Grok native):

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "<cmd>", "timeout": 5 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "<detached-stdin-cmd>" }] }],
    "PreToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "<detached-stdin-cmd>" }] }],
    "PostToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "<detached-stdin-cmd>" }] }],
    "PostToolUseFailure": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "<detached-stdin-cmd>" }] }],
    "Notification": [{
      "matcher": ".*",
      "hooks": [{ "type": "command", "command": "<detached-stdin-cmd>" }]
    }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "<detached-stdin-cmd>" }] }],
    "StopFailure": [{ "hooks": [{ "type": "command", "command": "<detached-stdin-cmd>" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "<cmd-or-stdin>", "timeout": 5 }] }]
  }
}
```

<!-- updated 2026-07-16: current Grok ignores the Claude-style async property -->
- **Command pattern:** gate `ATMOS_MANAGED=1`, set hook version, and **forward stdin** for all events so `sessionId` / `notificationType` are preserved. High-frequency handlers first consume stdin, then detach a fully redirected sender; curl uses short connect/total deadlines. Do not emit unsupported `"async": true`.
- **Runner contract:** current upstream `xai-grok-hooks` waits for the shell child and uses `kill_on_drop` only on timeout; it does not terminate the detached process group after a normal shell exit. Keep all sender stdio redirected so shell completion is not held open.
- **URL:** `http://localhost:{port}/hooks/grok-build`
- **Marker:** command contains `ATMOS_MANAGED` (same as other agents) for retain/uninstall.
- **Atmos headers:** same as Claude (`X-Atmos-Context`, `X-Atmos-Pane`, …, hook version).

#### 3.2 `mod.rs`

- Field `grok_build: AgentHookToolStatus` on `AgentHookInstallReport`.
- Register install/check/uninstall tool key `"grok-build"`.
- Include in `sync_installed_hooks` / install-all paths.

### 4. API — `apps/api`

#### 4.1 Hooks routes — `src/api/hooks/mod.rs`

- `POST /hooks/grok-build` → `handle_grok_build_event` (same as other agent hooks; **REST justified**: external CLI process POSTs; not a browser WS peer).

#### 4.2 Contested identity route (REST)

- `GET /hooks/cli-identity?command=agent`  
  **REST justified:** infrequent bootstrap/settings probe, not a streaming session channel; mirrors install/status style.
- Response:

```json
{
  "command": "agent",
  "owner": "grok-build" | "cursor" | "unknown",
  "resolved_path": "/Users/…/agent" | null
}
```

Auth: same as other local API hooks/status endpoints.

Frontend: a connection-scoped owner manager caches by active Computer/API target, deduplicates in-flight work, and owns one focus listener/timer. Mobile uses per-gateway cache entries and ignores stale completions after a Computer switch.

### 5. Shared title resolution — `packages/shared/src/terminal/title.ts`

#### 5.1 Match algorithm rewrite

Replace `normalizedTitle.includes(normalizedCommand)` with:

1. Normalize first token (basename, strip extension, lower).
2. Build candidate list per agent: primary `command` + optional `aliases?: string[]` (TS-only extension on `TerminalTitleAgent` if needed).
3. **Exact token match** preferred.
4. If multiple exact matches (should not happen after Cursor migration), prefer longer command string.
5. Contested token `agent`:
   - if `contestedOwners?.agent === "grok-build"` → agent id `grok-build`
   - if `"cursor"` → agent id `cursor`
   - if unknown/missing → **no agent match**, suppress persisted/base-agent fallback for that render, and display raw `agent`

Path-only titles remain CWDs unless their first token has an executable `bin`/`sbin` shape or a strong product fingerprint such as `.../cursor-agent/versions/.../agent` / `.../.grok/.../agent`. This allows argument-free installed executables without branding a project directory merely named `grok`.

#### 5.2 API surface

```ts
export type ContestedCommandOwner = "grok-build" | "cursor" | "unknown";

export function resolveAgentForTitle<T extends TerminalTitleAgent>(
  title: string | undefined,
  agents: T[],
  options?: {
    contestedOwners?: Partial<Record<"agent", ContestedCommandOwner>>;
  },
): T | undefined;
```

Wire `options` from toolbar hooks (`use-terminal-toolbar-title.ts`, mosaic panes, mobile) that already call `getTerminalDisplayMeta` / `resolveAgentForTitle`.

#### 5.3 Tests — `apps/web/.../terminal-title.test.ts` + shared tests if present

Matrix:

| dynamicTitle | contestedOwners.agent | expected toolbarAgent |
|--------------|----------------------|------------------------|
| `grok …` | any | Grok Build |
| `cursor-agent …` | any | Cursor |
| `agent …` | grok-build | Grok Build |
| `agent …` | cursor | Cursor |
| `agent …` | unknown | none / not Cursor |
| `cursor-agent` must not match a leftover cmd `agent` via substring | — | Cursor only |

### 6. Frontend — `apps/web`

| Area | Change |
|------|--------|
| `terminal-agent-run-config.ts` | `modelFlagForAgent`: add `grok-build` → `--model` |
| `agent-hooks-store.ts` | `AGENT_TOOL.GROK_BUILD = "grok-build"`, labels, icon ids |
| `AgentHookStatusCard.tsx` | install report field + HOOK_TOOL_META entry |
| `agent-vendor.ts` | vendor `"grok"` / map `grok-build`, `grok` |
| Settings search keywords | `grok`, `grok build` |
| `AgentIcon.tsx` | **Remove** dangerous alias `"agent": ["cursor"]` (breaks freehand identity). Add remap `grok-build` → icon file; theme handling |
| Title consumers | pass contested owner map into title helpers; fetch cli-identity |
| i18n | only if new user-facing strings (hooks card label can reuse English agent name like others) |

<!-- updated 2026-07-16: `-p` is Grok single-turn mode, not an interactive prompt flag -->
Interactive Grok workspace prompts are positional (`grok --always-approve "<prompt>"`). Only headless automation uses `--output-format streaming-json -p <prompt>`, with model/reasoning options placed before `-p`.

Hook status/install/uninstall UI calls the relay-aware `agentHooksApi`; feature components must not resolve a loopback base directly.
Status, loading, and mutation results use the shared Computer query scope (`activeInstanceId`, connection epoch, relay session revision) plus a monotonic request generation; late responses and A→B→A scope reuse are discarded.

### 7. Icons (N1 → Phase 1)

**Source (user-provided):**

- `/Users/lurunrun/Downloads/Grok_light_dark/Grok_light.svg` — dark ink (`#0A0A0A`) for light UI
- `/Users/lurunrun/Downloads/Grok_light_dark/Grok_dark.svg` — white fill for dark UI

**Ship plan:**

1. Prefer a **single** `apps/web/public/agents/grok-build.svg` with `fill="currentColor"` (or black paths) so existing AgentIcon invert classes work — **or** keep dual files and extend `AgentIcon` with a light/dark pair map:

```ts
const THEME_PAIR_ICONS: Record<string, { light: string; dark: string }> = {
  "grok-build": {
    light: "/agents/grok-build-light.svg",
    dark: "/agents/grok-build-dark.svg",
  },
};
```

**Decision:** use **theme-pair** (preserve brand assets as provided) with `useTheme()` / `prefers-color-scheme` class already used elsewhere if available; else CSS `dark:` swap via two Images. Implementation should avoid incorrect invert on pre-themed fills.

2. Copy PNGs or converted assets into the canonical Metro bundle directory `apps/mobile/assets/agents/` and register in `MobileAgentIcon.tsx` as `"grok-build"`.
3. Optional: `apps/landing/public/agents/` only if landing lists agents (not required for M1 app).

### 8. Mobile

- Shared title package already used — pass contested owners if mobile has API access; else unique cmds still work (`grok` / `cursor-agent`).
- Icon map update for Grok Build.

### 9. Notifications display name

`crates/core-service/src/service/notification.rs` — `tool_display_name(AgentToolType::GrokBuild) => "Grok Build"`.

---

## Data model

No new DB tables. In-memory / config only.

```rust
// AgentToolType addition
GrokBuild, // serde "grok-build"

// StdoutParser addition  
GrokStreamingJson, // serde "grok_streaming_json"

// Contested identity
enum ContestedCliOwner { GrokBuild, Cursor, Unknown }
```

```ts
type AgentToolType = /* existing */ | "grok-build";
type ContestedCommandOwner = "grok-build" | "cursor" | "unknown";
```

Hook install file (user home): `~/.grok/hooks/atmos-status.json`.

---

## Transport

### WebSocket (existing)

No new `WsAction`. Hook state continues:

- `AgentHookStateChanged`
- `AgentHookSessionsCleared`

forwarded from `apps/api` as today.

### REST (justified)

| Method | Path | Why REST |
|--------|------|----------|
| `POST` | `/hooks/grok-build` | External Grok CLI process POSTs (same as other agents) |
| `GET`/`POST` | `/hooks/install`, `/hooks/status`, per-tool install | existing pattern |
| `GET` | `/hooks/cli-identity?command=agent` | one-shot local binary probe; not a session stream |

---

## Security & permissions

- Hook curl only when `ATMOS_MANAGED=1` (tmux/Atmos-spawned shells).
- Fail-open hooks (`|| true`) — never block Grok tools from Atmos status scripts.
- Status-only: no PreToolUse deny policy.
- Identity probe runs local binaries with short timeout; do not log full `--help` bodies at info level.
- No secrets in hook payloads beyond session/cwd already used by other agents.

---

## Compat / double-fire mitigation

Grok may load Claude/Cursor hooks via `[compat.*] hooks = true`.

**Mitigations:**

1. Primary Atmos install is **only** `~/.grok/hooks/atmos-status.json` posting to `/hooks/grok-build`.
2. Do not install Grok status into Claude/Cursor config files.
3. Existing session ownership: non-idle sessions ignore foreign tool events.
4. Document that dual-fire can briefly flip labels if user also has Atmos Claude hooks and Grok compat loads them — acceptable residual; optional TECH follow-up: detect `GROK_SESSION_ID` on Claude handler and ignore (fragile).

---

## Rollout plan

1. **Manifest + Cursor cmd** — `builtin_agents.json` (`grok-build` + Cursor→`cursor-agent`); verify TS/Rust load.
2. **Automation parser** — `StdoutParser::GrokStreamingJson` + unit tests; `model_flag` / model list normalize.
3. **Hooks backend** — engine install module, service handler, API route, notification display name, install report field.
4. **Identity probe API** + title matcher rewrite + tests (collision matrix).
5. **Frontend wiring** — run-config flags, hooks store, settings card, vendor map, **remove `agent→cursor` icon alias**, contested owner fetch.
6. **Icons** — copy/adapt SVGs from Downloads into `public/agents` (+ mobile asset).
7. **Manual smoke** — interactive Grok launch; Cursor with Grok-owned PATH; freehand matrix; automation sample; hooks install → Running/PermissionRequest/Idle.

Each step 1–4 is independently mergeable with tests green.

---

## Risks & tradeoffs

| Topic | Decision | Why |
|-------|----------|-----|
| Interactive flags | `--always-approve` | Matches Atmos “yolo” presets for other CLIs; user-overridable |
| Headless output | `streaming-json` only | PRD locked; dedicated parser |
| Contested probe | API host PATH | Same machine as local runtime; perfect tmux env parity is hard without per-pane which |
| Notification matcher | install filter + server filter | Fewer hooks; still correct |
| Icon | theme pair from user assets | Brand fidelity; avoid wrong invert |
| Cursor default cmd | hard cutover to `cursor-agent` | Fixes wrong binary; user overrides preserved |

**Rollback:** revert manifest Cursor cmd + remove Grok entry; uninstall Grok hooks file; remove parser variant unused.

---

## Dependencies & compatibility

- Depends on: existing terminal-agent manifest loaders, hooks install framework, automation OutputRenderer, title helpers.
- External: Grok Build CLI ≥ probed `0.2.101` behavior (hooks + streaming-json); Cursor CLI providing `cursor-agent`.
- Related specs: APP-024 run config, APP-017 automations, APP-032 hooks pattern.
- Open source: `xai-org/grok-build` for envelope field names.

---

## Open questions (implementation)

- [ ] Confirm Grok Notification **matcher** regex dialect accepts `permission_prompt|elicitation_dialog` (docs say regex); if not, install unfiltered Notification and filter server-side only.
- [ ] Whether mobile must call cli-identity in M1 or only unique cmds.
- [ ] Landing marketing icon sync (optional).

---

## Appendix A — Built-in draft (Cursor after change)

```json
{
  "id": "cursor",
  "label": "Cursor Agent",
  "cmd": "cursor-agent",
  "params": "--force --print --trust --output-format stream-json --stream-partial-output",
  "interactiveParams": "--yolo",
  "promptStrategy": "arg",
  "stdoutParser": "cursor_stream_json",
  "modelSupport": "catalog",
  "reasoningSupport": { "mode": "encoded_in_model" },
  "modelList": {
    "supported": true,
    "command": ["cursor-agent", "--list-models"],
    "parser": "line_list"
  }
}
```

## Appendix B — Icon asset copy commands (impl)

```bash
# From repo root during impl — adjust after choosing single vs pair strategy
cp /Users/lurunrun/Downloads/Grok_light_dark/Grok_light.svg apps/web/public/agents/grok-build-light.svg
cp /Users/lurunrun/Downloads/Grok_light_dark/Grok_dark.svg apps/web/public/agents/grok-build-dark.svg
# mobile: convert or export PNG into apps/mobile/assets/agents/grok-build.png
```

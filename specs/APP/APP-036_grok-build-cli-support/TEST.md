# TEST · APP-036: Grok Build CLI Support

> Test Plan · verify first-class Grok Build terminal agent, Cursor `cursor-agent` migration, contested freehand identity, streaming automation parser, hooks status, icons, and AI usage quota. References PRD APP-036 and TECH APP-036.

## Test strategy

Prove deterministic logic at the cheapest honest layer; reserve manual/E2E for CLI-on-PATH and full UI smoke.

- **Rust unit / integration**: automation `GrokStreamingJson` parser, model list normalization, hook event → state mapping, hook install/check/uninstall against temp home dirs, contested CLI identity probe with path/version fixtures.
- **Bun / shared unit**: title matcher matrix (exact token, no `cursor-agent`⊃`agent` footgun, contested owners), `modelFlagForAgent("grok-build")`, builtin JSON load.
- **WebSocket/API**: `POST /hooks/grok-build` state transitions; `GET /hooks/cli-identity?command=agent` response shape (service-level or API tests with fakes preferred over real binaries).
- **E2E (Playwright)**: optional smoke only if harness can open Agent Select / Settings without flaky local CLI install — prefer manual for PATH-dependent cases.
- **Exploratory agent-browser**: Settings + Agent Select copy/layout after UI lands.
- **Manual**: real `grok` / `cursor-agent` PATH matrix, interactive launch, hooks live status.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 Built-in identity | S1, S2 |
| M2 Interactive defaults | S1, S14 |
| M3 Model catalog | S3 |
| M4 Reasoning / effort | S4 |
| M5 Cursor → `cursor-agent` | S5, S6, S14 |
| M6 Unique-cmd titles | S7, S8 |
| M7 Contested freehand `agent` | S9, S10, S11 |
| M8 Automation streaming | S12, S13 |
| M9 Hooks status | S15, S16, S17, S18 |
| M10 Settings / UI parity | S19, S20 |
| M11 AI usage / quota | S22, S23, S24 |
| N1 Icons | S21 |
| N2–N4 | deferred / non-coverage |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Bun / unit | `bun test` | load `builtin_agents.json` / terminal-agent-definitions | repo manifest | entry `id=grok-build`, `cmd=grok`, label `Grok Build` | planned |
| S2 | Rust unit | `cargo test -p core-service` | automation resolve built-in | resolved agents list | agent present; headless flags include streaming-json + `-p` | planned |
| S3 | Rust unit | `cargo test -p core-service` | `parse_grok_model_catalog` / `grok_line_list` | full `grok models` stdout including `You are logged in with grok.com.` and `Default model:` preamble plus `* grok-4.5 (default)` | only real models; id `grok-4.5` without `(default)`; login/default status lines dropped | planned |
| S4 | Bun unit | `bun test` | run-config / reasoning arg helpers | agent id `grok-build` | reasoning arg `--reasoning-effort`; model flag `--model` | planned |
| S5 | Bun / unit | `bun test` | builtin load | manifest | cursor `cmd=cursor-agent`; modelList uses `cursor-agent` | planned |
| S6 | Rust unit | `cargo test -p core-service` | resolve cursor agent | resolved agents | executable not bare `agent` | planned |
| S7 | Bun unit | `bun test` | `getTerminalDisplayMeta` / `resolveAgentForTitle` | agents with grok + cursor | dynamic `grok …` → Grok Build; `cursor-agent …` → Cursor | planned |
| S8 | Bun unit | `bun test` | title matcher | cursor cmd `cursor-agent` only | `cursor-agent` does **not** match via substring of `agent` if residual agent cmd exists in custom list | planned |
| S9 | Bun unit | `bun test` | title + contestedOwners | `agent --yolo`, owner `grok-build` | toolbarAgent Grok Build | planned |
| S10 | Bun unit | `bun test` | title + contestedOwners | owner `cursor` | toolbarAgent Cursor | planned |
| S11 | Bun + Rust | both | title unknown + identity probe | owner `unknown`; fake paths | no wrong brand; probe returns unknown | planned |
| S12 | Rust unit | `cargo test -p core-service` | `OutputRenderer` + `GrokStreamingJson` | NDJSON fixture from TECH live sample | text in final output; thought as `[thinking]` channel; end finalized | planned |
| S13 | Rust unit | `cargo test -p core-service` | parser fail-open | unknown type / bad JSON line | no panic; text still works | planned |
| S14 | Manual | manual | interactive launch | real CLIs on PATH | Select Grok → `grok`; Select Cursor → `cursor-agent` even if `agent` is Grok | planned |
| S15 | Rust unit | `cargo test -p core-engine` | grok_build hook install/check/uninstall | temp `$HOME` | writes `~/.grok/hooks/atmos-status.json` with ATMOS_MANAGED; uninstall removes Atmos entries | planned |
| S16 | Rust unit | `cargo test -p core-service` | `handle_grok_build_event` | payload matrix | SessionStart Idle; PreToolUse Running; Notification permission_prompt PermissionRequest; elicitation_dialog PermissionRequest; idle_prompt no change; Stop Idle | planned |
| S17 | Service/API | `cargo test` / API harness | `POST /hooks/grok-build` | JSON camelCase envelope | state update broadcast / session list | planned |
| S18 | Rust unit | `cargo test -p core-service` | foreign-tool ownership | active Claude session same pane | Grok event skipped while non-idle foreign owner | planned |
| S19 | Manual / agent-browser | manual + `agent-browser` | Settings Code Agent + hooks card | dev web | Grok Build listed; hook row install status | planned |
| S20 | Manual | manual | Agent Select | workspace terminal | Grok Build option with label | planned |
| S21 | Bun / visual | manual or snapshot | AgentIcon | light/dark theme | grok-build icon visible; not Bot fallback; not cursor icon for freehand agent when owner grok | planned |
| S22 | Rust unit | `cargo test -p quota-usage` | Grok auth parse | synthetic auth.json | OIDC preferred; missing key errors | planned |
| S23 | Rust unit | `cargo test -p quota-usage` | credits billing map | fixture JSON | percent + weekly reset + product row | planned |
| S24 | Manual | manual | usage popover | real `~/.grok/auth.json` | Grok Build row with % / reset or re-login | planned |

## Scenarios

### S1 — Built-in Grok Build manifest

- **Level**: Unit (Bun / shared load)
- **Given**: repo `resources/terminal-agents/builtin_agents.json`.
- **When**: definitions are loaded.
- **Then**: an agent exists with `id=grok-build`, `label=Grok Build`, `cmd=grok`, `promptStrategy=prompt_flag`, `stdoutParser=grok_streaming_json`, `interactiveParams` containing `--always-approve`.
- **Signals**: assert fields on loaded object.

### S2 — Automation resolves Grok Build headless command

- **Level**: Rust unit (`core-service` automation)
- **Given**: resolved terminal agents from builtins.
- **When**: building invocation for `grok-build` with a prompt.
- **Then**: executable is `grok`; args include `--output-format` `streaming-json`, `--always-approve`, and prompt flag `-p` / delivery `prompt_flag`; parser is `GrokStreamingJson`.
- **Signals**: `AutomationAgentInvocation` fields.

### S3 — Model list strips `(default)`

- **Level**: Rust unit
- **Given**: catalog stdout lines like `* grok-4.5 (default)` and `- grok-composer-2.5-fast`.
- **When**: `line_list` parser runs (with TECH normalization).
- **Then**: model id is `grok-4.5` (no suffix); composer id preserved; empty/header lines dropped.
- **Signals**: `Vec<TerminalAgentModelOption>` contents.

### S4 — Run config model and reasoning flags

- **Level**: Bun unit
- **Given**: agent id `grok-build`.
- **When**: compiling run-config args with model + reasoning value.
- **Then**: includes `--model <id>` and `--reasoning-effort <value>` (or TECH-specified effort alias).
- **Signals**: args array.

### S5 — Cursor built-in uses `cursor-agent`

- **Level**: Unit
- **Given**: builtin manifest after migration.
- **When**: loading cursor entry.
- **Then**: `cmd` is `cursor-agent`; model list command starts with `cursor-agent`, not `agent`.
- **Signals**: JSON / loaded definition.

### S6 — Automation cursor executable not bare `agent`

- **Level**: Rust unit
- **Given**: resolved agents.
- **When**: resolving `cursor`.
- **Then**: `cmd` / executable is `cursor-agent`.
- **Signals**: resolved agent struct.

### S7 — Title: unique commands

- **Level**: Bun unit (`terminal-title` / shared title)
- **Given**: configured agents Grok Build (`grok`) and Cursor (`cursor-agent`).
- **When**: dynamic titles `grok --always-approve` and `cursor-agent --yolo`.
- **Then**: toolbar agents are Grok Build and Cursor Agent respectively.
- **Signals**: `getTerminalDisplayMeta(...).toolbarAgent`.

### S8 — Title: no substring footgun

- **Level**: Bun unit
- **Given**: agents where one command is a substring of another (historical `agent` vs `cursor-agent`).
- **When**: dynamic title is `cursor-agent`.
- **Then**: match is Cursor via exact token, never mis-attributed solely by `includes("agent")`.
- **Signals**: matched agent id `cursor`.

### S9 — Contested `agent` owned by Grok

- **Level**: Bun unit
- **Given**: contestedOwners `{ agent: "grok-build" }` and both agents configured.
- **When**: dynamic title is `agent` or `agent --foo`.
- **Then**: display/toolbar is Grok Build.
- **Signals**: toolbarAgent id `grok-build`.

### S10 — Contested `agent` owned by Cursor

- **Level**: Bun unit
- **Given**: contestedOwners `{ agent: "cursor" }`.
- **When**: dynamic title is `agent`.
- **Then**: toolbar is Cursor Agent.
- **Signals**: toolbarAgent id `cursor`.

### S11 — Contested `agent` unknown + probe API

- **Level**: Bun unit + Rust unit
- **Given**: owner `unknown` / probe cannot classify.
- **When**: title resolve and identity probe run.
- **Then**: title does **not** force Cursor or Grok; probe returns `owner: "unknown"`.
- **Signals**: no toolbarAgent brand; API JSON owner field.

### S12 — Grok streaming-json text + thought

- **Level**: Rust unit (`OutputRenderer`)
- **Given**: NDJSON lines  
  `{"type":"thought","data":"Hmm"}`  
  `{"type":"text","data":"ok"}`  
  `{"type":"end","stopReason":"EndTurn"}`.
- **When**: renderer pushes chunks and finishes.
- **Then**: final/assistant stream contains `ok`; thinking channel/event contains thought data (e.g. `[thinking]`); no panic.
- **Signals**: rendered stdout segments / final text.

### S13 — Parser fail-open

- **Level**: Rust unit
- **Given**: unknown type line and a following valid text line.
- **When**: parse loop runs.
- **Then**: unknown ignored; text still emitted.
- **Signals**: final text includes valid deltas only.

### S14 — Interactive launch PATH matrix (manual)

- **Level**: Manual
- **Given**: machine where `which agent` is Grok; `cursor-agent` installed; Atmos dev app.
- **When**: Agent Select → Grok Build; then Agent Select → Cursor Agent.
- **Then**: Grok pane runs `grok …`; Cursor pane runs `cursor-agent …` (not Grok under Cursor label).
- **Signals**: process/title/toolbar; terminal command line.

### S15 — Hook install / uninstall file

- **Level**: Rust unit (`core-engine`)
- **Given**: temp home with or without `~/.grok`.
- **When**: install then check then uninstall for tool `grok-build`.
- **Then**: Atmos file under `~/.grok/hooks/` contains ATMOS_MANAGED curl to `/hooks/grok-build`; check reports installed; uninstall removes Atmos hooks without deleting unrelated third-party hook files.
- **Signals**: filesystem JSON; `AgentHookToolStatus`.

### S16 — Hook state mapping matrix

- **Level**: Rust unit (`core-service` agent_hooks)
- **Given**: empty sessions.
- **When**: events in order: SessionStart → UserPromptSubmit → PreToolUse → Notification(permission_prompt) → Notification(idle_prompt) → Stop.
- **Then**: Idle → Running → Running → PermissionRequest → **still PermissionRequest** (idle_prompt no-op) → Idle.
- **Also**: Notification(elicitation_dialog) → PermissionRequest; Notification(task_complete) no-op; PermissionDenied no-op.
- **Signals**: `get_all_sessions()` tool + state.

### S17 — HTTP hook endpoint

- **Level**: Service / API
- **Given**: app state with AgentHooksService.
- **When**: `POST /hooks/grok-build` with camelCase Grok envelope (`hookEventName`, `sessionId`, `notificationType`).
- **Then**: session updated; WS event path still works if integrated in existing forwarder tests.
- **Signals**: session state; HTTP 200 `{ ok: true }`.

### S18 — Session ownership isolation

- **Level**: Rust unit
- **Given**: session for pane actively Running under Claude Code.
- **When**: Grok PreToolUse arrives for same session id / pane.
- **Then**: state remains Claude-owned; no silent takeover.
- **Signals**: tool field unchanged.

### S19 — Settings UI lists Grok Build

- **Level**: Manual + agent-browser
- **Given**: dev web app.
- **When**: open Settings → Code Agents / Agent Hooks status.
- **Then**: **Grok Build** appears; hook install status row present; name not “Grok” alone unless intentional.
- **Signals**: visible labels; no console errors.

### S20 — Agent Select lists Grok Build

- **Level**: Manual
- **Given**: workspace terminal.
- **When**: open agent select.
- **Then**: Grok Build selectable; icon if N1 shipped.
- **Signals**: menu entry.

### S21 — Icons

- **Level**: Manual / light automated if feasible
- **Given**: light and dark themes.
- **When**: rendering AgentIcon for `grok-build`.
- **Then**: custom asset shown (not generic Bot); freehand contested Grok does not show Cursor icon (alias `agent→cursor` removed).
- **Signals**: network `/agents/grok-build*` or visible glyph.

## Performance & load budgets

- Contested identity probe: ≤ ~800ms timeout; cached ≥ 60s so title updates do not spawn a process per OSC event.
- Hook curl: fail-open, short timeout (≤ 5–10s) consistent with other agents; must not block Grok tool execution.

## Regression checklist

- [ ] Cursor launch never uses bare `agent` from builtin defaults.
- [ ] `AgentIcon` alias `"agent": ["cursor"]` is gone or no longer mislabels freehand Grok.
- [ ] `cursor-agent` title never matches a hypothetical `cmd: "agent"` via substring `includes`.
- [ ] Grok hooks file does not wipe third-party `~/.grok/hooks/*.json` (e.g. orca).
- [ ] Claude/Cursor Atmos hooks still install and fire independently.
- [ ] Automations for non-Grok agents still parse with previous stdout parsers.
- [ ] User override of cursor cmd to custom path is not overwritten by manifest load merge rules.

## Exploratory agent-browser checks

Load Agent Browser skill / `agent-browser skills get core --full` before running.

1. Open Settings (Code Agents + Hooks). Confirm **Grok Build** label, icon, install control readability in light/dark.
2. Open Agent Select from a workspace terminal; confirm Grok Build is findable and not clipped.
3. Narrow viewport: settings agent list still scrollable; labels not truncated into uselessness.
4. Trigger install hooks (if safe on dev machine) and confirm status chip updates without console/WS errors.
5. After freehand simulation is hard in browser-only, still check that a pane titled via UI launch shows Grok icon + label.

## Acceptance criteria

- [ ] All Must Haves M1–M10 have at least one scenario with executable or documented manual proof.
- [ ] S5/S6 pass (Cursor builtin is `cursor-agent`).
- [ ] S7–S11 pass (title + contested identity matrix).
- [ ] S12–S13 pass (Grok streaming parser).
- [ ] S15–S18 pass (hooks install + state mapping + ownership).
- [ ] S14 manual PATH matrix signed off when shipping interactive launch.
- [ ] No new REST beyond TECH-justified `/hooks/grok-build` and `/hooks/cli-identity` (or equivalent).
- [ ] `just lint` / scoped `cargo test` + `bun test` for touched packages green, or gaps recorded in Coverage Status.
- [ ] Coverage Status filled by `atmos-specs-test-run` after implementation.

## Manual verification steps

1. Install/login Grok Build CLI; ensure `grok` works; note whether `agent` points at Grok.
2. `just dev-api` + `just dev-web` (or desktop).
3. Settings → install Grok Build hooks → status Installed.
4. Agent Select → Grok Build → confirm toolbar **Grok Build** and process is `grok`.
5. Agent Select → Cursor → confirm process is `cursor-agent` even if `agent` is Grok.
6. In a plain shell pane: run `grok`, then exit; run `agent` if present; confirm titles follow real binary (refresh identity if cached).
7. Optional: run a tiny automation / headless path with Grok streaming and confirm text appears.
8. Uninstall Grok hooks; third-party hook files remain.

### S22 — Grok auth.json preferred entry

- **Level**: unit · **PRD**: M11
- **Given**: synthetic auth JSON with both OIDC and legacy scopes (or only one)
- **When**: Grok provider selects credentials
- **Then**: OIDC scope entry wins when both have a non-empty `key`; missing key falls through; empty file errors cleanly

### S23 — Credits billing JSON maps to usage summary

- **Level**: unit · **PRD**: M11
- **Given**: fixture body from `GET …/v1/billing?format=credits` with weekly period and `creditUsagePercent` / GrokBuild productUsage
- **When**: map to `LiveFetchResult`
- **Then**: percent matches, reset_at from period end, window labeled Weekly when type is weekly, GrokBuild product row present when productUsage includes it

### S24 — Usage popover shows Grok when authenticated (manual)

- **Level**: manual · **PRD**: M11
- **Given**: machine with `grok login` / valid `~/.grok/auth.json`
- **When**: open Atmos AI usage UI and refresh
- **Then**: **Grok Build** provider appears with used % and reset countdown (or clear re-login error if token expired)

## Non-coverage

- Full Playwright E2E of PATH hijacking (environment-specific; covered by S14 manual + unit matrix).
- Public xAI API prepaid credits console as the primary SuperGrok meter.
- ACP `grok agent stdio|serve` modes (including stdio `x.ai/billing`, still method-not-found on current CLI).
- Grok compat double-fire with Claude hooks (residual risk; optional ownership test only).
- N2 richer thought UX, N3 auto-install policy expansion, N4 pane-pin priority.
- Performance under hundreds of OSC title updates (cache design is the control).

## Coverage Status

_Last run: 2026-07-16 (M11 Grok usage)._

Commands:

```text
cargo test -p core-service --lib
cargo test -p api
cargo test -p core-engine --lib agent_hooks::grok_build
cargo test -p quota-usage --lib
cargo clippy -p quota-usage --all-targets --no-deps
bun test apps/web/src/api/__tests__/agent-hooks-api.test.ts apps/web/src/features/terminal/components/__tests__/terminal-title.test.ts apps/web/src/features/wiki/components/__tests__/agent-select.test.ts
bun --cwd apps/web typecheck
bunx eslint <touched APP-036 web files>
cargo clippy -p core-engine -p core-service -p api --all-targets --no-deps
```

- S1/S5 — ✅ shared-manifest assertions in `agent-select.test.ts`.
- S2/S6 — ✅ built-in resolution + Rust and web full-argv prompt invocation coverage.
- S3 — ✅ `grok_model_catalog_ignores_status_preamble`.
- S4 — ✅ Grok model/reasoning args in `agent-select.test.ts`.
- S22 — ✅ `providers::grok::tests` auth OIDC preference / missing token.
- S23 — ✅ `maps_credits_billing_to_weekly_usage` + period window labels.
- S24 — ⏳ manual (usage popover with live `~/.grok/auth.json`).
- S7–S11 — ✅ title matrix, including argument-free `bin/grok` paths; identity deadline/path/descendant-pipe fixtures; GET response shape.
- S12/S13 — ✅ Grok streaming text/thought/end, fail-open, and split-UTF-8 parser tests.
- S14 — ⏸ launch-plan tests prove positional interactive Grok vs headless `-p`; live PATH/TUI matrix remains manual.
- S15 — ✅ isolated-home and `GROK_HOME` install/check/uninstall plus detached slow-endpoint payload test.
- S16/S18 — ✅ Grok state matrix and foreign-owner isolation tests.
- S17 — ◐ service state path and handler response extraction covered; full `POST /hooks/grok-build` API harness remains pending.
- S19 — ◐ relay-aware hook status/mutation transport covered; agent-browser Settings smoke not run.
- S20 — ◐ built-in Agent Select option and both launch modes covered; visual manual smoke not run.
- S21 — ◐ static web/mobile assets and mobile dark tint implemented; light/dark device/browser smoke not run.

Known unrelated blockers:

- Mobile typecheck/export cannot start cleanly because the existing install lacks `sf-symbols-typescript` and `babel-preset-expo`.
- Strict workspace lint remains red on pre-existing files; touched web files have 0 errors (one existing `<img>` optimization warning).
- Full core-engine runs intermittently fail unrelated Git temp-repo teardown with `DirectoryNotEmpty`; isolated failed-test reruns and APP-036 hook tests pass.

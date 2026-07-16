# PRD · APP-036: Grok Build CLI Support

> Product Requirements · WHAT and WHY. First-class Grok Build terminal agent in Atmos, with correct Cursor command identity, freehand CLI disambiguation, streaming automations, and agent hook status.

## Context

- **Problem**: xAI’s **Grok Build** CLI is a real coding agent users already run as `grok` (and also as bare `agent`). Atmos does not list it as a built-in terminal agent. Meanwhile Atmos still launches **Cursor Agent** with the contested short name `agent`, so on machines where Grok owns that name, Cursor launches and dynamic titles can mislabel the product.
- **Why now**: Grok Build has a full CLI (interactive, headless, model list, hooks). The open-source tree ([xai-org/grok-build](https://github.com/xai-org/grok-build)) and live CLI probes confirm the flags, streaming output shape, and notification hook types we need for parity with other built-ins (e.g. APP-032 Antigravity).
- **Related specs**:
  - `APP-032_antigravity-cli-support` — parallel “add a CLI agent + hooks” precedent
  - `APP-024_terminal-agent-run-config` — model / reasoning / run config surfaces
  - `APP-003_web-terminal-dynamic-title` / shared title helpers — dynamic tab/toolbar identity
  - `APP-017_atmos-automations` — headless terminal-agent invocation consumers
  - `APP-033_terminal-custom-naming` — custom names compose with auto agent detection

## Goals

1. **Primary**: Users can select **Grok Build** everywhere other built-in terminal agents work (Agent Select, run config, automations), with correct launch command, model list, streaming output, and idle/running/permission status.
2. **Primary**: Cursor’s Atmos built-in always launches **`cursor-agent`**, so “Cursor Agent” is no longer PATH-ambiguous with Grok’s `agent` alias.
3. **Primary**: When the user freehands a contested `agent` command in a terminal, Atmos labels the pane from the **real binary on PATH**, not a hard-coded brand.
4. **Secondary**: Grok Build feels first-class in the UI (label, icon treatment, settings/hooks status) without breaking existing agents or user overrides.

## Users & Scenarios

- **Primary persona**: Agentic Builder who runs local coding CLIs inside Atmos workspaces (web/desktop).
- **Secondary persona**: Automation author who wires a non-interactive agent run to Grok Build.

**Key scenarios**

1. **Pick Grok from Agent Select** — User opens a workspace terminal, chooses Grok Build, optionally picks a model, and the pane runs `grok` with Atmos defaults; toolbar shows **Grok Build**.
2. **Pick Cursor after Grok is installed** — User chooses Cursor Agent; Atmos launches **`cursor-agent`**, not bare `agent`, even if Grok’s `agent` is first on PATH.
3. **Freehand ambiguity** — User types `agent` in a blank shell. If PATH resolves to Grok, the pane shows Grok Build; if it resolves to Cursor’s agent binary, Cursor Agent; if unknown, show the raw command, never the wrong brand.
4. **Automation** — An automation run uses Grok Build headless streaming; the user can follow assistant text (and thought when the automation UI already surfaces thinking for other agents).
5. **Status at a glance** — With hooks installed, a Grok turn shows running; waiting for tool/plan/user-question approval shows permission-request; turn end returns idle.

## User Stories

- As a workspace user, I want **Grok Build** in Agent Select and Code Agent settings, so I can start it like Claude or Cursor without remembering flags.
- As a workspace user, I want Cursor to launch via a **Cursor-specific command**, so installing Grok does not hijack “Cursor Agent”.
- As a workspace user, I want the terminal toolbar title/icon to match **what is actually running**, including freehand `agent` / `grok` / `cursor-agent`.
- As an automation author, I want Grok Build as a built-in automation agent with streaming output, so unattended runs can complete and report text.
- As a workspace user, I want Grok’s agent status (idle / running / waiting on me) in Atmos, so I can see when a pane needs attention without staring at the TUI.

## Functional Requirements

### Must Have

- **M1 — Built-in agent identity**  
  Register a built-in terminal agent with stable id **`grok-build`**, display label **`Grok Build`**, canonical command **`grok`**. It appears wherever built-in terminal agents appear (Agent Select, Code Agent settings, run-config agent list, automation agent capabilities), subject to the same enable/disable rules as other built-ins.

- **M2 — Interactive launch defaults**  
  Interactive launch uses unique `grok` with product-default flags suitable for Atmos (auto-approve style consistent with other built-ins’ “yolo” presets; exact flag list is TECH). Users can still override via existing Code Agent / run-config customization.

- **M3 — Model catalog**  
  Grok Build supports catalog model selection via the CLI model list (`grok models`). Run config / New Workspace / automations can offer live models when the CLI is installed and authenticated. Model ids must be usable with Grok’s model flag (normalize list noise such as `(default)` if present).

- **M4 — Reasoning / effort (if supported by catalog surface)**  
  Expose Grok’s reasoning-effort style control in the same run-config pattern as other agents that support effort (manual or enum as TECH determines from CLI). If the surface cannot list fixed values, free-form effort input is acceptable.

- **M5 — Cursor built-in command migration**  
  Atmos’s built-in Cursor Agent default command becomes **`cursor-agent`** (including model-list command). Existing **user overrides** in personal agent config are left alone. Docs / settings copy should not tell users to use bare `agent` for Cursor.

- **M6 — Dynamic title / toolbar identity for unique commands**  
  Freehand or launched `grok` resolves to Grok Build; `cursor-agent` resolves to Cursor Agent. Matching must not treat `cursor-agent` as a vague substring of `agent`. Prefer exact first-token matching and longer/more-specific tokens over broad substring includes.

- **M7 — Contested freehand `agent` → real CLI**  
  When the dynamic title’s first token is exactly `agent`, classify using the **real executable** the shell would run (PATH / realpath / version or help banner).  
  - Grok binary → **Grok Build**  
  - Cursor agent binary → **Cursor Agent**  
  - Missing or unknown → show raw **`agent`**, never invent a brand.  
  Classification must not hard-code “agent always means Cursor” or “always Grok”.

- **M8 — Automations / headless streaming**  
  Grok Build is invocable as a non-interactive terminal agent for automations using headless single-turn mode and **`streaming-json`** output. Atmos must parse Grok’s NDJSON with a **dedicated Grok streaming parser** (not Cursor/Claude stream-json). Assistant **text** deltas are required; **thought** deltas must be handled safely (consume into existing thinking channel if the automation UI already supports it; otherwise do not break text delivery).

- **M9 — Agent hooks status**  
  Atmos can install, check, and uninstall **status-only** hooks for Grok Build in Grok’s native hooks location (not via Claude/Cursor compat paths as the primary identity). Hook delivery updates Atmos agent session state:

  | Grok lifecycle signal | Atmos state |
  |-----------------------|-------------|
  | Session start | Idle |
  | User prompt / tool activity mid-turn | Running |
  | Notification `permission_prompt` or `elicitation_dialog` | PermissionRequest |
  | Other notification types (`agent_error`, `task_complete`, `idle_prompt`, …) | No state change |
  | Permission denied (system deny) | No state change |
  | Stop / stop failure / session end | Idle |
  | Subagent / compact events | Ignore |

  Settings surfaces that show per-agent hook install status include Grok Build.

- **M10 — Settings / status UI parity**  
  Grok Build appears in the same Code Agent / hooks status UX as other built-ins (enablement, install state, running/idle/permission indicators where those exist today). Display name is always **Grok Build**.

- **M11 — AI usage / quota (subscription credits)**  
  Atmos AI usage tracking includes a **Grok Build** provider that reports the user’s SuperGrok / Grok Build **subscription quota** (used percent + reset time), using credentials already present from `grok login` (`~/.grok/auth.json`). The primary window is the **unified weekly pool** when the account is on unified billing; product-level GrokBuild percent and pay-as-you-go / on-demand status are exposed when the API returns them. Missing or expired auth surfaces a clear “run `grok login`” style setup hint, not a silent empty row.

### Nice to Have

- **N1 — Dedicated brand icon** for Grok Build in AgentIcon / toolbar (fallback to existing generic built-in treatment is OK for M1).
- **N2 — Richer thought streaming UX** in automations (dedicated thinking channel, collapse/expand) if not already free via M8.
- **N3 — Auto-install hooks** when Grok is detected, matching other agents’ optional auto-install behavior if product already does this.
- **N4 — Prefer pane launch pin** when the user started from Agent Select and the contested `agent` token appears (strengthens identity without replacing M7).

## Out of Scope

- **Public xAI API prepaid credits console** — `console.x.ai` API key prepaid balance is a different product surface from SuperGrok / Grok Build subscription quota; not required for M11.
- **Local token cost estimation as the primary meter** — session logs / `unified.jsonl` may inform secondary diagnostics later; subscription remaining % comes from the live billing endpoint.
- **Blocking / security hooks** — Atmos does not install PreToolUse deny policies for Grok; status-only.
- **ACP / `grok agent stdio|headless|serve` product mode** — not the M1 launch path; Automations use top-level headless single-turn + streaming-json.
- **Removing Grok’s ability to use bare `agent` on the user’s PATH** — OS PATH ownership stays with the user; Atmos only avoids using contested names for **built-in Cursor** launch and labels freehand correctly.
- **Migrating or rewriting user custom agents** that still set Cursor’s command to `agent`.
- **Mobile-only specialized UX** beyond reusing shared agent/title primitives if mobile already consumes them.
- **Rewriting Grok or Cursor upstream CLIs.**

## Success Metrics

- **Leading**: Users with Grok installed can complete “select Grok Build → interactive session starts as Grok” without editing config files.
- **Leading**: On a machine where PATH’s `agent` is Grok, “select Cursor Agent” still starts Cursor (via `cursor-agent`), verified in manual/dev matrix.
- **Leading**: Freehand matrix (`grok` / `cursor-agent` / `agent`→Grok / `agent`→Cursor / unknown) produces the expected toolbar labels in tests or scripted title helpers.
- **Lagging**: Automations using Grok Build complete a sample prompt with streamed text; hooks install check shows installed when hooks are present.
- **Qualitative**: No support confusion of the form “Atmos said Cursor but Grok opened” after ship.

## Risks & Open Questions

- **Risk — PATH vs process environment**: Identity probe for freehand `agent` may see the API process PATH rather than the tmux shell PATH. Product requirement remains “real CLI”; TECH must pick the most faithful probe.
- **Risk — Grok compat hooks double-fire**: Grok may also load Claude/Cursor hook configs; mis-routing could show wrong tool brand. Primary install path must be Grok-native; dual-fire mitigation is TECH.
- **Risk — Always-approve interactive default**: Matches other Atmos built-in “yolo” presets but is aggressive. Users can override; document in settings.
- **Open (TECH)**: Exact interactive and headless flag strings; model list normalization; thought channel wiring; probe cache lifetime.
- **Risk — Grok billing private API**: M11 uses the same CLI chat-proxy billing endpoint the Grok CLI uses (`cli-chat-proxy.grok.com`); path/shape can change without public docs.

## Milestones

- **Phase 1 (ship)** — M1–M11: built-in + Cursor cmd migration + title/identity + automation streaming parser + hooks status + UI parity + AI usage quota provider.
- **Phase 2** — N1–N4 polish (icon, richer thought UX, auto-install, stronger pane pin).

## Resolved BRAINSTORM decisions

| Topic | Decision |
|-------|----------|
| Built-in id | `grok-build` |
| Display label | `Grok Build` |
| Canonical launch cmd | `grok` |
| Cursor built-in cmd | `cursor-agent` |
| Freehand bare `agent` | Real CLI identity; unknown → raw `agent` |
| Automation output | `streaming-json` + dedicated Grok parser |
| Hooks | In M1; status-only; PermissionRequest from `permission_prompt` and `elicitation_dialog` |
| AI usage | In scope (M11): `ai-usage` Grok provider via CLI billing JSON + `~/.grok/auth.json` |

# Brainstorm · APP-080: Terminal Agent Launch Probe

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

New Workspace and Automations configure a Terminal Agent through `WelcomeAgentSelector` and `TerminalAgentSelectorWithRunConfig`. The only structured launch controls are model and reasoning. Permission is one global YOLO string (`yoloParams`). Fast and session mode are not fields. The capability facts live in `resources/terminal-agents/builtin_agents.json` and were written once per agent, so several of them no longer match the CLI that is actually installed.

A full pass on 2026-10-08 checked all 17 built-ins. Fourteen were read from local `--help`. `kimi`, `kiro-cli`, and `openclaw` are not installed on this machine, so those three rows are official docs only. The matrix is in [reference/cli-capability-audit.md](reference/cli-capability-audit.md).

This is a follow-on to [APP-024](../APP-024_terminal-agent-run-config/PRD.md), which shipped model / reasoning / extra args. It does not reopen Agent Chat. Headless and Terminal keep their own catalog and argv. Chat's picker (agent, model, mode, permission, thinking, fast, context) is a different surface.

Who feels it: anyone starting a workspace or an automation who can set a model but cannot set the permission mode, effort, or fast behavior the CLI already accepts. Wrong manifest rows are worse than a missing control, because the UI offers a flag the CLI will reject (`amp --effort`).

## Goals (draft)

- Primary: the run-config UI should offer the launch controls each built-in CLI actually accepts, and should stop offering controls it does not.
- Secondary: model catalogs stay live. Reasoning menus should be per model when the CLI already knows the menu (Grok, Droid).
- Non-goal for this note: redesigning the welcome advanced options (workspace name, branch, GitHub, Linear). Those stay outside the agent picker.

## What the audit changed about the problem

The holes are not one missing flag. They are four different control shapes:

- **Closed launch enum.** Claude `--effort` and `--permission-mode`, Antigravity `--effort`, Grok `--reasoning-effort` and `--permission-mode`, Pi `--thinking`, Command Code `--permission-mode`.
- **Per-model menu.** Grok effort ids come from the model catalog. Droid prints reasoning sets inside `droid exec --help`. Kiro docs say `--effort` levels depend on the model and do not list them.
- **Encoded in another field.** Cursor puts `effort` and `fast` inside the model id. Droid fast is a `*-fast` model id, not a flag. Amp `--mode` selects the model itself (`low|medium|high|ultra`).
- **Not a launch flag.** Hermes `/reasoning` and `/fast`, OpenClaw `/fast`, Claude `/effort ultracode` and `/effort auto`. Pi `--mode` is an output format. Gemini 0.62.0 has approval modes and no thinking flag.

Concrete mismatches with the manifest today:

- Amp's reasoning arg is `--effort`. The installed CLI has no `--effort`. Its mode flag is the stand-in, and `--fast` is real.
- Antigravity, Command Code, Kiro, and OpenClaw can set reasoning or thinking. Atmos marks all four `none`.
- Codex reasoning is `model_reasoning_effort` via `--config`, not a dedicated flag. Atmos marks it `none`.
- Pi's help includes `max`. The manifest enum stops at `xhigh`.
- Droid and Grok reasoning are closed or per-model lists. Atmos stores a free-text manual field.
- Hermes accepts `-m/--model` at launch. `modelSupport` is `none`, and `model_flag_for_agent` skips `hermes`.
- Permission modes exist on Claude, Codex, Gemini, Antigravity, Devin, Droid (`--auto`), Cursor (`plan|ask`, `--auto-review`), Grok, Kimi (`--plan`), and Command Code. The manifest only stores the YOLO string.
- Kimi docs have `--yolo` and `--print` implies `--afk`. The manifest has no `yoloParams`.
- OpenCode 1.18.3 and Kilo 7.4.22 advertise `--auto` and `--variant`. OpenCode's manifest YOLO is still `--dangerously-skip-permissions`, which `opencode run --help` did not list.

## Options

### Option A — Correct the static manifest

Add the missing enums and fix the wrong args in `builtin_agents.json`. Bump `builtin_agents.meta.json`. The run-config dialog grows a permission control and a fast control only where the manifest says the flag exists.

**Pros**: Reviewable. Same path as APP-024. No new probe process.
**Cons**: Stale on the next CLI release. Cannot represent Grok's per-model effort menu or Cursor's bracket syntax without special cases.
**Unknown**: How many agents are worth a control if the enum is model-dependent and we only have a placeholder.

### Option B — Parse `--help` on the Computer

At agent-select time, run the installed CLI's help (and the existing model-list command) and build the picker from the text.

**Pros**: Tracks the binary the user actually has. Would have caught Amp's missing `--effort`.
**Cons**: Help text is not a schema. Claude's `/effort` levels are not the same list as `--effort`. Codex hides reasoning in a config key the help does not mention. Kiro's `--list-models` probe is already unverified against current docs.
**Unknown**: Cost of spawning 17 help processes, and how remote Computers do it.

### Option C — Manifest schema, live menus

The manifest names the controls and the argv mapping (flag, config key, model-id parameter, or "not launchable"). The existing model probe fills catalogs. Where a CLI already returns per-model effort (Grok models payload, Droid help parser), the reasoning menu comes from that payload. Permission, plan/ask, and fast stay manifest-backed.

**Pros**: Fixes the known wrong flags without pretending every CLI prints a stable enum. Matches how model lists already work.
**Cons**: Two sources of truth. A CLI can add `--fast` and Atmos will not show it until the manifest is updated.
**Unknown**: Whether Droid's help parser and Grok's model payload can share one "options menu" shape.

## Key forks in the road

- **Fork 1**: Static manifest vs live help parse vs hybrid. Decide in PRD. Option C is the one that fits the current model-list pipeline.
- **Fork 2**: Permission as its own structured field, or left in advanced args. The audit says most CLIs have a real mode enum, so a field is the product question. Decide in PRD.
- **Fork 3**: Fast as its own control, a model-id variant (Cursor, Droid), or hidden when the CLI has no launch flag (Hermes, OpenClaw, Claude 2.1.280). Decide in PRD.
- **Fork 4**: In-session slash commands. Hermes reasoning/fast and Claude `ultracode` cannot be argv today. Either omit them, or send them after TUI ready through the existing follow-up path. Decide in TECH.
- **Fork 5**: Agent Chat picker stays separate. Already checked. Do not wrap Terminal Agent in `ChatAgentConfigInput`.

## Open questions

- [ ] Does `claude --effort ultracode` work on 2.1.280, or is `ultracode` slash-only? Help choices omit it. Decide in TECH with a no-session flag check.
- [ ] Codex 0.160.0 help lists approval policies `on-request` and `never`. Docs also list `untrusted` and `on-failure`. Which set should the picker show? Decide in PRD.
- [ ] Is `kiro-cli chat --list-models` still a real command? It is missing from the 2026-10-05 headless flag table, and this machine has no binary. Decide in TECH after an install.
- [ ] OpenCode's manifest YOLO `--dangerously-skip-permissions` was not in `opencode run --help` for 1.18.3. Has it moved entirely to `--auto`? Decide in TECH.
- [ ] Gemini thinking stays out of Terminal Agent until the CLI grows a flag. Confirm in PRD as explicit non-scope.
- [ ] Kimi, Kiro, and OpenClaw rows need a local `--help` pass on a machine where they are installed before those manifest edits ship.

## References

- Audit: [reference/cli-capability-audit.md](reference/cli-capability-audit.md)
- Manifest: `resources/terminal-agents/builtin_agents.json`
- Arg builder: `crates/core-service/src/service/automation/agents.rs` (`build_run_config_args`, `model_flag_for_agent`)
- Prior product shape: [APP-024](../APP-024_terminal-agent-run-config/PRD.md)
- Execute-mode split that keeps this picker off Agent Chat: [APP-072](../APP-072_automation-execute-modes/PRD.md)

## Ready to promote

- Promote to PRD: which of model, reasoning, permission mode, plan/ask, and fast are user-facing, and the per-agent matrix of what the first release will show. State Gemini thinking and Hermes slash commands as in or out.
- Promote to TECH: manifest fields for permission modes and fast, the argv mapping (plain flag, `--config` key, model-id bracket), per-model effort menus for Grok and Droid, and the `amp --effort` correction. Keep Chat's picker out of the design.

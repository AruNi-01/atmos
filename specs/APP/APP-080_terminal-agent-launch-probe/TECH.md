# TECH · APP-080: Terminal Agent Launch Probe

> Technical Design · HOW. Implements PRD APP-080.

## Scope summary

Addresses M1–M7. N1 and N2 stay unimplemented until a local CLI capture exists. Permission, fast, plan, and slash-command effort are not designed here.

The Chat model popover is reused as a view. Terminal Agent keeps its own catalog probe, argv builder, and prefs file.

## Architecture overview

```text
apps/web
  TerminalAgentModelPopover          adapter, Terminal prefs, no Chat prefs
        │ uses
packages/ui
  PromptAgentConfigMenu              existing Chat popover view, data-in only
        │ wsRequest
apps/api  WsAction
  terminal_agent_models_get          existing
  terminal_agent_prefs_get / _set    new
        │
crates/core-service
  automation/agents.rs               catalog projection + argv
  agent_chat/terminal_prefs.rs       new file, same shape as chat prefs
resources/terminal-agents
  builtin_agents.json                effort contract per built-in
```

No new REST route. No change to `agent_chat_prefs_get` or `~/.atmos/config/agent/chat_prefs.json`.

## Module-by-module design

### resources/terminal-agents

`builtin_agents.json` is the launch contract. `reasoningSupport.mode` stays `none | enum | manual | encoded_in_model`. Add one value style, `config`, next to the existing `value` and `flag_only`.

| id | modelSupport | reasoningSupport |
| --- | --- | --- |
| claude | `manual` with no `modelList` (no catalog command) | already `enum` `--effort`: low, medium, high, xhigh, max. Do not add ultracode or auto |
| codex | `catalog` unchanged | `enum`, `arg` `model_reasoning_effort`, `valueStyle` `config`, options minimal, low, medium, high, xhigh |
| gemini | `manual`, no `modelList` | `none` |
| antigravity | `catalog` unchanged | `enum` `--effort`: low, medium, high, xhigh, max |
| devin, kimi, kiro, openclaw, hermes | leave as they are for this ship | leave as they are |
| amp | `none` | `none`. Delete the manual `--effort` row |
| droid | `catalog` unchanged | `enum` `--reasoning-effort`. Options are the fallback only: off, low, medium, high, xhigh, max. A model row's own list wins |
| opencode, kilocode | `catalog` unchanged | `none` |
| grok-build | `catalog` unchanged | `enum` `--reasoning-effort`: none, minimal, low, medium, high, xhigh, max. A model row's own list wins |
| commandcode | `catalog` unchanged | `enum` `--effort`: low, medium, high |
| pi | `catalog` unchanged | extend the existing `--thinking` enum with `max` |
| cursor | `catalog` unchanged | keep `encoded_in_model` |

Do not bump `builtin_agents.meta.json` for this change. The version bump rewrites user command overrides, and these edits do not change `cmd`, `params`, `interactiveParams`, `yoloParams`, or `yoloInteractiveParams`. Capability fields are read from the shipped manifest.

`model_flag_for_agent` in `crates/core-service/src/service/automation/agents.rs` already returns `--model` for the M3 agents that take a model flag. Leave Hermes, Amp, and OpenClaw unmapped.

### crates/core-service

**Argv** (`build_run_config_args`):

- `value` (default): existing behavior, push `arg` then the value.
- `flag_only`: existing behavior, push `arg` only.
- `config`: push `-c` and `model_reasoning_effort="<value>"` as one argument. Codex `exec` already accepts `-c` / `--config`. Do not invent a `--reasoning-effort` flag for Codex.
- `encoded_in_model`: do not push a reasoning flag. If the selected model id has no bracket suffix, append `[effort=<value>]`. If it already has brackets, set or replace the `effort` key and leave other keys (`context`, `fast`) as they were. If reasoning is empty, pass the model id through unchanged.

Effort value source, in order:

1. The selected `TerminalAgentOption.thinking` enum, when it is non-empty.
2. The manifest enum.
3. No effort argv, and the UI hides the submenu.

Reject a reasoning value that is not in the list that won. Amp with `mode: none` takes neither source, so a stored `--effort` value from an old run config is dropped instead of forwarded.

**Catalog projection** (`terminal_options_from` / `option_from_agent_model`):

Keep copying `AgentModel.thinking` onto `TerminalAgentOption`. Droid's help parser already fills that field; the popover reads it. Grok's line parser still sets `thinking: None`, so Grok uses the manifest enum until a later parser reads per-model levels. Do not drop thinking on the way to the web DTO.

**Prefs** — new `crates/core-service/src/service/agent_chat/terminal_prefs.rs`, wired from `agent_chat/mod.rs` the same way as `prefs.rs`.

Path: `~/.atmos/config/agent/terminal_prefs.json`. Honor `ATMOS_AGENT_CONFIG_DIR` the same way `agent_chat_prefs_path` does, but the file name is `terminal_prefs.json`.

```rust
pub struct TerminalAgentFavoriteModel {
    pub agent_id: String,
    pub model: String,
    pub label: String,
}

pub struct TerminalAgentLastPick {
    pub model: Option<String>,
    pub effort: Option<String>,
}

pub struct TerminalAgentPrefs {
    pub favorite_models: Vec<TerminalAgentFavoriteModel>,
    pub agents: HashMap<String, TerminalAgentLastPick>,
}
```

Normalize like chat favorites: trim, drop empty agent id or model, dedupe by `(agent_id, model)`, cap at the same length chat uses. `save_terminal_favorite_models` must not load or write `chat_prefs.json`. `save_terminal_last_pick` updates one map entry and preserves favorites.

### apps/api

Extend the existing settings router. Add two `WsAction` variants and `WsContract` rows in the same change:

- `terminal_agent_prefs_get` → input empty, output `TerminalAgentPrefs`.
- `terminal_agent_prefs_set` → input `{ favorite_models?, agents? }`, output the saved prefs.

A set call replaces only the keys that are present. Favorite writes do not clear `agents`, and a last-pick write does not clear favorites. Handler: `apps/api/src/api/ws/router/agents.rs` next to `handle_terminal_agent_models_get`. Register the action in `apps/api/src/api/ws/router/mod.rs`, `packages/api-types/src/ws/actions.ts`, and `packages/api-types/src/ws/contract/settings.ts`.

`terminal_agent_models_get` stays the catalog transport. No new probe action.

### packages/ui

`PromptAgentConfigMenu` is private inside `packages/ui/src/components/agents/prompt-input.tsx`. Extract it to `packages/ui/src/components/agents/prompt-agent-config-menu.tsx` and export it. `PromptInput` keeps calling it with the same props.

The component stays data-in. It does not import chat prefs, terminal prefs, or a WebSocket client. Callers pass `agents`, `models`, `favoriteModels`, `thinkingLevels`, `favoritesOpen`, and the callbacks.

Terminal passes `fastAvailable={false}` and a `contextLevels` list of length 0 or 1 so the fast chip and context control do not render. That is the existing `showEffortControls` / `showContext` behavior.

Extra args are an optional slot on the effort popover, rendered after the context row, the thinking slider, and the fast switch. Chat does not pass the slot, so its popover is unchanged. Terminal passes the current `extra_args` text and an `onExtraArgsChange` callback. The menu does not parse argv and does not know which product is calling it. When the slot is set, the thinking chip is shown even if `thinkingLevels` is empty, so an agent with no effort list can still open the popover and edit args. The slider itself stays hidden unless there are at least two levels. When the model pane has no selected row, the empty state shows that same chip. With a selected row, the chip stays on that row. Widen the popover only when the slot is present so the one-line input fits. Chat's width stays `13.75rem`.

### apps/web

New adapter `apps/web/src/features/agent/components/TerminalAgentModelPopover.tsx`.

- Agents: installed built-in Terminal Agents already shown by `TerminalAgentSelectorWithRunConfig`. Not the Chat registry.
- Models: `terminal_agent_models_get` for the active agent when `modelList.supported` is true. Map `TerminalAgentOption` to the popover's model option. Reload calls the same action with `refresh: true`.
- Effort: selected model's `thinking.options` when that list is non-empty, otherwise the manifest enum. Hide the effort slider when both are empty. The popover still opens for the extra-args field. Cursor shows the slider only for case 1 (`encoded_in_model` plus a per-model list).
- Favorites: `terminal_agent_prefs_get` / `terminal_agent_prefs_set`. Do not call `rememberFavoriteModels` or read `agent-composer-local-cache`.
- Last pick: on model or effort change, update the in-memory `TerminalAgentRunConfigInput` (`model`, `reasoning`) and persist `{ model, effort }` under that agent id.
- Extra args: the effort-popover slot uses the existing `runConfig.extraArgs` copy (`额外参数` / `Extra args`) and `parseExtraArgsText` / `joinExtraArgsText`. A valid edit writes `extra_args` on the current run config and does not write prefs or a saved template. An unterminated quote shows the existing invalid-extra-args error and does not replace the stored args. Reserved-flag conflicts still fail at `build_run_config_args`.
- Labels: pass the existing popover `labels` prop from `useTranslations`. Add terminal keys only for empty-catalog copy that Chat's "load models" wording would misstate. Update `apps/web/messages/en.json` and `zh.json`.

Wire the adapter into `apps/web/src/features/agent/components/TerminalAgentSelectorWithRunConfig.tsx`:

- Floating trigger (`absolute -left-3 -top-3` on New Workspace, and the inline Terminal composer trigger) opens the popover as the menu. Choosing a model selects that agent and closes it. The agent rail stays interactive. This replaces the agent-only list as the primary click target.
- The row settings control (`openRunConfig`) opens the same popover inline with the agent rail locked to that row. Remove the model `Input` / catalog `Select`, the reasoning `Input` / `Select`, and the extra-args `Input` from `TerminalAgentRunConfigDialog.tsx`. Keep the saved-template picker on that view. Extra args are edited only in the effort popover.
- Automations' panel variant renders the same inline popover for model and effort.
- Headless unsupported agents (M7): the rail is the same vertical tab list Chat passes as `agentTablist`. `AutomationSetup` already builds `disabledReason` from `unavailable_reason` when `executeMode === "headless"`. The attention-summary picker in `CodeAgentBehaviourSettingsSection.tsx` does the same. Pass that reason through on the agent option. The tab is `disabled`, wrapped so hover still works (a disabled button does not receive hover). The hover tooltip body is that reason, not `composer.agentLocked`. Supported tabs stay enabled, and the popover root is not disabled. Clicking a disabled tab does not call `onSelectAgent`. A favorite whose agent is disabled is not selectable; its hover shows the same reason. Terminal mode, the composer trigger, and New Workspace pass no headless `disabledReason`. The menu component does not learn automation rules.

`WelcomeAgentSelector` does not grow a second picker. It already delegates to `TerminalAgentSelectorWithRunConfig`.

Apply path is unchanged: `sanitizeRunConfig` then the existing spawn / automation runner, which calls `build_run_config_args`.

## Data model

Web run config stays `TerminalAgentRunConfigInput` in `apps/web/src/features/agent/lib/terminal-agent-run-config.ts`: `model`, `reasoning: { mode, value }`, `extraArgs`. Effort in the popover is `reasoning.value`. `reasoning.mode` is copied from the manifest mode that applied (`enum` or `encoded_in_model`).

```ts
type TerminalAgentPrefs = {
  favorite_models: { agent_id: string; model: string; label?: string | null }[];
  agents: Record<string, { model?: string | null; effort?: string | null }>;
};
```

Disk JSON uses the same snake_case keys. No database table and no migration.

## Transport

### WebSocket messages

`terminal_agent_models_get` is unchanged.

```ts
// terminal_agent_prefs_get
{ /* empty */ }
// output
{ favorite_models: [...], agents: { claude: { model: null, effort: "high" } } }

// terminal_agent_prefs_set
{ favorite_models?: [...], agents?: { codex: { model: "gpt-5.4", effort: "high" } } }
// output: full saved prefs
```

Prefs are per Computer, because the file lives in that Computer's `~/.atmos`. A remote session already talks to the remote server, so no extra routing field is required.

### REST

None.

## Security & permissions

Prefs contain agent ids and model ids only. Do not log argv that includes extra args, and do not put API keys in the prefs file. The existing Computer session auth on `/ws` covers the new actions. No new permission prompt.

## Rollout plan

1. Extract `PromptAgentConfigMenu` and keep the Chat caller green.
2. Add the manifest effort rows, `valueStyle: config`, the argv branches, and the Amp `--effort` removal. Unit-test argv before any UI change.
3. Add `terminal_prefs.rs` plus `terminal_agent_prefs_get` / `terminal_agent_prefs_set` and the `WsContract` rows.
4. Mount `TerminalAgentModelPopover` on the composer trigger and the row settings. Delete the built-in model and reasoning text inputs.
5. Confirm Chat favorites tests still read `chat_prefs.json` only.

No feature flag. The popover replaces the text fields in the same ship. Rollback is reverting the selector and argv commits together. Leaving the new prefs file on disk is harmless.

## Risks & tradeoffs

- **Tradeoff**: the popover is extracted rather than copied. A copied menu would drift the moment Chat changes search, favorites, or the effort submenu.
- **Tradeoff**: Codex effort uses `-c model_reasoning_effort="..."` because 0.160.0 has no dedicated effort flag. A future Codex flag can replace `valueStyle: config` without a UI change.
- **Tradeoff**: Grok's canonical seven levels are the menu until `grok models` prints per-model levels. A model that rejects `max` fails at launch. The intersection rule is already specified, so the parser can narrow the menu later without a new picker.
- **Risk**: Cursor bracket rewriting must not drop `context` or `fast` keys already present on the model id.
- **Risk**: an old saved run config can still hold a free-typed model. Launch may still pass it through `--model`. The picker no longer offers a way to type one. Do not delete saved templates during upgrade.
- **If this breaks in production, the rollback path is**: revert the web selector commit and the argv commit. Chat prefs are untouched, so Chat favorites cannot be corrupted by this ship.

## Dependencies & compatibility

- Depends on APP-024's `TerminalAgentRunConfigInput` and `terminal_agent_models_get`.
- Does not block another spec.
- External binaries: the CLIs named in M3. A missing binary keeps today's "not installed" row and does not open an empty catalog probe.
- `builtin_agents.meta.json` stays at version 2.

## Open questions

- [x] Agent-row settings lock the rail to that agent. The composer trigger does not.
- [x] Devin, Kimi, Kiro, Hermes, and OpenClaw wait for N1. No guessed parsers in this ship.
- [x] Headless keeps the picker interactive. Only unsupported left tabs are disabled, and hover shows `unavailable_reason`.

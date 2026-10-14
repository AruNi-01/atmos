# TEST · APP-080: Terminal Agent Launch Probe

> Test Plan · how we verify that Terminal Agent model and effort are chosen in the Chat model popover, stored apart from Chat, and launched as the audited argv. References PRD APP-080 and TECH APP-080.

## Test strategy

Argv, effort-list selection, and the two prefs files are deterministic. Prove them in `core-service` with fixture stdout and temp dirs. Do not spawn Claude, Codex, or any other CLI in CI.

The popover is an existing view. Prove the Terminal adapter passes Terminal agents, Terminal favorites, and `fastAvailable={false}` with `contextLevels` of length 0 or 1. Prove the extracted menu still hides Fast and Context under those inputs. `packages/api-types` contract completeness already fails the build when a new `WsAction` has no `WsContract` row; add the two prefs actions to that catalog.

No Playwright spec. A scripted welcome flow cannot see a real model catalog without the host CLIs, and the same rules are cheaper in Rust and Bun. User-facing wiring is an agent-browser pass on New Workspace plus one manual launch against an installed CLI.

- Unit: `cargo test -p core-service --lib` for argv, catalog projection, and `terminal_prefs`.
- Bun: adapter props, and the existing menu source checks after the extract.
- WebSocket: `packages/api-types` `WsContract` test, plus handler tests only if `apps/api` already has a router harness for `terminal_agent_models_get`. Do not add a REST test API.
- Exploratory agent-browser: New Workspace composer and the agent-row settings.
- Manual: one real launch, and a remote Computer only when a second machine is available.

## Coverage map

| PRD item | Scenario IDs                                 |
| -------- | -------------------------------------------- |
| M1       | S1, S2                                       |
| M2       | S3, S4, S5                                   |
| M3       | S6, S7, S8, S9                               |
| M4       | S10, S11                                     |
| M5       | S12, S13, S20                                |
| M6       | S14, S15                                     |
| M7       | S18, S19                                     |
| N1       | S16 (guard only; parsers stay unimplemented) |
| N2       | S17 (guard only; no invented variant enum)   |

## Execution map

Status stays `planned` until `atmos-specs-test-run`.

| Scenario | Level      | Expected tool                                                          | Target command / method                                                                                                                       | Fixture / data                                                                                               | Signals                                                                                                                                                                    | Status  |
| -------- | ---------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| S1       | Bun        | `bun test`                                                             | `apps/web/src/features/agent/components/TerminalAgentModelPopover.test.tsx` and `packages/ui/src/components/agents/prompt-input-view.test.ts` | Terminal agents fixture; Chat menu source after extract                                                      | popover props include agent rail data, models, favorites, effort; `fastAvailable` false; context list length under 2; no Fast or Context control                           | planned |
| S2       | Bun        | `bun test`                                                             | `TerminalAgentModelPopover.test.tsx`                                                                                                          | floating trigger vs row-settings render                                                                      | composer rail can change agent; row-settings rail is that row only; both use `PromptAgentConfigMenu`                                                                       | planned |
| S3       | Bun        | `bun test`                                                             | `TerminalAgentModelPopover.test.tsx`                                                                                                          | `modelList.supported: true`; fake `terminal_agent_models_get` models                                         | model rows render; no model text input; reload sends the same action with `refresh: true`                                                                                  | planned |
| S4       | Bun        | `bun test`                                                             | `TerminalAgentModelPopover.test.tsx`                                                                                                          | Claude: manual model, no `modelList`; Gemini: manual model, reasoning none                                   | empty model state; no text input; Claude has no reload; Claude effort levels are the manifest five; Gemini has no effort submenu                                           | planned |
| S5       | Bun + Rust | `bun test`, `cargo test -p core-service --lib`                         | adapter test; `build_run_config_args` tests in `crates/core-service/src/service/automation/agents.rs`                                         | Amp, OpenCode, Kilo, Gemini manifests                                                                        | effort submenu absent; argv has no effort flag                                                                                                                             | planned |
| S6       | Rust unit  | `cargo test -p core-service --lib service::automation::agents`         | `build_run_config_args` table                                                                                                                 | manifest rows named in S6                                                                                    | argv fragments below; no permission or fast flag added                                                                                                                     | planned |
| S7       | Rust unit  | `cargo test -p core-service --lib service::automation::agents`         | Amp case in the argv tests                                                                                                                    | Amp `reasoningSupport.mode` none; stored reasoning `--effort high`                                           | launch argv omits `--effort` and `high`; call succeeds                                                                                                                     | planned |
| S8       | Rust unit  | `cargo test -p core-service --lib service::automation::agents`         | effort-source tests                                                                                                                           | Droid option with its own thinking list; Grok option with `thinking: None`; a value outside the winning list | Droid uses the model list; Grok uses the manifest seven; rejected value returns `ServiceError::Validation` and no argv                                                     | planned |
| S9       | Rust unit  | `cargo test -p core-service --lib service::automation::agents`         | Cursor encoded-in-model cases                                                                                                                 | model ids with and without brackets; a model row with an empty thinking list                                 | bracket rewrite keeps `context` and `fast`; no separate reasoning flag; empty list leaves the id unchanged                                                                 | planned |
| S10      | Rust unit  | `cargo test -p core-service --lib service::agent_chat::terminal_prefs` | save/load with `ATMOS_AGENT_CONFIG_DIR`                                                                                                       | temp dir that already contains `chat_prefs.json`                                                             | `terminal_prefs.json` gains the favorite; `chat_prefs.json` bytes unchanged                                                                                                | planned |
| S11      | Rust unit  | `cargo test -p core-service --lib service::agent_chat::terminal_prefs` | partial set                                                                                                                                   | one favorite and two agent last-picks                                                                        | favorite set keeps `agents`; one last-pick set keeps favorites and the other agent; favorite record has no effort field                                                    | planned |
| S12      | Bun        | `bun test`                                                             | `TerminalAgentModelPopover.test.tsx`                                                                                                          | a saved template whose model differs from the popover pick                                                   | in-memory `TerminalAgentRunConfigInput.model` and `reasoning.value` update; saved template collection is not written                                                       | planned |
| S13      | Rust unit  | `cargo test -p core-service --lib service::automation::agents`         | custom-agent and stale model cases                                                                                                            | custom agent with `extraArgs`; built-in with a previously stored free-typed model                            | custom argv keeps extra args and has no invented `--model` catalog; stored model still passes through `--model`                                                            | planned |
| S14      | Rust unit  | `cargo test -p core-service --lib service::agent_chat::terminal_prefs` | path helper                                                                                                                                   | `ATMOS_AGENT_CONFIG_DIR` set; unset falls back beside `chat_prefs.json`                                      | file name is `terminal_prefs.json`; no routing field on the WS input                                                                                                       | planned |
| S15      | Rust unit  | `cargo test -p core-service --lib service::automation::agents`         | not-installed catalog path                                                                                                                    | agent whose binary is absent                                                                                 | options payload marks not installed; model-list command is not spawned                                                                                                     | planned |
| S16      | Rust unit  | `cargo test -p core-service --lib`                                     | manifest load of built-ins                                                                                                                    | shipped `builtin_agents.json`                                                                                | Devin, Kimi, Kiro, Hermes, OpenClaw keep their pre-APP-080 model and reasoning modes                                                                                       | planned |
| S17      | Rust unit  | `cargo test -p core-service --lib service::automation::agents`         | OpenCode and Kilo argv                                                                                                                        | reasoning omitted; a variant string is not in the manifest enum                                              | argv is `--model` only; effort submenu hidden                                                                                                                              | planned |
| S18      | Bun        | `bun test`                                                             | `TerminalAgentModelPopover.test.tsx`                                                                                                          | headless agent list: one `automation_supported: false` with `unavailable_reason`, one supported              | unsupported tab `disabled`; hover text is the reason; supported tab still selects; popover root stays enabled                                                              | planned |
| S19      | Bun        | `bun test`                                                             | `TerminalAgentModelPopover.test.tsx`                                                                                                          | favorite whose agent has `disabledReason`; Terminal-mode options with no `disabledReason`                    | favorite click does not select that agent; Terminal composer rail has no disabled headless tab                                                                             | planned |
| S20      | Bun        | `bun test`                                                             | `packages/ui/src/components/agents/prompt-input-view.test.ts` and `TerminalAgentModelPopover.test.tsx`                                        | Terminal slot set, including an agent with an empty effort list; Chat caller omits the slot                  | extra-args input is the last block in the effort popover; Chat source has no field unless the slot prop is passed; empty effort list still opens the popover for the field | planned |

`packages/api-types` `bun test packages/api-types/src/ws/contract.test.ts` must stay green after `terminal_agent_prefs_get` and `terminal_agent_prefs_set` are added to `WS_ACTIONS` and `WsContract`.

## Scenarios

### S1 — Composer button opens the Chat model popover without Fast or Context

- **Level**: Bun
- **Given**: the New Workspace floating trigger (`absolute -left-3 -top-3`) and the Terminal composer inline trigger, both mounted through `TerminalAgentSelectorWithRunConfig`.
- **When**: the trigger opens `TerminalAgentModelPopover`.
- **Then**: the menu receives Terminal agents, the probed models, Terminal `favoriteModels`, and the winning effort levels. `fastAvailable` is false and `contextLevels` has length 0 or 1, so the existing Fast chip and Context submenu do not render. The menu does not import chat prefs or a WebSocket client.
- **Signals**: adapter props; menu source still gates Fast on `fastAvailable` and Context on `contextLevels.length > 1`. `packages/ui/src/components/agents/prompt-input-view.test.ts` follows the extract to `prompt-agent-config-menu.tsx` and still passes.

### S2 — Row settings lock the agent; the composer rail does not

- **Level**: Bun
- **Given**: an agent row whose settings control calls `openRunConfig`, and the composer trigger from S1.
- **When**: each control opens the popover.
- **Then**: the row-settings menu is inline and its agent rail cannot switch to another agent. The composer menu's agent rail still changes the selected agent, and choosing a model selects that agent. Automations' panel uses the same inline popover. `WelcomeAgentSelector` does not mount a second picker.
- **Signals**: locked-rail prop or single-agent list on the settings render; interactive agent tab list on the composer render; one `PromptAgentConfigMenu` import in the selector.

### S3 — A catalog agent lists probed models and does not ask for a typed id

- **Level**: Bun
- **Given**: Codex (or any built-in with `modelList.supported`). `terminal_agent_models_get` returns two models.
- **When**: the popover opens and the user reloads.
- **Then**: those two models are the rows. There is no free-text model field. Reload calls `terminal_agent_models_get` with `refresh: true` and no new action name.
- **Signals**: rendered model ids; absence of the old model `Input`; WS action name.

### S4 — No catalog stays an empty model pane

- **Level**: Bun
- **Given**: Claude Code has no `modelList` command. Gemini has no `modelList` and no effort enum.
- **When**: each popover opens.
- **Then**: Claude shows the empty model state, no text input, and no reload. Claude's effort submenu is low, medium, high, xhigh, max, and does not include ultracode or auto. Gemini shows the empty model state and no effort submenu.
- **Signals**: empty-state copy from the Terminal i18n keys in `apps/web/messages/en.json` and `zh.json`; effort level list; reload control absent.

### S5 — No launch effort hides the submenu and adds no flag

- **Level**: Bun and Rust unit
- **Given**: Gemini, Amp, OpenCode, and Kilo have an empty winning effort list (no model thinking list and no manifest enum).
- **When**: the popover renders and a launch is built with a model set and reasoning omitted.
- **Then**: the effort control is hidden (`thinkingLevels.length` is not greater than 1). Argv contains `--model` for OpenCode, Kilo, and Gemini when a model is present, and no effort flag for any of the four.
- **Signals**: hidden submenu; argv snapshots.

### S6 — Closed launch contracts become argv

- **Level**: Rust unit
- **Given**: a run config with a model and an effort value inside the winning list. YOLO flags are applied by the existing launch path, not by `build_run_config_args`.
- **When**: `build_run_config_args` runs for each row.
- **Then**: the model and effort fragments are exactly these, and the result contains no permission, plan, sandbox, or fast flag.

  | Agent              | Model fragment                  | Effort fragment                                             |
  | ------------------ | ------------------------------- | ----------------------------------------------------------- |
  | claude             | none when model is empty        | `--effort` then `max`                                       |
  | codex              | `--model` then the id           | `-c` then the single string `model_reasoning_effort="high"` |
  | antigravity        | `--model` then the id           | `--effort` then `max`                                       |
  | droid              | `--model` then the id           | `--reasoning-effort` then the chosen level                  |
  | grok-build         | `--model` then the id           | `--reasoning-effort` then `xhigh`                           |
  | pi                 | `--model` then the id           | `--thinking` then `max`                                     |
  | commandcode        | `--model` then the id           | `--effort` then `high`                                      |
  | opencode, kilocode | `--model` then the id           | no effort argument                                          |
  | cursor             | `--model` then the rewritten id | no extra flag                                               |

- **Signals**: `Vec<String>` equality on those fragments. Codex must not emit `--reasoning-effort` or a bare `model_reasoning_effort` flag. `builtin_agents.meta.json` stays version 2.

### S7 — Amp drops a stored effort instead of sending `--effort`

- **Level**: Rust unit
- **Given**: Amp's manifest reasoning mode is `none` (the manual `--effort` row is gone). An old run config still has reasoning value `high`.
- **When**: argv is built.
- **Then**: the call succeeds. The argv does not contain `--effort` or `high`. Amp still has no `--model` flag.
- **Signals**: argv snapshot; `Result::Ok`.

### S8 — The model effort list wins, and an unknown level is rejected

- **Level**: Rust unit
- **Given**: a Droid `TerminalAgentOption` whose `thinking.options` are `low` and `high`, while the manifest fallback also contains `max`. A Grok option whose `thinking` is empty. A requested effort of `max` for Command Code, whose manifest list is only low, medium, high.
- **When**: the UI list is chosen and argv is built.
- **Then**: Droid's submenu and accepted argv use `low` and `high` only. Grok's submenu uses none, minimal, low, medium, high, xhigh, max, because `parse_grok_terminal_agent_options` still leaves `thinking` empty. Command Code `max` is `ServiceError::Validation` and produces no argv. A Grok model row that does carry a list replaces the manifest seven for that row only.
- **Signals**: option DTO `thinking.options`; error type; argv absent on rejection. Fixture stdout only, no `grok` binary.

### S9 — Cursor writes effort into the model id and keeps the other keys

- **Level**: Rust unit
- **Given**: three Cursor cases. (1) Model id `claude-opus` and effort `high`, and that row's thinking list contains `high`. (2) Model id `claude-opus[context=1m,effort=low,fast=false]` and effort `high`, with `high` in the row list. (3) A row whose thinking list is empty, effort stored as `high`.
- **When**: argv is built.
- **Then**: (1) `--model` value is `claude-opus[effort=high]`. (2) `--model` value still contains `context=1m` and `fast=false`, and `effort=low` is now `effort=high`. (3) `--model` value is unchanged and there is no `[effort=` suffix. None of the three push a reasoning flag.
- **Signals**: exact model argument strings.

### S10 — A Terminal favorite does not touch Chat prefs

- **Level**: Rust unit
- **Given**: `ATMOS_AGENT_CONFIG_DIR` points at a temp dir whose `chat_prefs.json` already contains one Chat favorite. Terminal prefs are empty.
- **When**: a Terminal favorite `{ agent_id: "grok-build", model, label }` is saved.
- **Then**: `terminal_prefs.json` contains that row. The Chat file's bytes are unchanged. `save_terminal_favorite_models` never opens `chat_prefs.json`. The web adapter does not call `rememberFavoriteModels`.
- **Signals**: file bytes; a test double or source assertion that the adapter's save path is `terminal_agent_prefs_set`.

### S11 — Favorites and last picks do not erase each other

- **Level**: Rust unit
- **Given**: prefs with one favorite and last picks for `claude` and `codex`.
- **When**: a set sends only `favorite_models`, then a later set sends only `agents.codex`.
- **Then**: the first response still has both agent entries. The second response still has the favorite and the Claude last pick, and the Codex model and effort match the patch. A favorite object is `agent_id`, `model`, and `label` only. Empty agent id or model is dropped. The same `(agent_id, model)` pair is stored once. Effort lives on `agents[id].effort`, not on the favorite.
- **Signals**: full prefs JSON returned by the set. Normalization matches chat's trim, drop-empty, and dedupe. Chat has no numeric cap today, so this test does not invent one.

### S12 — A popover edit updates the run config and leaves templates alone

- **Level**: Bun
- **Given**: a saved run-config template whose model is `old-model`, and a current run config.
- **When**: the user picks a catalog model and an effort in the popover.
- **Then**: the current `TerminalAgentRunConfigInput` has that model, `reasoning.mode` from the manifest (`enum` or `encoded_in_model`), and `reasoning.value` equal to the effort. The saved template list is not rewritten. `TerminalAgentRunConfigDialog` no longer has its own extra-args input.
- **Signals**: run-config object; saved-template store write count is zero.

### S13 — Custom extra args stay, and an old typed model can still launch

- **Level**: Rust unit
- **Given**: a custom agent with extra args `--foo bar` and no catalog. A built-in that supports `--model`, whose saved run config model is a free-typed id from before this ship.
- **When**: argv is built for each.
- **Then**: the custom argv includes `--foo` and `bar` and does not gain a fake model list. The built-in argv still contains `--model` and the stored id. Upgrade does not delete saved templates.
- **Signals**: argv snapshots; template fixture unchanged.

### S14 — Prefs are the session Computer's file

- **Level**: Rust unit
- **Given**: `ATMOS_AGENT_CONFIG_DIR` is set, then unset.
- **When**: the prefs path is resolved.
- **Then**: the set case joins that dir with `terminal_prefs.json`. The unset case uses the same directory as `agent_chat_prefs_path` and a different file name. `terminal_agent_prefs_get` input is empty. `terminal_agent_prefs_set` input is `{ favorite_models?, agents? }` and its output is the full saved prefs. Neither message has a computer-id field.
- **Signals**: path suffix; DTO shape in `packages/api-types`.

### S15 — A missing binary does not open an empty catalog probe

- **Level**: Rust unit
- **Given**: a catalog agent whose command is not on `PATH` in the test environment.
- **When**: terminal options are requested.
- **Then**: the payload reports the agent not installed. The model-list command is not spawned. The selector keeps today's not-installed row.
- **Signals**: options struct; no child process recorded by the test's command runner.

### S16 — Docs-only agents stay on their current manifest

- **Level**: Rust unit
- **Given**: the shipped built-in manifest.
- **When**: definitions for devin, kimi, kiro, hermes, and openclaw are loaded.
- **Then**: their `modelSupport` and `reasoningSupport` match the pre-change manifest. No new parser runs on guessed stdout. Hermes, Amp, and OpenClaw still have no `--model` mapping.
- **Signals**: manifest JSON fields; `model_flag_for_agent` returns `None` for those three ids.

### S17 — OpenCode and Kilo do not grow a made-up effort enum

- **Level**: Rust unit
- **Given**: OpenCode and Kilo remain `reasoningSupport.mode` none. Their probe fixture has models and no closed variant list.
- **When**: the popover model is selected and argv is built.
- **Then**: the effort submenu is hidden. Argv is `--model` plus the id only. N2 stays unimplemented.
- **Signals**: empty effort levels; argv snapshot.

### S18 — Headless disables the unsupported tab and explains it on hover

- **Level**: Bun
- **Given**: Automations Execute Agent is Headless. One agent has `automation_supported: false` and `unavailable_reason` "No non-interactive automation flags are configured for this agent." Another agent is supported. The picker is the Chat model popover.
- **When**: the panel renders and the pointer hovers the unsupported tab.
- **Then**: that left tab is disabled and does not call `onSelectAgent`. The hover text is the `unavailable_reason`, not `composer.agentLocked`. The supported tab still selects its agent and shows models and effort. The popover root is not disabled. The attention-summary agent picker uses the same tab disable and the same reason string.
- **Signals**: `disabled` on the unsupported tab only; tooltip or hover-popover text equals `unavailable_reason`; a selection callback count of zero for the disabled tab and one for the supported tab.

### S19 — A favorite cannot bypass a disabled headless tab

- **Level**: Bun
- **Given**: the same headless list, plus a Terminal favorite whose `agent_id` is the unsupported agent. A second render uses Terminal composer options that have no `disabledReason`.
- **When**: the user activates that favorite, then opens the composer rail.
- **Then**: the favorite does not select the unsupported agent, and its hover shows the same reason. The composer rail does not disable tabs for headless support. Automations Terminal mode does not either.
- **Signals**: `onSelectAgent` not called with the unsupported id; composer agent options have `disabled` false.

### S20 — Extra args live at the bottom of the Terminal effort popover

- **Level**: Bun
- **Given**: the Terminal adapter passes the extra-args slot with text `--foo bar`. One agent has two effort levels. Another has none. The Chat caller does not pass the slot.
- **When**: the effort popover opens for each case.
- **Then**: the Terminal popover's last block is the extra-args input, labeled with the existing `runConfig.extraArgs` copy, below the thinking slider when the slider is shown. The no-effort agent still opens that popover, and the slider is absent. Typing a valid change updates `extra_args` on the current run config and does not write a saved template. An unterminated quote shows the existing invalid-extra-args error and leaves the stored args in place. The Chat effort popover has no extra-args input, and its width stays the current effort-popover width.
- **Signals**: slot rendered only when passed; input order inside the effort popover; `extra_args` on the run config; Chat menu source without the field.

## Regression checklist

- [ ] `prompt-input-view.test.ts` still passes after `PromptAgentConfigMenu` moves to `prompt-agent-config-menu.tsx`. Chat can still pass `fastAvailable: true`.
- [ ] `cargo test -p core-service --lib service::agent_chat::prefs` still reads and writes only `chat_prefs.json`.
- [ ] `builtin_agents.meta.json` version is unchanged.
- [ ] YOLO flag strings in the manifest are unchanged, and `build_run_config_args` does not append them.
- [ ] Cursor bracket rewrite does not drop `context` or `fast`.
- [ ] Amp cannot emit `--effort`.
- [ ] A Terminal star does not call `agent_chat_prefs_set` or `rememberFavoriteModels`.
- [ ] Extra args that repeat `--model` or the agent's reasoning flag still fail validation.
- [ ] Argv that includes extra args is not written to logs.
- [ ] English UI strings added for the empty catalog are sentence case, and `zh.json` has the same keys in Chinese.

## Exploratory agent-browser checks

Run these after the selector is mounted, with the web dev server up. Load the installed `agent-browser` skill first, or run `agent-browser skills get core --full`. If the CLI is missing, follow `specs/references/agent-browser-setup.md` and record the check as `not_run`. A clean pass does not replace S1–S17.

1. Open New Workspace, click the composer button anchored at the top-left, and confirm the popover shows an agent rail, model search, and favorites. Confirm there is no Fast chip and no Context submenu.
2. Open an agent row's settings and confirm that popover stays on that agent while the composer popover can switch agents.
3. Star a model in the Terminal popover, reload, and confirm the star remains. Open the Agent Chat composer and confirm that model was not added to Chat favorites. The network log shows `terminal_agent_prefs_set` and does not show `agent_chat_prefs_set` for that star.
4. Select Claude Code and confirm the empty model state, an effort menu that includes max, no text input, and no reload.
5. Repeat the composer open at a narrow viewport and confirm the popover is not clipped and the composer can still be reached.
6. Watch the console for errors and for a failed `terminal_agent_models_get` or `terminal_agent_prefs_get`.
7. On an Automation whose Execute Agent is Headless, hover an agent the CLI cannot run headless. The left tab looks disabled, the hover text is the reason, and a supported agent in the same picker still opens its models.

## Acceptance criteria

- [ ] S1–S15 and S18–S20 pass at the level in the execution map.
- [ ] S16 and S17 pass as guards. N1 and N2 have no new parser or variant enum.
- [ ] Starring a Terminal model leaves `chat_prefs.json` byte-for-byte unchanged in S10.
- [ ] S6 argv table matches the launched arguments for every closed M3 row, including Codex `-c` with `model_reasoning_effort="<value>"` and Pi `--thinking max`.
- [ ] Amp argv from a stored effort does not contain `--effort`.
- [ ] The popover has no Fast chip, Context submenu, permission control, or mode control on the Terminal path.
- [ ] Headless leaves the picker usable. An unsupported agent is a disabled left tab whose hover shows `unavailable_reason`.
- [ ] Terminal effort popover shows the extra-args input at the bottom. Agent Chat's effort popover does not.
- [ ] No new REST route.
- [ ] `builtin_agents.meta.json` is still version 2.
- [ ] `bun test packages/api-types/src/ws/contract.test.ts` passes with the two new actions contracted.
- [ ] `atmos-specs-test-run` has filled Coverage Status with the exact commands and the agent-browser result.

## Manual verification steps

Automation does not install these CLIs and does not have a second Computer.

1. On a machine with Codex or Pi installed, pick a listed model and an effort from the New Workspace popover, start the terminal, and confirm the process argv contains that `--model` and the S6 effort fragment.
2. When a remote Computer session is available, save a Terminal favorite and confirm `terminal_prefs.json` appears under that Computer's agent config dir and not under the laptop's.

## Non-coverage

- Whether a vendor CLI accepts the argv. S6 checks the arguments Atmos builds. A live spawn is the manual step above.
- N1 parsers for Devin, Kimi, Kiro, Hermes, and OpenClaw. S16 only guards that this ship does not guess them.
- N2 OpenCode and Kilo variants. S17 only guards that no fixed effort enum appears.
- Permission, plan, ask, sandbox, fast toggles, and slash-command effort.
- Welcome advanced options (name, branch, GitHub, Linear).
- Mobile.
- A second in-browser Playwright journey. The rules it would repeat are S1–S13.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`. Include exact automated tests, commands, agent-browser prompts and results when used, and remaining gaps.

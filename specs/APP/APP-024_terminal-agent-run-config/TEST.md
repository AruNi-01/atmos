# TEST · APP-024: Terminal Agent Run Config

> Test Plan · how we verify shared terminal-agent run settings across New Workspace, Automations, and Settings-managed saved templates. References PRD APP-024 and TECH APP-024.

## Test strategy

This feature spans shared capability discovery, saved-template management, web UI branching, interactive command building, and automation persistence / invocation. The cheapest reliable mix is:

- **Unit / integration**: adapter parsing, reserved-flag validation, argv builders, template normalization, and DTO normalization
- **Service-level**: terminal-agent capability and model-catalog responses from `apps/api` / `crates/core-service`
- **End-to-end**: New Workspace interactive launch handoff, Settings template management, and Automation save/run flows
- **Manual-only**: remote-Computer parity checks where different installed CLIs or auth states are hard to fake cheaply

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S2, S3, S5 |
| M2 | S2, S3 |
| M3 | S1 |
| M4 | S1, S2, S3 |
| M5 | S4, S9 |
| M6 | S2, S4 |
| M7 | S5 |
| M8 | S5, S6, S7 |
| M9 | S6 |
| M10 | S1, S3 |
| M11 | S4, S9 |
| M12 | S8 |

## Scenarios

### S1 — Happy path: user manages saved run-config templates in Settings / Code Agent

- **Level**: E2E (web settings)
- **Given**: Settings is open on the Code Agent section and built-in agent capabilities are available.
- **When**: the user creates a saved run-config template, edits it, and then deletes it.
- **Then**: the template list updates correctly, the saved template persists through `function_settings_get`, and deleting the template removes it from the reusable template picker without affecting existing automations.
- **Signals**:
  - `function_settings_get` returns `agent_cli.saved_run_configs`
  - settings UI shows the new template name and agent association
  - deleting the template removes it from the saved-template list after reload

### S2 — Happy path: New Workspace launches an interactive terminal from a saved template

- **Level**: E2E (web + Center Stage)
- **Given**: a saved run-config template exists for a built-in agent with live model catalog support, such as `cursor`.
- **When**: the user selects that template in the New Workspace flow, creates a workspace, and the first terminal opens.
- **Then**: the pending agent run carries structured run config derived from the template, and the launched terminal command includes the expected model / reasoning / advanced args while preserving interactive prompt behavior.
- **Signals**:
  - `pendingAgentRun.agentRunConfig` matches the selected template config
  - Center Stage launches a terminal with the expected command string
  - the created terminal label still matches the selected agent label

### S3 — Happy path: Automation uses a saved template as input but persists its own snapshot

- **Level**: Service-level + E2E
- **Given**: a saved run-config template exists for `claude`.
- **When**: the user selects that template in Automation setup, saves the automation, and later edits or deletes the saved template in Settings.
- **Then**: the automation continues to store and use its own run-config snapshot and is not silently rewritten by later template changes. The setup UI also exposes hover help that explains this snapshot behavior before save.
- **Signals**:
  - `automation.agent_config_json` is non-null in SQLite
  - changing or deleting the saved template does not mutate `automation.agent_config_json`
  - a later run still uses the automation's stored snapshot
  - the saved-template picker or adjacent structured-settings help icon shows the exact copy `Saved configs are starting templates. This automation saves its own agent run settings, so later changes to the saved config won't update this automation automatically.`

### S4 — Model-list failure degrades safely instead of blocking the flow

- **Level**: Service-level + integration
- **Given**: the selected built-in agent advertises live model listing, but the list-model command returns an auth-required or runtime error.
- **When**: the user opens the model control for that agent.
- **Then**: Atmos shows actionable failure copy and falls back to manual model input when that agent supports explicit model selection; the surrounding flow remains usable.
- **Signals**:
  - `terminal_agent_models_get` returns `status = "auth_required"` or `status = "error"`
  - the UI displays the returned message
  - the model input stays editable when the agent also supports explicit model selection

### S5 — Structured model / reasoning toggles can be disabled in favor of advanced args

- **Level**: Integration (web)
- **Given**: the selected built-in agent supports structured model and/or reasoning controls.
- **When**: the user turns the structured model or reasoning control off and enters equivalent native flags in `extra_args`.
- **Then**: the structured field is cleared from persisted form state, and the run can still be saved or launched using only advanced args.
- **Signals**:
  - turning off the toggle clears `model` or `reasoning` from the request payload
  - `extra_args` remain populated
  - invocation building succeeds with the native flags from `extra_args`

### S6 — Reserved or conflicting advanced args are rejected before launch or save

- **Level**: Unit + service-level
- **Given**: a user enters advanced args that conflict with Atmos-required prompt-delivery flags or duplicate a structured model / reasoning flag that is currently enabled.
- **When**: the user tries to save the automation, save the template, or launch the New Workspace run.
- **Then**: validation fails with a clear error, and no invocation is started.
- **Signals**:
  - validator returns a deterministic error message naming the conflicting flag family
  - `workspace-creation-store` does not queue a pending agent run for invalid settings
  - automation save is rejected with a validation error
  - template save in Settings is rejected with the same validation rules

### S7 — Custom agents remain usable through advanced args even without structured model support

- **Level**: Integration
- **Given**: `terminal_code_agent.json` contains a user-defined custom agent with no built-in adapter metadata.
- **When**: the user selects that custom agent in Settings, New Workspace, or Automation setup.
- **Then**: Atmos does not pretend to know its structured model / reasoning schema, hides unsupported structured fields, still allows advanced args, and launches or saves successfully when the args are valid.
- **Signals**:
  - capability payload for the custom agent reports `model_input_mode = "none"` and `reasoning_mode = "none"`
  - advanced-args field remains available
  - the final interactive or automation invocation includes the supplied advanced args

### S8 — Backward compatibility: legacy automation with only agent_id still runs

- **Level**: Service-level
- **Given**: an existing automation row created before APP-024 has `agent_config_json = NULL`.
- **When**: the automation is loaded, edited without touching agent settings, or run manually / on schedule.
- **Then**: it still uses the current default command behavior for that agent and does not require migration-time backfill.
- **Signals**:
  - `automation_get` returns a null or empty run-config object without error
  - invocation building succeeds
  - run history persists a snapshot only for new runs created after APP-024

### S9 — Remote Computer capability and model data come from the connected server

- **Level**: Manual or E2E with remote fixture
- **Given**: the browser is connected to a remote Atmos Computer whose installed agent CLIs or auth state differ from the local machine.
- **When**: the user opens Settings, New Workspace, or Automation agent settings.
- **Then**: the visible capabilities and live model catalogs reflect the remote Computer, and saved or launched settings are evaluated against the remote server's rules.
- **Signals**:
  - remote-only agents or remote auth failures appear in the UI
  - model-list results differ from the local machine in the expected way
  - automation validation is enforced by the connected server, not by stale local assumptions

## Performance & load budgets

- Live model-catalog probing times out in no more than 8 seconds.
- Cached model-catalog responses return in under 250 ms on the server.
- New Workspace, Automations, and Settings template forms remain interactive while a model-catalog request is pending or has failed.

## Regression checklist

- [ ] Existing default-agent launch from New Workspace still works when no run config is selected.
- [ ] Existing APP-017 automation runs still honor required non-interactive parser flags and prompt strategy.
- [ ] `terminal_code_agent.json` built-in command overrides still apply before per-run config is layered on top.
- [ ] Validation blocks reserved flags and structured-flag conflicts without blocking harmless advanced args.
- [ ] Remote Computer sessions do not accidentally use browser-local capability assumptions.
- [ ] Editing or deleting a saved template does not silently rewrite existing automation behavior.
- [ ] Automation setup explains snapshot semantics via hover tooltip before the user saves.

## Acceptance criteria

- [ ] Every Must Have PRD item has at least one passing scenario.
- [ ] Users can create, edit, and delete saved run-config templates from Settings / Code Agent.
- [ ] No supported-agent flow requires editing `terminal_code_agent.json` just to choose a non-default model for one run.
- [ ] Invalid or conflicting advanced args are rejected before launch/save.
- [ ] Existing automation definitions with no stored run config remain runnable.
- [ ] No new unconditional REST endpoint is introduced for this feature.
- [ ] Changed web and Rust test suites cover both interactive and automation invocation paths.

## Manual verification steps

1. Create a saved run-config template in Settings / Code Agent and verify it appears in both New Workspace and Automation setup.
2. Launch a New Workspace session from a saved template and confirm the first terminal uses the selected non-default model.
3. Create an automation from a saved template, then edit the template in Settings and confirm the automation still uses its stored snapshot.
4. Turn off structured model or reasoning fields and supply equivalent native flags through `extra_args`; confirm the run still works.
5. Connect to a remote Atmos Computer with a different set of installed agent CLIs and verify the UI reflects the remote capabilities.

## Non-coverage

- Code Review adoption, because it is explicitly deferred to post-M1 work.
- Full custom-agent capability hints in `terminal_code_agent.json`, because M1 treats custom agents as advanced-args-first.
- Surface adoption beyond New Workspace and Automations, because M1 intentionally limits scope there.

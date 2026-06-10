# Brainstorm · APP-024: Terminal Agent Run Config

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Atmos already lets users choose a terminal agent, but it does not give them one shared per-run way to choose:

- model
- reasoning / thinking depth
- advanced native CLI args
- reusable saved run-config templates

The current workaround is to edit `~/.atmos/agent/terminal_code_agent.json` or clone multiple custom agent entries with different flags. That is workable for one-off power-user tuning, but it breaks down as soon as the same problem appears in multiple product surfaces:

- APP-017 Automations need non-default models without mutating global built-in agent flags.
- The New Workspace flow launches an agent immediately after workspace creation and should be able to use a non-default model too.
- Future terminal-agent-backed surfaces such as Code Review should reuse the same capability instead of inventing their own agent-setting schema.

Some parts of the abstraction already have a natural home:

- static built-in agent capability facts can live in `resources/terminal-agents/builtin_agents.json`
- user-saved reusable run-config templates fit better in `function_settings.json` and the existing Settings / Code Agent UI
- per-run or per-automation selections remain runtime or object-specific data, not repo resources

The technical pressure is that Atmos already has two execution paths:

- New Workspace queues an interactive terminal launch in the web app, then Center Stage builds and runs the command client-side.
- Automations resolve a non-interactive invocation server-side from the shared terminal-agent manifest.

The product therefore needs one user-facing concept that can compile into both interactive and headless launch modes.

## Goals (draft)

- Let users choose non-default model / reasoning settings for a specific run without editing global agent defaults.
- Let users save reusable Code Agent Run Config templates and manage them from Settings.
- Make the capability reusable across New Workspace, Automations, and future terminal-agent-backed surfaces.
- Keep advanced native CLI args available for power users without making them the only path.

## Options

### Option A — Surface-local fields in Automations only

Add `model`, `reasoning`, and `extra_args` only to APP-017 automation definitions. Leave New Workspace and other surfaces unchanged.

**Pros**:
- Fastest path to solve the immediate automation need.
- Minimal data-model churn outside APP-017.

**Cons**:
- Bakes the wrong abstraction into the product.
- Forces New Workspace and later surfaces to repeat the same work.
- Leaves saved reusable configs and Settings management unsolved.

**Unknown**:
- How long before the same request appears in Code Review or other terminal-agent surfaces.

### Option B — Shared run config + Settings-managed saved templates (recommended)

Introduce one reusable **Terminal Agent Run Config** concept:

- selected agent
- optional structured model field
- optional structured reasoning field
- optional advanced args
- saved reusable templates managed under Settings / Code Agent

Each surface asks the backend what the selected agent supports, then renders either a select, text input, or no control at all.

**Pros**:
- Matches the actual product shape: one capability, multiple surfaces.
- Keeps static built-in capability facts in `resources` and user-owned reusable templates in `function_settings.json`.
- Makes New Workspace, Automations, and future Code Review-style flows reuse the same config story.

**Cons**:
- More plumbing up front because interactive and headless paths both need to understand the config.
- Needs a deliberate anti-drift story between web-side interactive command building and server-side automation invocation building.

**Unknown**:
- How much structured capability support M1 should offer custom user-defined agents beyond advanced args.

### Option C — Full agent-native dynamic forms

Treat each agent CLI as its own mini platform. Atmos would expose agent-native fields such as `--profile`, provider selection, effort knobs, and any custom extension options through dynamic per-agent schemas.

**Pros**:
- Maximum flexibility.
- Could model Codex, Claude, Pi, Cursor, and others more faithfully.

**Cons**:
- Overkill for the current problem.
- Large maintenance burden because Atmos would need to keep pace with every CLI's evolving flag surface.
- Turns a shared agent picker into an increasingly agent-specific configuration system.

**Unknown**:
- Whether the maintenance cost is acceptable even for built-in agents, let alone user-defined custom agents.

## Key forks in the road

- **Fork 1 — Surface scope in M1**: Automations only vs. shared rollout to Automations and New Workspace. Recommended: ship both in M1.
- **Fork 2 — Static vs. user-owned data**: keep built-in capability metadata in `resources`, but keep user-saved run-config templates in `function_settings.json`, not `resources`.
- **Fork 3 — Template persistence**: save only a template id vs. save a per-object snapshot. Recommended: reusable templates seed the form, but automations persist a snapshot so later template edits do not silently rewrite behavior.
- **Fork 4 — Structured fields vs. advanced args**: users should be able to uncheck structured `model` / `reasoning` fields and drive those flags entirely through `extra_args` when they want full native control.
- **Fork 5 — Extra-args conflict policy**: if structured `model` or `reasoning` is enabled, the same flags must be blocked in `extra_args`; if structured fields are disabled, those flags can be supplied manually.

## Open questions

- [ ] How much structured capability support should M1 offer custom agents beyond advanced args only?
- [ ] Should model-catalog results be cached only in memory, or also persisted briefly to reduce repeated slow CLI calls?
- [ ] Should saved run-config templates be grouped only by `agent_id`, or also allow agent-agnostic templates later?
- [ ] After New Workspace and Automations, should Code Review be the next adopting surface?

## References

- Existing code:
  - `resources/terminal-agents/builtin_agents.json`
  - `apps/web/src/features/wiki/components/AgentSelect.tsx`
  - `apps/web/src/features/welcome/components/WelcomeComposerControls.tsx`
  - `apps/web/src/features/welcome/components/WelcomePage.tsx`
  - `apps/web/src/features/workspace/store/workspace-creation-store.ts`
  - `apps/web/src/app-shell/CenterStage.tsx`
  - `apps/web/src/features/automations/components/AutomationSetup.tsx`
  - `apps/web/src/features/settings/components/CodeAgentSettingsSection.tsx`
  - `apps/web/src/api/ws/settings-api.ts`
  - `apps/web/src/features/settings/store/function-settings-store.ts`
  - `crates/core-service/src/service/automation/agents.rs`
- Related specs:
  - [APP-017 Atmos Automations](../APP-017_atmos-automations/PRD.md)
  - [APP-015 Canvas Terminal Agent Integration](../APP-015_canvas-terminal-agent-integration/PRD.md)
- Operational pain point:
  - today the only durable workaround is duplicating agent definitions in `~/.atmos/agent/terminal_code_agent.json`

## Ready to promote

- Promote to PRD: one shared **Terminal Agent Run Config** capability that first ships in New Workspace and Automations.
- Promote to PRD: built-in static capability and list-model metadata belong in `resources/terminal-agents/builtin_agents.json`.
- Promote to PRD: reusable saved run-config templates belong in Settings / Code Agent and persist in `function_settings.json`.
- Promote to TECH: extract shared terminal-agent capability resolution out of APP-017's automation-specific resolver.
- Promote to TECH: automations save run-config snapshots, while New Workspace carries run config through a one-shot client-side handoff.

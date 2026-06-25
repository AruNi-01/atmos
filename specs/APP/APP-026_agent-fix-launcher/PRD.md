# PRD · APP-026: Agent Fix Launcher

> Product Requirements · WHAT and WHY. Settled direction for reusable Copy Prompt and Agent Fix actions across Atmos Web/Desktop.

## Context

- **Problem**: Atmos already exposes several prompt-backed "fix this" opportunities, but each surface handles them differently. Diff line comments can copy a prompt but cannot send it directly to an agent. PR reviewer comments in the PR modal show actionable feedback without an Agent Fix entry point. Failed GitHub Actions jobs show failure context but require the user to manually assemble a fix prompt.
- **Why now**: APP-024 established a shared terminal-agent run-config UI and command-building model. Center Stage already knows how to open terminal tabs and launch terminal agents. The missing layer is a reusable product interaction that lets any surface provide a prompt and ask Atmos to copy it or run it.
- **Related specs**:
  - [APP-024 Terminal Agent Run Config](../APP-024_terminal-agent-run-config/PRD.md)
  - [APP-005 GitHub Integration](../APP-005_github-integration/PRD.md)
  - [APP-013 Project-Level Review Session](../APP-013_project-level-review-session/PRD.md)

## Goals

1. **Primary**: Let users send contextual fix prompts directly to a terminal agent from any prompt-backed surface without hand-copying commands.
2. **Primary**: Keep a consistent Agent Fix interaction across diff comments, PR reviewer comments, and failed CI jobs while allowing each surface to choose the right visual form.
3. **Primary**: Reuse existing terminal-agent selection and run-config behavior so users do not learn another settings model.
4. **Secondary**: Make launched terminal tabs easy to identify by letting each source provide a custom tab title.

## Users & Scenarios

- **Primary persona**: Agentic Builder reviewing code, PR comments, and CI failures inside Atmos.
- **Secondary persona**: Workspace maintainer who wants consistent AI-assisted repair affordances across GitHub and local review workflows.

### Key scenarios

1. **Diff prompt to agent**: A user selects a line/range in a diff, adds a note, and clicks Agent Fix. Atmos opens a new terminal tab titled for the selected file/range and starts the selected agent with that prompt.
2. **PR reviewer comment fix**: A user opens a PR modal, navigates to Files changed, sees reviewer comments, and starts Agent Fix from a comment/thread without leaving the modal.
3. **Failed job fix**: A user opens a GitHub Actions detail modal and hovers a failed job row. The time label transforms into an Agent Fix action button. Clicking it starts an agent with workflow/job/step failure context.
4. **Safe copy-only path**: A user who does not want to launch an agent clicks Copy Prompt. Atmos copies the same source prompt without creating a terminal tab.
5. **Agent configuration**: A user opens the settings control on the toolbar or action button and changes agent, model, reasoning, or extra args for this launch surface.

## User Stories

- As a reviewer, I want to turn a diff or PR comment into an agent run, so that actionable feedback becomes code changes without manual prompt assembly.
- As a user debugging CI, I want to launch an agent from a failed job row, so that the agent receives the job context that was visible when I clicked.
- As a user with preferred agents and models, I want the Agent Fix control to use the same agent selector and run-config UI as the welcome composer, so that my choices feel consistent.
- As a repeat Agent Fix user, I want Atmos to default future Agent Fix controls to the last agent I used globally, so that I do not reselect the same agent on every surface.
- As a user with multiple simultaneous fixes, I want new terminal tabs to have source-specific titles, so that I can tell which tab belongs to which fix.
- As a cautious user, I want Copy Prompt to stay available and side-effect-light, so that I can inspect or paste the prompt myself.

## Functional Requirements

### Must Have

- **M1 · Shared Agent Fix action contract**: Atmos defines a reusable front-end contract for prompt-backed actions. Each source provides:
  - `getPrompt(): Promise<string>`
  - `contextId` and `contextScope` (`workspace` or `project`)
  - display labels for the action
  - optional `terminalTabTitle`
  - optional `terminalPaneLabel`
  - optional lifecycle callbacks such as `onCopied`, `onStarted`, and `onError`

- **M2 · Toolbar variant**: Atmos provides a reusable toolbar-style Agent Fix component for surfaces that can reserve a bottom action area. It includes:
  - a left settings button
  - a Copy Prompt action
  - an Agent Fix action
  - disabled/loading/error states
  - compact behavior that fits narrow modal and sidebar layouts

- **M3 · Action-button variant**: Atmos provides a reusable compact Agent Fix action button for surfaces where a full toolbar would be too heavy. The first M1 use case is failed GitHub Actions jobs, where hover/focus can replace a time/status affordance with an Agent Fix button.

- **M4 · Agent settings popover**: Both visual variants expose the same agent configuration behavior:
  - selected terminal agent
  - per-agent run config from APP-024
  - custom agents when available
  - empty state to connect/configure agents if none are available
  - no duplicate agent-selection UI invented for this feature
  - no source preview or prompt summary; users configure the agent, not the source

- **M5 · Copy Prompt behavior**: Copy Prompt resolves the same prompt that Agent Fix would send and writes it to the clipboard. It does not create a terminal tab. If a source must create a tracked prompt artifact before copy, that source owns the artifact lifecycle and exposes it through `getPrompt`.

- **M6 · Agent Fix terminal launch**: Agent Fix creates a new terminal tab by default, activates it, and launches the selected terminal agent with the resolved prompt and selected run config.

- **M7 · Custom terminal tab titles**: The calling source can provide the terminal tab title. Atmos must not force all Agent Fix launches into `Term - N` labels. Examples:
  - `Fix diff: src/foo.ts`
  - `PR #123 review fix`
  - `Fix CI: test`

- **M8 · Source-specific prompt ownership**: The shared component does not know how to build prompts for diff comments, PR comments, or CI failures. Each feature owns prompt text, source metadata, and any domain-specific side effects.

- **M9 · Initial source coverage**: The first release wires the shared capability into:
  - diff inline prompt annotations currently backed by `DiffCopyAnnotation`
  - diff multi-comment merged prompts currently exposed as a copy-only stashed prompt chip
  - PR modal reviewer comments under Files changed / review comment threads
  - GitHub Actions detail modal failed jobs
  - existing Review Session fix toolbar may either keep its specialized lifecycle wrapper or adopt the shared toolbar if parity is preserved

- **M10 · Fallback and error handling**:
  - empty prompts do not launch agents
  - clipboard failure shows an error toast
  - missing workspace/project context disables Agent Fix and leaves Copy Prompt available when possible
  - terminal launcher unavailability falls back to copying the shell command or prompt with clear user feedback

- **M11 · Accessibility and keyboard support**:
  - toolbar and action-button variants are keyboard reachable
  - hover-only replacements also appear on focus
  - icon-only settings buttons have labels/tooltips
  - disabled controls explain why the action is unavailable

- **M12 · Global last-used Agent Fix agent**: Atmos remembers one global last-used Agent Fix agent id and defaults all Agent Fix controls to that agent when it is still available. It does not remember per-surface agent choices, and M1 does not persist per-surface run configs.

### Nice to Have

None for M1. The previously considered source preview, per-surface agent memory, command palette entry, and generic batch prompt feature are intentionally excluded. The existing diff multi-comment merged prompt flow is a Must Have under M9, not a Nice to Have.

## Out of Scope

- **Backend prompt service** — M1 is front-end orchestration around existing data and existing WS clients. It does not add a generic prompt-generation backend.
- **Agent Chat launch mode** — M1 targets terminal agents and terminal tabs, matching the user's requested flow.
- **Automatic patch application** — Agent Fix starts the agent; applying, reviewing, committing, and finalizing changes remain agent/user responsibilities.
- **Universal review-run lifecycle** — Code review's tracked `ReviewAgentRunModel` lifecycle remains source-owned and is not generalized in M1.
- **Mobile UI** — This is Web/Desktop first. Expo mobile adoption is out of scope.
- **Global terminal tab renaming feature** — M1 only needs launch-time custom titles for Agent Fix-created tabs.
- **Source preview in settings** — the settings popover is only for selecting/configuring the agent.
- **Per-surface Agent Fix preferences** — M1 stores one global last-used Agent Fix agent, not a separate choice for diff, PR comments, and CI jobs.
- **Command palette entry** — direct surface affordances ship first.

## Success Metrics

- **Leading**: Users can start an Agent Fix run from each M1 source without copying a prompt manually.
- **Leading**: New terminal tabs created by Agent Fix have source-specific titles in dogfood flows.
- **Leading**: Existing Copy Prompt behavior remains available in diff/review flows.
- **Qualitative**: Internal users describe Agent Fix as "same control everywhere" rather than three separate prompt flows.
- **Regression**: Existing Review Session fix runs still track status and artifacts correctly if they keep their specialized wrapper.

## Risks & Open Questions

- **Risk · Prompt quality variance**: CI failure prompts, PR review prompts, and diff prompts need different context. Keeping prompt ownership in each source avoids a generic lowest-common-denominator prompt builder.
- **Risk · Overloaded UI**: Full toolbar placement may be too heavy inside dense modals. M3's action-button variant is required, not optional.
- **Risk · Tab proliferation**: Always creating a new terminal tab is clear but can create many tabs. M1 chooses clarity; reuse/focus policies can be explored later.
- **Risk · Existing Review Session semantics**: Review Session fix runs create tracked artifacts and statuses. The shared toolbar must not erase that lifecycle.
- **Risk · Global default mismatch**: One last-used agent may not be ideal for every source type. M1 accepts that tradeoff to keep the behavior predictable and lightweight.

## Milestones

- **Phase 1 · Shared launcher foundation**: Build the shared action contract, terminal launcher, shared agent settings state, and launch-time terminal tab title support.
- **Phase 2 · Visual variants**: Ship toolbar and compact action-button variants with accessibility states.
- **Phase 3 · Initial integrations**: Wire diff annotations, PR reviewer comments, failed GitHub Actions jobs, and evaluate Review Session toolbar adoption.
- **Phase 4 · Hardening**: Add focused tests, narrow-layout checks, and manual smoke coverage across workspace and project contexts.

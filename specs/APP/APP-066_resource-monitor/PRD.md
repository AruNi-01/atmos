# PRD · APP-066: Resource Monitor

> Product Requirements · WHAT and WHY. Settled direction for live Computer, Atmos, Project, and Workspace resource visibility.

## Context

- **Problem**: Atmos users cannot tell whether the Desktop shell, Atmos Server, or a particular Project or Workspace is responsible for high CPU or memory use without leaving the product and manually correlating operating-system processes.
- **Why now**: Atmos already owns terminal sessions, local-service attribution, Computer switching, and Relay transport. These are the minimum inputs needed to provide a trustworthy in-product view.
- **Related specs**: Builds on `APP-016_atmos-computer`, `APP-023_local-run-server-manager`, `APP-035_tanstack-query-data-layer`, `APP-048_api-types`, and `APP-049_api-client`.

## Goals

1. Let a user identify which Atmos-owned scope is consuming host CPU or memory.
2. Keep local and remote Computer boundaries clear.
3. Provide useful metrics without materially increasing idle Atmos overhead.
4. Represent attribution gaps explicitly instead of presenting guessed ownership as exact.

## Users & Scenarios

- **Primary persona**: an Atmos user running multiple terminals, agents, development servers, Projects, or Workspaces on one Computer.
- **High-usage diagnosis**: the user notices a slow or hot machine, opens the Resource Monitor, and identifies the dominant Workspace or Atmos component.
- **Remote diagnosis**: the user switches to a Relay-connected Computer and inspects that Computer's Server and Workspace consumption without seeing local Desktop costs mixed into it.
- **Attribution gap**: the user sees shared or unattributed usage as a separate row and understands that it is included in host totals.

## User Stories

- As a workspace owner, I want live CPU and memory grouped by Project and Workspace so that I can find runaway development workloads.
- As an Atmos user, I want Desktop shell and Server overhead separated from my workloads so that I can distinguish product overhead from project activity.
- As a remote Computer user, I want metrics to follow the selected Computer so that local and remote resource data are never confused.
- As a maintainer, I want monitoring to become interactive only while it is visible so that the monitor does not become a performance problem itself.

## Functional Requirements

### Must Have

- **M1 — Computer totals**: The active Computer exposes a timestamped live snapshot containing host CPU utilization, used and total memory, logical CPU count, and collection health.
- **M2 — Atmos-owned hierarchy**: The snapshot separates Atmos Server, shared Atmos runtime, Projects, Workspaces, terminal sessions, and unattributed Atmos-managed processes. Project totals include direct Project sessions and child Workspaces without counting a process more than once.
- **M3 — Local Desktop shell**: When running in Electron and inspecting the local Computer, the UI shows local shell CPU and memory grouped into main, renderer, GPU, utility, and other categories. Hosted web and remote Computer views do not fabricate this section.
- **M4 — Computer scope**: Metrics use the existing active Computer connection. Relay-connected Computers provide the same Server-side shape as local Computers, and switching Computers cannot retain stale metrics from the previous scope.
- **M5 — Visible-only live updates**: Opening the Resource Monitor starts interactive updates; closing it stops the interactive subscription. The first useful snapshot is available without waiting for the next periodic tick.
- **M6 — Honest state**: The UI distinguishes loading, stale, unsupported, and partial-attribution states. Unknown ownership remains visible in a shared or unattributed bucket.
- **M7 — Discoverable UI**: A configurable Footer item shows compact CPU and memory values and opens a popover containing the hierarchy and per-scope values. User-facing copy is localized in every web locale.
- **M8 — Terminal navigation**: An attributed terminal-session row is actionable. Selecting it navigates to the owning Project or Workspace, activates the exact Center Space and Terminal tab, focuses the matching panel, and plays a short blue locate pulse distinct from agent-attention state.
- **M9 — Diagnostic presentation**: The popover provides a clear Host summary, a useful client-side CPU/memory trend, aligned CPU and memory columns, and Name/CPU/Memory sorting without increasing Server sampling frequency.
- **M10 — Explainable scope totals**: Every Project and Workspace can explain its aggregate usage through exclusive terminal-session and non-session process groups. Project-direct resources appear before Workspaces. Attributed listening programs show their local ports without exposing PID, command line, environment, username, or absolute host paths.

### Nice to Have

- **N1 — Filter scopes**: Filter Project, Workspace, and terminal rows by name when the hierarchy is large.
- **N2 — Focus current Workspace**: Highlight and optionally pin the active Workspace at the top of the hierarchy.
- **N3 — Diagnostics detail**: An explicit diagnostics mode can reveal process counts and attribution reasons without exposing command lines by default.

## Out of Scope

- **Persistent history**: No database, long-term retention, or historical analytics in v1.
- **Alerts and enforcement**: No CPU/memory limits, process killing, notifications, or automatic remediation.
- **Exact OS isolation**: No cgroup, job-object, container, or launch-model migration.
- **Disk, network, GPU utilization, or energy impact**: v1 is CPU and resident memory only; the Electron GPU process is a grouping label, not GPU utilization.
- **Arbitrary process explorer**: Do not expose the full host process table, command lines, or unrelated user processes.
- **Process control from Resource Monitor**: Process and port rows are read-only. Stop/kill escalation remains owned by Local Services.
- **Mobile-specific UI**: Shared wire types may be consumed later, but v1 UI targets web and Desktop.
- **Local shell while viewing remote Computer**: The local Electron shell is not merged into a remote host hierarchy.
- **Cold terminal reconstruction**: A session that is no longer represented in the active frontend terminal store cannot be deep-linked by its ephemeral session ID; the UI must not guess a Center Space or panel.

## Success Metrics

- **Leading**: A user can identify the highest attributed Project or Workspace from the Resource Monitor without opening an external process tool.
- **Correctness**: Switching Computers or closing the popover never shows live values under the wrong Computer scope.
- **Navigation**: Selecting a live terminal row lands on the correct Workspace/Project, Center Space, Terminal tab, and panel without reusing the agent-attention signal.
- **Explainability**: Project memory and process-count totals reconcile with Project-direct plus Workspace totals, and Workspace totals reconcile with session plus non-session process buckets.
- **Performance**: Interactive and idle overhead stay within the budgets defined by TEST.md.
- **Qualitative**: Shared and unattributed rows make attribution limitations understandable rather than appearing as missing data.

## Risks & Open Questions

- **Risk — expected precision**: Process ancestry can break when workloads daemonize or are shared. The UI must label aggregates as attributed rather than claiming billing-grade accounting.
- **Risk — cross-platform variance**: Host metrics should work across supported platforms, while terminal subtree attribution may be best-effort.
- **Risk — information density**: The Footer popover may become crowded with many Workspaces; v1 uses collapsed hierarchy rows and scrolling.
- **Open for later**: Whether a dedicated Resource Monitor center-stage page is valuable after the Footer workflow ships.

## Milestones

- **Phase 1**: M1, M2, M4, M5 — Server sampler, attribution, and Computer-scoped WebSocket contract.
- **Phase 2**: M3 — Electron shell source.
- **Phase 3**: M6, M7 — localized Footer and hierarchy popover.
- **Phase 4**: M8, M9 — cross-Space terminal navigation, blue locate feedback, live Host trend, and sortable hierarchy.
- **Phase 5**: M10 — Project resources, Workspace non-session processes, session process drilldown, and cached Local Services port annotations.
- **Phase 6**: N1 and N2 after the dense hierarchy is exercised at scale.

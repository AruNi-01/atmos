# IMPROVEMENT · APP-018: ACP Protocol Upgrade — Operational Log

> Living progress record for post-implementation ACP behavior fixes. Complements the frozen planning quartet ([BRAINSTORM](./BRAINSTORM.md) → [PRD](./PRD.md) → [TECH](./TECH.md) → [TEST](./TEST.md)).

## Index

| Id | Title | Status | Date |
|----|-------|--------|------|
| [IMP-001](#imp-001--scope-agent-chat-history-by-current-cwd) | Scope Agent Chat history by current cwd | mitigated | 2026-05-27 |
| [IMP-002](#imp-002--add-context-filter-to-global-agent-sessions) | Add context filter to global agent sessions | mitigated | 2026-05-27 |

## IMP-001 · Scope Agent Chat history by current cwd

| Field | Value |
|-------|--------|
| **Date** | 2026-05-27 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | product correctness |

### Problem

When Agent Chat was opened inside a Project or Workspace context, the history popover called ACP `session/list` without `cwd`. Agents that support broad history listing could return sessions from unrelated directories, making the current context history noisy and potentially misleading.

### Root cause

The backend and REST client already accepted `cwd`, but the Agent Chat history hook did not pass the current Project/Workspace path into `useAcpSessionList`. Only the global `/agents` sessions page intentionally used the unscoped call.

### Solution

Project and Workspace Agent Chat history now passes the resolved current context path as `cwd` to ACP `session/list`. Global agent session management remains unscoped so users can still inspect all native sessions for an agent.

### Result

In contextual Agent Chat, listed ACP sessions are limited to the current Project or Workspace path when a path is available.

### Follow-ups

- [ ] Add browser-level coverage once Agent Chat history has a lightweight test harness.

## IMP-002 · Add context filter to global agent sessions

| Field | Value |
|-------|--------|
| **Date** | 2026-05-27 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | product correctness |

### Problem

The `/agents` session management view intentionally listed all native sessions for the selected ACP agent. After contextual Agent Chat became cwd-scoped, users also needed the global management page to narrow the ACP catalog by Project without losing the default all-sessions view. A Project can include the main checkout plus multiple Atmos workspace worktrees, while ACP `session/list` accepts only one `cwd`.

### Root cause

The global page called `useAcpSessionList` with only `registryId`, even though the shared hook and REST request already supported an optional `cwd`. Local smoke testing also showed that agents do not behave identically: Codex ACP narrows results by `cwd`, while Claude ACP can return mixed cwd rows for the same request. Because ACP does not accept multiple `cwd` values, Project-level history needs one request per selected Project/Workspace root.

### Solution

The global session toolbar now includes an All/Project selector to the left of the ACP agent selector. Selecting a Project reveals a Workspace multi-select. Atmos always includes the Project root, defaults to the 10 most recently visited Workspace roots, and calls ACP `session/list` once per selected root. After ACP returns, Atmos also applies each requested `cwd` filter locally so agents that ignore or loosely interpret `cwd` cannot leak unrelated sessions into the selected Project view.

### Result

Users can inspect all native sessions for an ACP agent or narrow the list to a Project plus selected Workspace roots from the `/agents` page, with consistent filtering across ACP agents.

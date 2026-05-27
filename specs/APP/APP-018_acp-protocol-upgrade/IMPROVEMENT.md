# IMPROVEMENT · APP-018: ACP Protocol Upgrade — Operational Log

> Living progress record for post-implementation ACP behavior fixes. Complements the frozen planning quartet ([BRAINSTORM](./BRAINSTORM.md) → [PRD](./PRD.md) → [TECH](./TECH.md) → [TEST](./TEST.md)).

## Index

| Id | Title | Status | Date |
|----|-------|--------|------|
| [IMP-001](#imp-001--scope-agent-chat-history-by-current-cwd) | Scope Agent Chat history by current cwd | mitigated | 2026-05-27 |

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

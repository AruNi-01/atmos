# IMPROVEMENT · APP-042: Disk Analyzer — Operational Log

> Living record of production issues, quality gaps, mitigations shipped, and follow-ups. Complements the frozen planning quartet ([BRAINSTORM](./BRAINSTORM.md) → [PRD](./PRD.md) → [TECH](./TECH.md) → [TEST](./TEST.md)); does not replace them.

**Related code**: `crates/core-engine/src/disk_analyzer/mod.rs`, `crates/core-engine/src/git/worktrees.rs`, `crates/core-service/src/service/disk_analyzer.rs`, `apps/web/src/features/disk-analyzer/`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After fixing a user-reported bug, reliability issue, quality regression, agent ergonomics gap, or deliberate product parity gap. |
| **Entry id** | `IMP-NNN` — zero-padded, monotonic in this file (next: **IMP-002**). |
| **Status** | `open` → `mitigated` → `closed` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH sections; link to TECH/PRD and paste only deltas. |
| **Versions** | If agent-facing behavior changes, note the relevant Skill / CLI / runtime version in the entry. |

---

## Index

| Id | Title | Status | Date |
|----|-------|--------|------|
| IMP-001 | Default scan covers machine git worktrees and agent homes | mitigated | 2026-08-13 |

---

## IMP-001 · Default scan covers machine git worktrees and agent homes

| Field | Value |
|-------|--------|
| **Date** | 2026-08-13 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | ergonomics |

### Problem

Default Disk Analyzer overview only showed Atmos-registered paths (`~/.atmos`, imported projects, Atmos.app). Linked git worktrees (Cursor/Codex extra checkouts, `git worktree add` copies) and code-agent session homes (`.cursor`, `.claude`, `.codex`, …) often dominate disk use but appeared as ordinary folders — or not at all — with no badge.

### Root cause

`is_workspace` came only from Atmos `WorkspaceService`. The engine never called `git worktree list`, and agent homes were not overview entries or `CLEANUP_HINTS` targets.

### Solution

Default scan **always** discovers linked worktrees under the user home and known agent homes. No extra toggle.

- `GitEngine::discover_linked_worktrees` walks for `.git` (skipping heavy trees), then `git worktree list` per unique repo; only linked worktrees (`.git` is a file) are returned.
- Agent homes (`~/.claude`, `~/.cursor`, `~/.codex`, … plus macOS Application Support for Cursor/Claude/Windsurf/Codeium) become measure-only overview tiles when not already covered (e.g. under `~/.atmos`).
- Uncovered linked worktrees get the same measure-only tiles. Already-covered paths are only badged.
- `DiskNode.is_git_worktree` / `is_agent_data`; badge priority: Atmos workspace > project > git worktree > agent data.
- Delete still uses trash. Git worktree delete copy notes that trash does **not** unregister git worktree metadata.

Scan-all (home walk) does not duplicate tiles; the same roots still badge children.

### Result

Default overview lists Atmos roots plus machine worktrees and agent data, labeled in Details / tooltip. Worktree/agent tiles stay measure-only so overview concurrency stays at 3 `du`s.

### Code / docs touched

- `crates/core-engine/src/git/worktrees.rs`
- `crates/core-engine/src/disk_analyzer/mod.rs`
- `crates/core-service/src/service/disk_analyzer.rs`
- `apps/web/src/features/disk-analyzer/`
- `apps/web/messages/en.json`, `apps/web/messages/zh.json`
- [TECH.md](./TECH.md), [TEST.md](./TEST.md)

### Follow-ups

- [ ] Manual smoke: default scan shows a Cursor/Codex worktree and `.cursor` / `.claude` with badges
- [ ] Confirm home-wide `.git` discovery stays acceptable on a large developer home

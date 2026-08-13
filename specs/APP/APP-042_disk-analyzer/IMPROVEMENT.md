# IMPROVEMENT · APP-042: Disk Analyzer — Operational Log

> Living record of production issues, quality gaps, mitigations shipped, and follow-ups. Complements the frozen planning quartet ([BRAINSTORM](./BRAINSTORM.md) → [PRD](./PRD.md) → [TECH](./TECH.md) → [TEST](./TEST.md)); does not replace them.

**Related code**: `crates/core-engine/src/disk_analyzer/mod.rs`, `crates/core-engine/src/git/worktrees.rs`, `crates/core-service/src/service/disk_analyzer.rs`, `apps/web/src/features/disk-analyzer/`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After fixing a user-reported bug, reliability issue, quality regression, agent ergonomics gap, or deliberate product parity gap. |
| **Entry id** | `IMP-NNN` — zero-padded, monotonic in this file (next: **IMP-005**). |
| **Status** | `open` → `mitigated` → `closed` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH sections; link to TECH/PRD and paste only deltas. |
| **Versions** | If agent-facing behavior changes, note the relevant Skill / CLI / runtime version in the entry. |

---

## Index

| Id | Title | Status | Date |
|----|-------|--------|------|
| IMP-001 | Default scan covers machine git worktrees and agent homes | mitigated | 2026-08-13 |
| IMP-002 | Overview first paint + grouping for worktrees / agent data | mitigated | 2026-08-13 |
| IMP-003 | Measure agent sessions only, not whole agent homes | mitigated | 2026-08-13 |
| IMP-004 | Cover Grok / OpenCode / Devin and other skill-listed agent session stores | mitigated | 2026-08-13 |

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

- [x] First-paint Atmos tiles before home-wide `.git` walk (IMP-002)
- [x] Group leftover worktrees / agent homes instead of flattening next to `.atmos` (IMP-002)
- [ ] Manual smoke: default scan shows a Cursor/Codex worktree and `.cursor` / `.claude` with badges

---

## IMP-002 · Overview first paint + grouping for worktrees / agent data

| Field | Value |
|-------|--------|
| **Date** | 2026-08-13 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | ergonomics |

### Problem

IMP-001 discovery ran a home-wide `.git` walk **before** the first overview placeholder, so `~/.atmos` / Atmos.app waited on the rest of the machine. Leftover worktrees and agent homes also sat as siblings of `.atmos`, crowding the first screen.

### Solution

- Wave 1: Atmos entries + agent homes (`exists()` only) → placeholder → measure.
- Wave 2: `discover_linked_worktrees` (full) appends uncovered worktrees and measures them.
- `assemble_overview` nests agent tiles under `atmos://disk-usage/agent-data` and worktrees under `atmos://disk-usage/git-worktrees`. Groups are loaded, not deletable.
- Drill-in uses `.git` file classification plus `discover_linked_worktrees_fast` (known agent worktree dirs only).

### Result

First chart paint is Atmos-shaped; worktrees appear when found. Agent/worktree clutter is grouped.

### Code / docs touched

- `crates/core-engine/src/git/worktrees.rs` (`discover_linked_worktrees_fast`)
- `crates/core-engine/src/disk_analyzer/mod.rs` (`.git` file classify)
- `crates/core-service/src/service/disk_analyzer.rs`
- `apps/web/src/features/disk-analyzer/`
- `apps/web/messages/en.json`, `apps/web/messages/zh.json`
- [TECH.md](./TECH.md), [TEST.md](./TEST.md)

---

## IMP-003 · Measure agent sessions only, not whole agent homes

| Field | Value |
|-------|--------|
| **Date** | 2026-08-13 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | ergonomics |

### Problem

Wave 1 measured entire agent homes (`~/.cursor`, `~/.claude`, `~/Library/Application Support/Cursor`, …). That mixed settings/extensions into “Agent data”, and `path_covered_by_entries` treated `~/.cursor/worktrees` as already covered so those checkouts never became Git worktree tiles.

### Solution

`agent_data_roots` is session directories only:

- Claude Code: `~/.claude/projects` (`CLAUDE_CONFIG_DIR`)
- Cursor: `~/.cursor/projects`, `~/.cursor/chats`
- Codex: `$CODEX_HOME/sessions`, `archived_sessions`
- Copilot CLI: `$COPILOT_HOME/session-state`
- Gemini CLI: `~/.gemini/tmp`
- Continue: `~/.continue/sessions`

Linked worktrees stay on `discover_linked_worktrees` / `~/.cursor/worktrees` / `$CODEX_HOME/worktrees`.

### Result

Agent data tiles are transcripts/chats. Cursor/Codex worktrees show up in the Git worktrees group.

### Code / docs touched

- `crates/core-engine/src/disk_analyzer/mod.rs`
- `crates/core-service/src/service/disk_analyzer.rs`
- `apps/web/src/features/disk-analyzer/lib/tree-adapters.ts`
- `apps/web/messages/en.json`, `apps/web/messages/zh.json`
- [TECH.md](./TECH.md), [TEST.md](./TEST.md)

---

## IMP-004 · Cover Grok / OpenCode / Devin and other skill-listed agent session stores

| Field | Value |
|-------|--------|
| **Date** | 2026-08-13 |
| **Status** | mitigated |
| **Reported by** | user |
| **Severity** | ergonomics |

### Problem

Disk Analyzer session roots only covered Claude / Cursor / Codex / Copilot / Gemini / Continue. Skill scan (`AGENT_SKILL_DIRS`) and builtin terminal agents also include Grok Build, OpenCode, Devin, Amp, Factory Droid, Pi, Kimi, Qwen, Cline, Goose, Crush, Hermes, OpenClaw, OpenHands, Mux, Junie, Command Code, CodeBuddy, Augment, Vibe, Kiro, Antigravity, Windsurf Cascade. Those session stores were invisible unless they happened to sit under a scanned parent.

### Solution

`agent_data_roots` now lists confirmed **session** directories for those agents (home / XDG / documented env overrides). Directory must `exists()`. Whole agent homes, `~/.opencode` skills trees, `~/.devin` plans, IDE Application Support, and VS Code extension task DBs are still not measured.

Worktree seed adds `$GROK_HOME/worktrees`. Home `.git` walk skip list includes the extra agent home names so discovery does not descend into them.

### Result

Installed Grok / OpenCode / Devin / Amp / Factory / … session dirs show under Agent data. Cursor/Codex/Grok worktrees remain a separate git-worktree pass.

### Code / docs touched

- `crates/core-engine/src/disk_analyzer/mod.rs`
- `crates/core-engine/src/git/worktrees.rs`
- `apps/web/src/features/disk-analyzer/lib/tree-adapters.ts`
- `apps/web/messages/en.json`, `apps/web/messages/zh.json`
- [TECH.md](./TECH.md), [TEST.md](./TEST.md)

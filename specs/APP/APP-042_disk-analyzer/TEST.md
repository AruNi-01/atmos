# TEST · APP-042: Disk Analyzer

## Test strategy

- **Unit (Rust)**: disk usage aggregation, hardlink dedup, project marking, prune totals, suggestions-before-prune, cancel flag, delete root containment / portable root refuse, trash error contract (no permanent fallback).
- **Unit (Bun)**: tree → ECharts adapters, filters (name/size/project; parent match keeps filtered children), sort.
- **Service/WS**: start scan returns `scan_id`; progress/completion unicasted to owner; delete requires `scan_id` + ownership (where harness allows).
- **E2E / agent-browser**: Management Center navigation, chart render, confirm dialog copy — exploratory if harness timing allows.
- **Manual**: large home scan smoke on Desktop/local Web.

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1 | S1 |
| M2–M4 | S2, S3, S4 |
| M5–M7 | S5 |
| M8–M9 | S6 |
| M10 | S7, S8, S7b, S7c |
| M11–M12 | S1, S9 |
| N1–N2 | S10 (optional) |
| N6 | S4 |
| IMP-001 worktrees / agent homes | S11 |

## Execution map

| ID | Level | Tool | Target | Status |
|----|-------|------|--------|--------|
| S1 | unit/web + exploratory | bun / agent-browser | Management entry + route | pending |
| S2 | unit | cargo | scan sizes on fixture | pending |
| S3 | unit | cargo | caches included; project mark | pending |
| S4 | unit | cargo | progress/cancel primitives | pending |
| S5 | unit | bun | sunburst/treemap adapter + drill path helpers | pending |
| S6 | unit | bun | filter project-only / min size / name | pending |
| S7 | unit | cargo | permanent delete removes file under allowed root | pending |
| S7b | unit | cargo | delete outside scan root rejected; filesystem root refused | pending |
| S7c | unit | cargo | trash mode: missing path fails (no silent permanent success) | pending |
| S8 | exploratory | agent-browser/manual | confirm dialog shows freed bytes | pending |
| S9 | unit | bun / messages | i18n keys present en+zh | pending |
| S10 | unit/manual | cargo/web | disk info + suggestions | pending |
| S11 | unit | cargo + bun | linked worktree discover + badges + agent cleanup hints | pending |

## Scenarios

### S1 — Management Center opens Disk Analyzer
- **Given** Management Center is available
- **When** user chooses Disk Analyzer
- **Then** route is `/disk-analyzer` and the Disk Analyzer page mounts
- **Signals**: active sidebar item; document title; page landmark

### S2 — Scan reports allocated hierarchical sizes
- **Given** a fixture tree with nested files of known lengths
- **When** the engine scans the root
- **Then** each directory size equals the sum of descendant **allocated** sizes (Unix: blocks×512; hard links counted once)
- **Signals**: `DiskNode.size` assertions; Unix hardlink fixture must not double-count
- **Note**: Logical `metadata.len()` alone is insufficient; hardlink / sparse cases distinguish allocated size.

### S3 — Caches included and Atmos roots marked
- **Given** fixture contains `node_modules` / `target` and a path matching a project root list
- **When** scan completes
- **Then** cache dirs appear in the tree and matching roots have `is_project=true`
- **Signals**: node paths present; `is_project` true only for marked roots

### S4 — Progress and cancel
- **Given** a scan is running
- **When** cancel is requested by the **session owner**
- **Then** walk stops and status becomes `cancelled` (or completed race is tolerated once)
- **Signals**: cancel flag honored in unit test; status enum

### S5 — Chart adapters
- **Given** a pruned `DiskNode` tree
- **When** mapped to ECharts sunburst and treemap datasets
- **Then** values match node sizes and names; drill path can rebuild breadcrumbs
- **Signals**: bun test equality checks

### S6 — Filters
- **Given** a mixed tree with project and non-project nodes
- **When** project-only + min-size + name filters apply
- **Then** only matching nodes remain (parents retained as needed for hierarchy); matching parents do **not** restore unfiltered children
- **Signals**: bun filter tests including parent-match empty children

### S7 — Delete modes
- **Given** a temp file path under a scan root
- **When** delete is invoked with `permanent=true` and `allowed_root=Some(root)`
- **Then** the file is removed from the filesystem
- **Signals**: cargo test with temp dirs

### S7b — Delete boundaries
- **Given** a path outside the scan root, or a filesystem root (`/`, drive root)
- **When** delete is invoked
- **Then** the operation fails (outside root / refuse root); target outside root remains
- **Signals**: cargo assertions on error strings + path still exists

### S7c — Trash failure contract
- **Given** trash backend cannot delete the target (e.g. missing path)
- **When** delete is invoked with `permanent=false`
- **Then** the call returns an error and does **not** report success or silently permanently delete
- **Signals**: cargo test expecting `Err`; path not created/removed as permanent success

### S8 — Confirm UI
- **Given** a selected node with size S
- **When** delete is clicked
- **Then** dialog shows path and estimated freed bytes; default is trash
- **Signals**: visible copy in UI

### S9 — i18n
- **Given** en and zh message files
- **When** Disk Analyzer keys are read
- **Then** both locales define Management Center label and page strings including `scanFailed` / `atmosProject` (zh localized, not English paste)
- **Signals**: key presence checks / manual spot check

### S10 — Disk info / suggestions (Nice)
- **Given** a completed scan
- **When** disk info is requested
- **Then** total/available bytes are > 0 on supported platforms; suggestions list may include known heavy dirs even when prune collapses them into `__other__`
- **Signals**: optional cargo/web assertions; `suggestions_computed_before_prune`

### S11 — Linked git worktrees and agent homes
- **Given** a fixture with a main git checkout plus a linked worktree, and an existing `.cursor` (or `.claude`) directory
- **When** the default disk analyzer scan / classify runs
- **Then** the linked worktree is discovered (main checkout is not listed as linked); uncovered worktrees and agent **session** dirs become overview tiles or badges; default overview nests them under Agent data / Git worktrees groups; whole agent homes are not measured; Grok/OpenCode/Devin/Amp/Factory session dirs are included when they exist; `is_git_worktree` / `is_agent_data` are exclusive of Atmos workspace; agent basenames have cleanup hints
- **Signals**: `discover_linked_worktrees_finds_extra_checkout_not_main`; `discover_linked_worktrees_fast_skips_home_and_hits_agent_dirs`; `extra_worktree_search_roots_includes_grok`; `scan_marks_gitdir_file_as_worktree_without_roots`; `agent_data_roots_only_existing_dirs`; `assemble_overview_groups_agent_and_worktree_entries`; `append_discovered_skips_covered_paths_and_labels_worktrees`; bun adapter flags + synthetic group delete guard + `dot_cursor` / `dot_grok` hint keys + `localizeAgentSessionName`

## Exploratory agent-browser checks

- Open `/disk-analyzer` from Management Center; verify layout does not overflow at 1280×720 and ~390×844.
- Start a small fixture scan if API available; confirm progress text updates.
- Toggle Sunburst ↔ Treemap; drill one level; breadcrumb back.
- Open delete dialog; ensure permanent checkbox is unchecked by default.

## Regression checklist

- [ ] Existing FS WS actions still work (`fs_list_dir`, `fs_delete_path`).
- [ ] Management Center other items unaffected.
- [ ] No new REST endpoints introduced for this feature.
- [ ] Disk analyzer progress is not broadcast to unrelated WS clients.

## Acceptance criteria

- M1–M12 implemented or explicitly deferred with PRD amendment.
- S2, S3, S5, S6, S7, S7b have automated coverage.
- Scan of a modest fixture completes with progress and renders a chart.
- Default delete path uses trash semantics; trash failures do not fall back to permanent.

## Non-coverage

- Exhaustive million-file performance benchmarking in CI.
- Every OS trash backend edge case / full trash-mode integration on headless CI (see Coverage Status).
- Remote Relay browser-local disk scanning.

## Coverage Status

_Updated 2026-07-22 during PR review fixes (REV-001–REV-018)._

| Scenario | Status | Evidence |
|----------|--------|----------|
| S2 scan aggregates + hardlink | covered | `cargo test -p core-engine disk_analyzer` — `scan_aggregates_child_sizes`, `hardlinks_counted_once` (Unix) |
| S3 caches + project mark | covered | `caches_are_not_skipped_and_projects_marked` |
| S4 cancel | covered | `cancel_flag_stops_scan` |
| S5 chart adapters | covered | `bun test apps/web/src/features/disk-analyzer/lib/tree-adapters.test.ts` |
| S6 filters/sort + parent-match | covered | same bun file — `name filter keeps descendants filtered` |
| S7 permanent delete | covered | `permanent_delete_removes_file` |
| S7b delete boundaries | covered | `delete_outside_scan_root_rejected`, `delete_refuses_filesystem_root` |
| S7c trash failure contract | covered (unit) | `trash_delete_does_not_fallback_to_permanent` — asserts `Err`, no silent permanent success |
| S10 suggestions before prune | covered | `suggestions_computed_before_prune` |
| S11 worktree + agent marks | covered | `discover_linked_worktrees_finds_extra_checkout_not_main`; `discover_linked_worktrees_fast_skips_home_and_hits_agent_dirs`; `extra_worktree_search_roots_includes_grok`; `scan_marks_git_worktree_and_agent_data`; `scan_marks_gitdir_file_as_worktree_without_roots`; `agent_data_roots_only_existing_dirs`; `assemble_overview_groups_agent_and_worktree_entries`; `append_discovered_skips_covered_paths_and_labels_worktrees`; bun `echarts adapter flags git worktree and agent data`; bun `synthetic group paths localize and cannot be deleted` |
| S1 / S8 / S9 | partial | Management Center + i18n keys wired (`scanFailed`, `gitWorktree`, `agentData`); UI exploratory not_run in this environment |
| Trash-mode happy path on real Desktop trash backend | **partial / gap** | Headless CI lacks a reliable trash backend; S7c covers failure contract only. Full `permanent=false` success remains manual/desktop. |

Commands run:

```bash
cargo test -p core-engine disk_analyzer
cargo test -p core-service disk_analyzer
cargo clippy -p core-engine -p core-service -p api -- -D warnings
bun test apps/web/src/features/disk-analyzer/lib/tree-adapters.test.ts
cd apps/web && bun run typecheck
```

Remaining gaps: Playwright/agent-browser smoke for Management Center → chart → delete dialog; end-to-end trash success on a desktop session.

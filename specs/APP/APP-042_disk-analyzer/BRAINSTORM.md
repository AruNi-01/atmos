# Brainstorm · APP-042: Disk Analyzer

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

Agentic builders accumulate large caches, build artifacts, `node_modules`, target dirs, and old worktrees on the local machine. Atmos already knows project and workspace paths, but today users leave the product to run `du`, DaisyDisk, or Finder to find what is consuming disk. Management Center already hosts machine-local tools (Workspaces, Skills, Automations); Disk Analyzer fits as a local-only inspection and cleanup surface.

Current workaround: external disk tools + manual `rm`/`trash`, with no Atmos project/workspace awareness.

## Goals (draft)

- Primary: let users scan a local path, see hierarchical disk usage, and safely reclaim space — especially Atmos project/workspace directories and common developer caches.
- Secondary: surface free-space context and lightweight cleanup suggestions so the tool feels proactive, not only diagnostic.

## Options

### Option A — Management Center module over Atmos Server WS
Ship a `/disk-analyzer` view opened from Management Center. Rust in `core-engine` walks the filesystem (parallel disk-usage scan), API broadcasts progress over WebSocket, web renders Sunburst/Treemap with ECharts. Deletion goes through the same local server (trash-first).

**Pros**: Works for Desktop and local Web the same way; reuses existing Management Center + WS patterns; project/workspace marking can use existing DB paths.
**Cons**: Large trees need pruning/streaming; remote Relay use is awkward (scanning the *server* disk, not the browser machine).
**Unknown**: How aggressive visualization pruning must be for multi-million-file homes.

### Option B — Tauri-only native commands
Scan and delete only via Desktop Tauri `invoke` + events; skip web/API.

**Pros**: Strongest local FS permissions story; no WS payload size concerns for remote clients.
**Cons**: Leaves browser/local-web users without the feature; duplicates FS capability already owned by Atmos Server; harder to share logic with CLI later.
**Unknown**: Whether Desktop fs scope alone is enough for home-directory scans.

### Option C — Thin wrapper around an external CLI (`dust` / `dua` / `ncdu`)
Shell out, parse text/JSON, visualize in UI.

**Pros**: Fast to prototype visualization.
**Cons**: Fragile parsing, weaker progress, harder project tagging, delete UX still custom, dependency/packaging cost.
**Unknown**: Stable machine-readable output across versions/OSes.

## Key forks in the road

- **Transport**: Tauri-only vs Atmos Server WebSocket — decide in PRD (lean A for product consistency).
- **Size metric**: apparent size vs allocated disk usage (`st_blocks`) — decide in TECH (requirement asks for disk usage).
- **Tree payload**: full JSON vs pruned visualization tree + server-held scan session — decide in TECH.
- **Delete default**: trash vs permanent `rm` — decide in PRD (trash default, permanent opt-in).
- **Cache dirs**: skip vs include — decide in PRD (include; developers need them).
- **Remote Relay**: hide, warn, or allow scanning remote computer disk — decide in PRD.

## Open questions

- [x] Entry point — Management Center item (and optional global search). Decide in PRD.
- [x] Default scan root — home directory, with user-selectable path. Decide in PRD.
- [ ] Max practical tree depth / sibling fan-out for ECharts without freezing UI — decide in TECH.
- [ ] Whether free-space gauge and cleanup suggestions are Must Have or Nice to Have — decide in PRD.
- [ ] Permanent delete confirmation strength (typed path vs checkbox) — decide in PRD.

## References

- Existing code: `apps/web/src/app-shell/LeftSidebarManagementCenter.tsx`, `apps/web/src/app-shell/center-stage-support.tsx`, `crates/core-engine/src/fs/mod.rs`, `apps/api/src/api/ws/router/fs.rs`, `apps/api/src/api/ws/router/local_model.rs` (long-running progress pattern)
- Related specs: `APP-017_atmos-automations` (Management Center entry + WS feature), `APP-016_atmos-computer` (local vs remote computer)
- External: Apache ECharts sunburst/treemap, `jwalk`, `rayon`, `trash` crate

## Ready to promote

- Promote to PRD: Management Center Disk Analyzer; local scan with progress; Sunburst default + Treemap toggle; project/workspace highlight + filter; search/size/type filters; trash-first delete with optional permanent; include caches; i18n; free space + cleanup tips as Nice to Have.
- Promote to TECH: `core-engine` disk-usage walker; WS start/cancel/progress/tree/delete/disk-info; scan session pruning; ECharts feature module under `apps/web/src/features/disk-analyzer`.

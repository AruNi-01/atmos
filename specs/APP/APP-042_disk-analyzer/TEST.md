# TEST · APP-042: Disk Analyzer

## Test strategy

- **Unit (Rust)**: disk usage aggregation, project marking, prune totals, cancel flag, delete mode selection helpers.
- **Unit (Bun)**: tree → ECharts adapters, filters (name/size/project), sort.
- **Service/WS**: start scan returns `scan_id`; progress/completion notifications; delete response shape (where harness allows).
- **E2E / agent-browser**: Management Center navigation, chart render, confirm dialog copy — exploratory if harness timing allows.
- **Manual**: large home scan smoke on Desktop/local Web.

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1 | S1 |
| M2–M4 | S2, S3, S4 |
| M5–M7 | S5 |
| M8–M9 | S6 |
| M10 | S7, S8 |
| M11–M12 | S1, S9 |
| N1–N2 | S10 (optional) |
| N6 | S4 |

## Execution map

| ID | Level | Tool | Target | Status |
|----|-------|------|--------|--------|
| S1 | unit/web + exploratory | bun / agent-browser | Management entry + route | pending |
| S2 | unit | cargo | scan sizes on fixture | pending |
| S3 | unit | cargo | caches included; project mark | pending |
| S4 | unit | cargo | progress/cancel primitives | pending |
| S5 | unit | bun | sunburst/treemap adapter + drill path helpers | pending |
| S6 | unit | bun | filter project-only / min size / name | pending |
| S7 | unit | cargo | trash vs permanent flag path | pending |
| S8 | exploratory | agent-browser/manual | confirm dialog shows freed bytes | pending |
| S9 | unit | bun / messages | i18n keys present en+zh | pending |
| S10 | unit/manual | cargo/web | disk info + suggestions | pending |

## Scenarios

### S1 — Management Center opens Disk Analyzer
- **Given** Management Center is available
- **When** user chooses Disk Analyzer
- **Then** route is `/disk-analyzer` and the Disk Analyzer page mounts
- **Signals**: active sidebar item; document title; page landmark

### S2 — Scan reports allocated hierarchical sizes
- **Given** a fixture tree with nested files of known lengths
- **When** the engine scans the root
- **Then** each directory size equals the sum of descendant allocated sizes
- **Signals**: `DiskNode.size` assertions in `cargo test`

### S3 — Caches included and Atmos roots marked
- **Given** fixture contains `node_modules` / `target` and a path matching a project root list
- **When** scan completes
- **Then** cache dirs appear in the tree and matching roots have `is_project=true`
- **Signals**: node paths present; `is_project` true only for marked roots

### S4 — Progress and cancel
- **Given** a scan is running
- **When** cancel is requested
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
- **Then** only matching nodes remain (parents retained as needed for hierarchy)
- **Signals**: bun filter tests

### S7 — Delete modes
- **Given** a temp file path
- **When** delete is invoked with `permanent=false` vs `true`
- **Then** trash API vs remove API is selected accordingly (or file leaves filesystem in permanent mode)
- **Signals**: cargo test with temp dirs

### S8 — Confirm UI
- **Given** a selected node with size S
- **When** delete is clicked
- **Then** dialog shows path and estimated freed bytes; default is trash
- **Signals**: visible copy in UI

### S9 — i18n
- **Given** en and zh message files
- **When** Disk Analyzer keys are read
- **Then** both locales define Management Center label and page strings (zh localized, not English paste)
- **Signals**: key presence checks / manual spot check

### S10 — Disk info / suggestions (Nice)
- **Given** a completed scan
- **When** disk info is requested
- **Then** total/available bytes are > 0 on supported platforms; suggestions list may include known heavy dirs
- **Signals**: optional cargo/web assertions

## Exploratory agent-browser checks

- Open `/disk-analyzer` from Management Center; verify layout does not overflow at 1280×720 and ~390×844.
- Start a small fixture scan if API available; confirm progress text updates.
- Toggle Sunburst ↔ Treemap; drill one level; breadcrumb back.
- Open delete dialog; ensure permanent checkbox is unchecked by default.

## Regression checklist

- [ ] Existing FS WS actions still work (`fs_list_dir`, `fs_delete_path`).
- [ ] Management Center other items unaffected.
- [ ] No new REST endpoints introduced for this feature.

## Acceptance criteria

- M1–M12 implemented or explicitly deferred with PRD amendment.
- S2, S3, S5, S6, S7 have automated coverage.
- Scan of a modest fixture completes with progress and renders a chart.
- Default delete path uses trash semantics.

## Non-coverage

- Exhaustive million-file performance benchmarking in CI.
- Every OS trash backend edge case.
- Remote Relay browser-local disk scanning.

## Coverage Status

_Pending implementation / test-run._

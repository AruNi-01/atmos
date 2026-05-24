# QUALITY-001 Large File Code Debt Cleanup Test Plan

## Status

- Date: 2026-05-22
- Scope: regression gates for the large-file structural refactor documented in `TECH.md`
- Objective: prove that code movement did not change product behavior while keeping every audited source file under 1,000 lines

## Automated Gates

Run these before merging the cleanup branch:

```bash
cd apps/web && bun run typecheck
cd apps/web && bunx eslint \
  src/hooks/use-project-store.ts src/hooks/project-store-*.ts \
  src/hooks/use-editor-store.ts src/hooks/editor-store-*.ts \
  src/components/layout/CenterStage.tsx \
  src/components/layout/center-stage-support.tsx \
  src/components/layout/use-center-stage-named-terminal-visibility.ts
cargo check -p infra
cargo check -p core-engine
cargo check -p core-service
git diff --check
git diff -- crates/core-service/src/service/canvas_agent_relay.rs
```

Line-count gate:

```bash
find apps crates packages \
  -path '*/node_modules' -prune -o \
  -path '*/target' -prune -o \
  -path '*/.next' -prune -o \
  -type f \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' \) -print0 \
  | xargs -0 wc -l \
  | sort -nr \
  | head -80
```

Acceptance:

- No audited `.rs`, `.ts`, or `.tsx` file under `apps/`, `crates/`, or `packages/` is 1,000 lines or larger.
- TypeScript typecheck exits 0.
- Scoped ESLint exits 0 for touched web files.
- Rust crate checks exit 0 for touched crates. Existing warnings are acceptable only if they predate the cleanup and do not become errors.
- `git diff --check` exits 0.
- `crates/core-service/src/service/canvas_agent_relay.rs` remains unchanged.

## Manual Smoke Tests

### Center Stage

Given a project or workspace is open, when switching between file tabs, terminal tabs, Wiki, Project Wiki, and Code Review tabs, then the selected tab should remain URL-synced and visible content should match the tab.

Given a terminal deep link includes a tmux window target, when the app loads or the URL changes, then the owning terminal tab should become active and the target pane should receive focus.

Given a Project Wiki or Code Review named terminal does not exist, when opening its center-stage tab directly, then the app should redirect back to the terminal tab without crashing.

### Project Store

Given projects and workspaces are loaded, when creating labels, updating labels, pinning, reordering, archiving, visiting, and retrying setup steps, then UI state and persisted server state should match the pre-refactor behavior.

Given the WebSocket connection is not ready, when project-store actions wait for connection, then they should resolve or fail exactly as before the extraction.

### Editor Store

Given multiple files are open across contexts, when opening, pinning, closing, dirtying, saving, and restoring tabs, then active file paths, dirty flags, and storage-backed state should remain unchanged.

Given a file path is outside the workspace root or has unusual separators, when deriving tab labels and relative paths, then labels should match the pre-refactor behavior.

### Canvas Agent Bus

Given the Canvas agent invokes read operations, when calling `status`, `get_state`, `lint`, `set_status`, or `extract_text`, then returned payloads should be unchanged.

Given the Canvas agent invokes write operations, when applying a batch, setting viewport, or setting agent view, then shape updates and viewport state should match previous behavior.

### Settings And Welcome

Given Settings is opened, when checking desktop updates, checking CLI version, installing CLI, editing providers, and toggling settings sections, then toast states and persisted settings should behave as before.

Given Welcome composer is used, when typing `@` mentions and `/` slash commands, then search results, keyboard navigation, and selected insertions should match previous behavior.

### Rust Service Boundaries

Given review, skill, workspace, Git, tmux, and repo operations are exercised through existing API paths, when operations complete successfully, then response payloads, errors, and persisted data should be unchanged from before the module split.

## Residual Test Gaps

- Full end-to-end browser automation was not added in this cleanup wave.
- No new Rust unit tests were added for moved helper modules.
- Manual smoke tests should be prioritized before release because the refactor touched interactive UI, terminal, Canvas, and store orchestration code.

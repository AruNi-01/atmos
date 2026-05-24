# QUALITY-001 Large File Code Debt Cleanup

## Status

- Date: 2026-05-22
- Scope: repository-wide large source files under `apps/`, `crates/`, and `packages/`
- Goal: reduce all tracked TypeScript/TSX/Rust source files found by the audit command below to fewer than 1,000 lines
- Result: achieved for the audited source set; largest remaining file is `packages/ui/src/lib/dotmatrix-core.tsx` at 958 lines

## Audit Command

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

## Refactor Strategy

- Split large files along existing responsibility boundaries rather than inventing new abstractions.
- Preserve public APIs, store shapes, transport behavior, storage keys, SQL semantics, and user-visible copy.
- Prefer private helper modules/hooks/components colocated beside the original large file.
- Keep each worker scoped to a disjoint file family to avoid concurrent edit conflicts.
- Validate each wave with targeted typecheck/lint or crate checks, then rerun the global line-count audit.

## Major Files Reduced

| File | Before | After | Main extraction |
|---|---:|---:|---|
| `crates/infra/src/db/repo/review_repo.rs` | 978 | 28 | Session, revision, file, comment, and agent-run repo modules |
| `crates/core-engine/src/git/mod.rs` | 966 | 105 | Git refs, worktrees, actions, commits |
| `crates/core-service/src/service/skill.rs` | 968 | 144 | Skill scanner implementation |
| `crates/core-service/src/service/review/agent_runs.rs` | 983 | 433 | Revision and finalize-fix agent-run flows |
| `apps/web/src/components/canvas/canvas-agent-bus.ts` | 973 | 618 | Canvas bus read/apply/viewport operations |
| `apps/web/src/hooks/use-project-store.ts` | 962 | 658 | Project store connection, label, order, setup actions |
| `apps/web/src/hooks/use-editor-store.ts` | 948 | 697 | Editor store types, path helpers, state helpers |
| `apps/web/src/components/layout/CenterStage.tsx` | 943 | 897 | Named terminal visibility and project context helpers |
| `apps/web/src/components/layout/LeftSidebar.tsx` | 976 | 883 | Drag-and-drop handling hook |
| `apps/web/src/components/dialogs/SettingsModal.tsx` | 995 | 748 | Desktop/CLI update action hook |
| `apps/web/src/components/welcome/WelcomePage.tsx` | 989 | 823 | Mention and slash search hooks |
| `apps/web/src/components/skills/SkillsView.tsx` | 1016 | 490 | Installed, market, resources, empty-state components |
| `apps/web/src/components/layout/LlmProvidersModal.tsx` | 1031 | 563 | Provider modal sections and helpers |
| `crates/core-engine/src/tmux/mod.rs` | 1065 | 264 | Capture, install, locale, session, type modules |
| `apps/web/src/components/terminal/TerminalGrid.tsx` | 1057 | 789 | Terminal grid chrome, states, utilities, hooks |
| `crates/core-service/src/service/workspace.rs` | 1109 | 794 | Workspace management/support/todos modules |
| `crates/core-service/src/service/ws_message/workspace.rs` | 1019 | 771 | Workspace WebSocket helper modules |

## Current Largest Files

At completion of this cleanup wave, the largest audited files are:

| Rank | Lines | File |
|---:|---:|---|
| 1 | 958 | `packages/ui/src/lib/dotmatrix-core.tsx` |
| 2 | 945 | `apps/web/src/components/agent/use-agent-chat-session.ts` |
| 3 | 942 | `crates/infra/src/db/migration/m20260422_000019_create_review_tables.rs` |
| 4 | 939 | `apps/web/src/components/layout/UsagePopover.tsx` |
| 5 | 935 | `apps/cli/src/commands/canvas.rs` |
| 6 | 929 | `apps/web/src/components/run-preview/PreviewToolbar.tsx` |
| 7 | 927 | `apps/web/src/components/dialogs/AtmosComputerSection.tsx` |
| 8 | 926 | `crates/core-service/src/service/ws_message.rs` |
| 9 | 922 | `apps/web/src/api/ws-api.ts` |
| 10 | 919 | `crates/core-service/src/service/terminal.rs` |

No audited source file is at or above 1,000 lines.

## Verification

Final local verification:

```bash
cd apps/web && bun run typecheck
cd apps/web && bunx eslint \
  src/hooks/use-project-store.ts src/hooks/project-store-*.ts \
  src/hooks/use-editor-store.ts src/hooks/editor-store-*.ts \
  src/components/layout/CenterStage.tsx \
  src/components/layout/center-stage-support.tsx \
  src/components/layout/use-center-stage-named-terminal-visibility.ts
git diff --check
git diff -- crates/core-service/src/service/canvas_agent_relay.rs
```

Wave-level checks also passed for the touched Rust crates and earlier web slices:

```bash
cargo check -p infra
cargo check -p core-engine
cargo check -p core-service
cd apps/web && bun run typecheck
cd apps/web && bunx eslint <touched web files>
```

Known existing warnings remain in dependencies such as `infra`, `core-engine`, `agent`, and `ai-usage`; no verification failure was introduced by the cleanup.

## Residual Risks

- This was primarily structural refactoring. It used type/lint/check gates, not full manual UI or terminal behavior regression.
- The working tree contains many new helper files, so review should focus on preserving imports and module boundaries before commit.
- Several files remain close to the 1,000-line threshold. Future feature work should prefer extending the new helper modules instead of growing the original top-level files.
- `packages/ui/src/lib/dotmatrix-core.tsx` remains the largest file at 958 lines. It is a public UI-library core file, so any future split should preserve export compatibility carefully.

## Recommended Follow-Ups

- Add lightweight unit tests for extracted pure helpers where behavior is non-trivial, especially project/editor store helpers and canvas bus operations.
- Avoid adding new logic back into reduced top-level files; treat them as orchestration layers.
- Run focused manual smoke tests before release for Center Stage tabs, terminal tab focusing, project/editor stores, Canvas agent commands, and Settings update flows.

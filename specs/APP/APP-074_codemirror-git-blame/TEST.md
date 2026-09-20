# TEST · APP-074: CodeMirror Git Blame Hover

> Test Plan · how we verify line-level git blame, the hover commit card, skip/uncommitted behavior, and the default-on CodeMirror header setting. References PRD APP-074 and TECH APP-074.

## Test strategy

Rust owns porcelain parse, range coalescing, skip kinds, uncommitted `commit_hash: null`, and `git show --shortstat` parse. WS/API tests own DTO shape and skip-vs-error. Bun tests own settings default-on, independence from `gitIntegration`, query cache keys (no per-hover blame), i18n, and structural wiring (header switch, CM extension mount). Playwright is optional for the header toggle if a file-tab harness exists; otherwise Bun structural + agent-browser. Agent-browser explores the card (no dividers, sentence case) when a local editor is up.

- Unit / integration: `cargo test -p core-engine` blame fixtures.
- Service-level / WebSocket: `apps/api` git router + `@atmos/api-types` contract extract.
- Bun: editor settings store default, header/settings row, i18n, structural imports, cache helper.
- End-to-end (Playwright): only if `e2e/` can open a CodeMirror file tab against a fixture repo; otherwise defer and keep Bun + agent-browser.
- Exploratory agent-browser: card layout, settings gear, skip files.
- Manual-only: Relay large-file payload feel; real GitHub avatar (out of v1).

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2, S14 |
| M2 | S3, S4, S5 |
| M3 | S6, S16 |
| M4 | S7, S8, S9 |
| M5 | S10, S11 |
| M6 | S12, S13, S14 |
| M7 | S15 |
| M8 | S17, S18, S19 |
| N1–N7 | deferred |

## Execution map

This table is the hand-off from plan to implementation/testing. Keep `Status` as `planned` until `atmos-specs-test-run` updates Coverage Status after implementation.

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust | `cargo test` | `core-engine` blame on committed file | temp git repo, 2 commits | ranges cover lines; commits map has author + subject + hash | planned |
| S2 | Bun structural | `bun test` | `codemirror-git-blame` / `BaseCodeMirrorEditor` | sources | current-line widget / `Decoration.widget`; Compartment gated on `gitBlame` | planned |
| S3 | Rust | `cargo test` | `commit_detail` shortstat parse | `git show` fixture output | files_changed, insertions, deletions, body | planned |
| S4 | Bun | `bun test` | hover card builder / query enabled | SHA from blame cache | detail query **not** fired without hover SHA; card fields present | planned |
| S5 | Bun | `bun test` | copy hash control | card module | clipboard write; no `toastManager` success on copy | planned |
| S6 | Bun structural | `bun test` | blame tooltip DOM / classes | extension source | no `Separator`, no `border-t` / `divide-y` in card; `rounded-xl` or overlay radius | planned |
| S7 | Bun | `bun test` | `editor-settings-store` | store + settings-api type | `gitBlame` default `true`; missing key → true; update key `git_blame` | planned |
| S8 | Bun structural | `bun test` | `CodeMirrorEditor.tsx` header menu | editor source | Git blame row + `Switch` next to git integration in settings popover | planned |
| S9 | Bun | `bun test` | persist round-trip | mocked `functionSettingsApi.update` | toggle off then load → false | planned |
| S10 | Bun | `bun test` | independent flags | store | `gitBlame` true + `gitIntegration` false (and reverse) both representable | planned |
| S11 | Bun structural | `bun test` | gutter vs blame files | `codemirror-git-gutter.ts` vs blame | change gutter still `gitIntegration`-only; blame not mounted from gutter module | planned |
| S12 | Rust | `cargo test` | uncommitted line | worktree edit after commit | range `commit_hash` null; not in `commits` | planned |
| S13 | Rust | `cargo test` | skip kinds | binary / >1.5MiB or >10k lines / untracked | `kind` binary \| too_large \| untracked; empty ranges; not Err | planned |
| S14 | Rust / Bun | `cargo test` / `bun test` | dirty insert mapping | saved vs doc with inserted line | inserted line uncommitted; shifted committed line keeps SHA | planned |
| S15 | Bun | `bun test` | i18n | `en.json` + `zh.json` | `gitBlame` keys in both; zh not English copy; no ALL CAPS labels | planned |
| S16 | Bun structural | `bun test` | settings + card use `@workspace/ui` Switch/Button tokens | sources | header uses `Switch`; no raw checkbox | planned |
| S17 | Bun | `bun test` | cache / no per-hover blame | query options / hook | blame query key is file+head+saved hash; hover does not change blame key | planned |
| S18 | Rust | `cargo test` | coalesce | 10 lines same SHA | one range, not 10 | planned |
| S19 | WS / api-types | `bun run --filter @atmos/api-types test` | contract | extract fixtures | `git_file_blame` and `git_commit_detail` mapped; no REST git blame | planned |
| S20 | agent-browser | `agent-browser` | file tab + header gear | local web, fixture repo | annotation on current line; hover card no dividers; switch default on | planned |

## Scenarios

### S1 — Happy path: blame ranges for a committed file

- **Level**: Rust unit
- **Given**: a temp git repo with file `a.ts` committed in two commits (lines 1–3 commit A, lines 4–5 commit B).
- **When**: `GitEngine::file_blame` runs.
- **Then**: `kind` is `ok`; ranges cover 1–3 → A and 4–5 → B; `commits[A].subject` and `author_name` match; timestamps are unix seconds.
- **Signals**: assertion on `FileBlameInfo`.

### S2 — Current-line widget is wired in Source

- **Level**: Bun structural
- **Given**: `BaseCodeMirrorEditor` and the blame extension sources.
- **When**: inspected for decorations / compartments.
- **Then**: a current-line `Decoration.widget` (or equivalent widget) exists; the blame compartment is empty unless `gitBlame` is true and `gitDiffSource` is set.
- **Signals**: source contains widget + `gitBlame` gate; Live path does not mount it.

### S3 — Commit detail parses shortstat and body

- **Level**: Rust unit
- **Given**: a commit with a multi-line message and a known `--shortstat`.
- **When**: `commit_detail` runs.
- **Then**: `body` is the remainder after the subject; `files_changed` / `insertions` / `deletions` match git.
- **Signals**: parsed struct fields.

### S4 — Hover loads stats lazily

- **Level**: Bun
- **Given**: a blame cache with SHA `abc` and no hover target.
- **When**: the detail query options are built.
- **Then**: `git_commit_detail` is disabled (`enabled: false`) until a hover SHA is set; enabling it does not refetch `git_file_blame`.
- **Signals**: query `enabled` flag; blame query key unchanged.

### S5 — Copy hash is inline, not a success toast

- **Level**: Bun
- **Given**: the hash copy control used by the blame card.
- **When**: copy is invoked in a test (mocked clipboard).
- **Then**: clipboard receives the full hash; no success `toastManager.add`.
- **Signals**: clipboard mock; grep/toast assertion.

### S6 — Card has no divider lines

- **Level**: Bun structural
- **Given**: blame tooltip create() / card markup.
- **When**: scanned for separators.
- **Then**: no `Separator` import, no `border-t` / `divide-y` used as section rules; container uses popover background and overlay rounding.
- **Signals**: source scan.

### S7 — Setting defaults on

- **Level**: Bun
- **Given**: `useEditorSettingsStore` initial state and `loadSettings` with `editor: {}`.
- **When**: store is created / loaded with a missing `git_blame` key.
- **Then**: `gitBlame === true`.
- **Signals**: store field; `?? true` on `settings.editor?.git_blame`.

### S8 — Header gear contains Git blame

- **Level**: Bun structural
- **Given**: `CodeMirrorEditor.tsx` `renderEditorSettingsMenu`.
- **When**: the settings popover JSX is inspected.
- **Then**: a Git blame label + `Switch` bound to `gitBlame` / `setGitBlame` sits with the other editor switches (right-side header settings).
- **Signals**: `codeMirror.settings.gitBlame` key usage.

### S9 — Toggle persists off

- **Level**: Bun
- **Given**: mocked `functionSettingsApi.update`.
- **When**: `setGitBlame(false)` then a load that returns `git_blame: false`.
- **Then**: store is false; update was called with `('editor', 'git_blame', false)`.
- **Signals**: mock call args; store state.

### S10 — Independent of Git integration

- **Level**: Bun
- **Given**: the editor settings store.
- **When**: `gitBlame` and `gitIntegration` are set to opposite values.
- **Then**: both values stick; no setter overwrites the other.
- **Signals**: store snapshot.

### S11 — Change gutter unchanged

- **Level**: Bun structural
- **Given**: `codemirror-git-gutter.ts` and blame module.
- **When**: compared.
- **Then**: hunk bars / stage-restore remain gated only by `gitIntegration`; blame is a separate extension.
- **Signals**: no blame imports inside the gutter module; editor passes both flags separately.

### S12 — Uncommitted lines

- **Level**: Rust
- **Given**: a tracked file with an unsaved-to-index worktree line (append a line, no commit).
- **When**: `file_blame` runs.
- **Then**: that line’s range has `commit_hash: null`; `commits` has no null key.
- **Signals**: range list.

### S13 — Skip kinds are success

- **Level**: Rust
- **Given**: (a) a PNG or file with NUL, (b) a file over the cap, (c) an untracked file in a repo.
- **When**: `file_blame` runs.
- **Then**: `kind` is `binary` / `too_large` / `untracked`; `ranges` empty; function returns `Ok`, not `Err`.
- **Signals**: `FileBlameKind`.

### S14 — Dirty insert maps to Not Committed Yet

- **Level**: Rust and/or Bun
- **Given**: saved file blamed as commit A on line 2; editor inserts a new line at line 2.
- **When**: the line map is applied.
- **Then**: the inserted line is uncommitted; the old line 2 (now 3) still maps to A.
- **Signals**: mapping helper tests.

### S15 — i18n en + zh

- **Level**: Bun
- **Given**: `apps/web/messages/en.json` and `zh.json`.
- **When**: Git blame keys are read (`codeMirror.settings.gitBlame`, tooltip, Not Committed Yet, files changed / insertions / deletions).
- **Then**: both locales have the keys; zh surrounding words are Chinese; English labels are sentence case (`Git blame`, not `GIT BLAME`).
- **Signals**: JSON key presence + zh ≠ en for descriptive strings.

### S16 — Shared components for settings

- **Level**: Bun structural
- **Given**: header menu and Editor settings row.
- **When**: inspected.
- **Then**: they use `@workspace/ui` `Switch` (and `SettingsGroupRow` on the Settings page), not a native checkbox.
- **Signals**: imports.

### S17 — Cache / performance: blame not per hover

- **Level**: Bun
- **Given**: git blame query options.
- **When**: hover SHA changes from null → `abc` → `def`.
- **Then**: the `git_file_blame` query key does not include hover SHA; only `git_commit_detail` keys include the SHA.
- **Signals**: query-key factory unit test.

### S18 — Adjacent lines coalesce

- **Level**: Rust
- **Given**: ten consecutive lines from one commit.
- **When**: blame is parsed.
- **Then**: a single range `start_line=1, end_line=10`, not ten one-line ranges.
- **Signals**: `ranges.len() == 1`.

### S19 — WS contract, no REST

- **Level**: api-types
- **Given**: extracted actions after implementation.
- **When**: `check-actions` / contract tests run.
- **Then**: `git_file_blame` and `git_commit_detail` have `{ input, output }` in `GitContract`; no new git REST route is added for blame.
- **Signals**: `packages/api-types` fixtures + grep of `apps/api` HTTP routers.

### S20 — Exploratory: card and setting in the running editor

- **Level**: agent-browser
- **Given**: local web, a workspace file in git, Agent Browser instructions loaded (`agent-browser skills get core --full` or the installed skill).
- **When**: open the file tab, move the caret, hover the annotation, open the header gear.
- **Then**: current line shows a summary; hover card has author/message/hash without horizontal rules; Git blame switch is on.
- **Signals**: screenshots / DOM text; record in Coverage Status after test-run. Not a substitute for S1–S19.

## Performance & load budgets

- `git_file_blame` for a ≤2k-line source file: typically < 300ms local Computer (soft; skip rather than hang above caps).
- After cache: hover card (minus stats) < 50ms to show; stats may lag one `git_commit_detail`.
- Hover must not dispatch `git_file_blame` (S17).
- Skip: > 1.5 MiB or > 10_000 lines (S13).

## Regression checklist

- [ ] Git change gutter still stages/restores hunks when blame is on or off.
- [ ] Live markdown tabs do not mount blame.
- [ ] Header settings popover still has no extra `Separator` between existing rows.
- [ ] `function_settings_update` for other `editor.*` keys still works.
- [ ] Copy hash does not show a success toast.
- [ ] English labels stay sentence case.
- [ ] Relay/remote Computer: skip kinds still return `kind`, not a dropped WS frame.

## Exploratory agent-browser checks

Use after the first implementation pass. Load Agent Browser instructions first (installed skill or `agent-browser skills get core --full`). If unavailable, follow `specs/references/agent-browser-setup.md` and mark `not_run`.

1. Open a tracked source file in the center editor; confirm a current-line annotation.
2. Hover the annotation; confirm author, relative time, subject, hash; confirm **no** divider lines; confirm stats appear without replacing the whole card.
3. Open the header **right** gear; confirm **Git blame** is on; toggle off and confirm the annotation disappears; toggle on.
4. Narrow viewport (~390px): card not clipped off-screen in an unusable way; settings popover still scrollable (`max-h-[80vh]`).
5. Watch console / WS for blame-on-every-mousemove (should not happen).

## Acceptance criteria

- [ ] All Must Have PRD items (M1–M8) have at least one passing scenario at the declared level.
- [ ] No failing scenarios at the declared level.
- [ ] No new unconditional REST endpoints for git blame.
- [ ] Git blame setting defaults **on**; header gear contains the switch.
- [ ] `atmos-specs-test-run` has updated Coverage Status for implemented scenarios (this file’s Coverage Status is **not** pre-filled as implemented).
- [ ] `just lint` and targeted `cargo test -p core-engine` / `bun test` on touched editor/git files pass, or scoped alternatives are recorded.

## Manual verification steps

1. Open a real Workspace file you recently committed; hover the current line; confirm the card matches the `git log -1` for that line (`git blame -L n,n`).
2. Edit a line without saving; confirm Not Committed Yet on that line.
3. Disable Git blame in the header gear, reload, confirm it stays off.

## Non-coverage

- File-wide annotate gutter, heatmap, status bar (N2, N3, N5).
- Click-through to GitHub / Git History (N1).
- Mobile (N6).
- Live markdown / Diff / Wiki (N7).
- Gravatar / GitHub avatar fetch.
- `isomorphic-git` in the browser.
- Playwright against a full desktop Electron shell (web file tab is enough if E2E is added).

## Coverage Status

_Last run: 2026-09-15 · targeted `cargo test -p core-engine --lib` blame filters (twice) green; `bun test` APP-074 web files (twice) green; `bun run --filter @atmos/api-types test` green; `cargo clippy -p core-engine -p api -- -D warnings` green._

- S1 — ✅ `crates/core-engine/src/git/tests.rs::s1_file_blame_ranges_for_two_commits`
- S2 — ✅ `apps/web/src/features/editor/components/__tests__/code-mirror-git-blame.test.ts` (current-line widget + `gitBlame` gate)
- S3 — ✅ `crates/core-engine/src/git/tests.rs::s3_commit_detail_parses_shortstat_and_body`
- S4 — ✅ `apps/web/src/features/git/lib/__tests__/git-blame-query-keys.test.ts` (detail `enabled` requires SHA; blame key has no hover SHA)
- S5 — ✅ structural: `codemirror-git-blame.ts` uses `navigator.clipboard.writeText`, no `toastManager`
- S6 — ✅ structural: card `rounded-xl`, no `Separator` / `border-t` / `divide-y`
- S7 — ✅ `editor-settings-git-blame.test.ts` missing key → `gitBlame === true`
- S8 — ✅ header `CodeMirrorEditor.tsx` Git blame `Switch`; Settings `EditorSettingsSection` row
- S9 — ✅ `setGitBlame(false)` writes `('editor', 'git_blame', false)`
- S10 — ✅ `gitBlame` independent of `gitIntegration`
- S11 — ✅ `codemirror-git-gutter.ts` has no blame imports
- S12 — ✅ `s12_uncommitted_worktree_line_has_null_hash`
- S13 — ✅ `s13_skip_binary_too_large_and_untracked`
- S14 — ✅ `codemirror-git-blame-map.test.ts` insert → uncommitted; shifted line keeps SHA
- S15 — ✅ en+zh keys; zh not English; sentence case `Git blame`
- S16 — ✅ header/settings `Switch`
- S17 — ✅ `queryKeys.computer.gitFileBlame` file-scoped, no hover SHA
- S18 — ✅ `s18_adjacent_same_sha_coalesces`
- S19 — ✅ `git_file_blame` / `git_commit_detail` on WsContract; no non-`ws` REST match
- S20 — ⏸ `not_run`: local web app / agent-browser file-tab not available in this run
- Blob cache — ✅ `blob_fingerprint_cache_skips_second_porcelain_walk`
- Host-only EOL refresh — ✅ `apps/web/src/shared/lib/__tests__/codemirror-git-blame-host-update.test.ts` (shipped `createGitBlameExtensions` + `Compartment.reconfigure`; caret/doc unchanged; widget text updates)

Commands:

```bash
cargo test -p core-engine --lib -- blame s12_uncommitted s13_skip s18_adjacent s3_commit_detail blob_fingerprint_cache s1_file_blame parse_porcelain parse_shortstat
bun test apps/web/src/features/editor/components/__tests__/code-mirror-git-blame.test.ts apps/web/src/features/git/lib/__tests__/git-blame-query-keys.test.ts apps/web/src/shared/lib/__tests__/codemirror-git-blame-map.test.ts apps/web/src/shared/lib/__tests__/codemirror-git-blame-host-update.test.ts apps/web/src/features/settings/store/__tests__/editor-settings-git-blame.test.ts
bun run --filter @atmos/api-types test
cargo clippy -p core-engine -p api -- -D warnings
```

# TEST · QUALITY-034: Git status shortstat cost

> Test Plan · verify `get_git_status` uses one HEAD shortstat or none, with the same list +/- / dirty / branch semantics. References TECH QUALITY-034. There is no PRD; M1–M5 are the Musts in TECH.

## Test strategy

This is a server process-cost change. Proof is Rust tests on `GitEngine::get_git_status` and shortstat/porcelain helpers. No Bun test, Playwright, or agent-browser: no UI, copy, or client path-collect change.

- Unit: `parse_diff_shortstat` and `porcelain_has_tracked_diff`.
- Integration: temp repos through `get_git_status` for parity and shortstat call counts.
- Lint cap: `package.json` `lint` stays `oxlint --max-warnings=455`.

## Coverage map

| TECH item                                                        | Scenario IDs |
| ---------------------------------------------------------------- | ------------ |
| M1. One `git diff --shortstat HEAD --` on tracked dirty          | S4, S5, S6   |
| M2. Skip shortstat when porcelain has no tracked +/-             | S1, S2       |
| M3. Porcelain / branch / ahead-behind unchanged                  | S1, S8       |
| M4. +/- parity for clean, untracked-only, staged, unstaged, both | S1–S7        |
| M5. No UI refactor / oxlint cap / new transport                  | S9           |

## Execution map

This table is the hand-off from plan to implementation/testing.

| Scenario | Level            | Expected tool               | Target command / method                                 | Fixture / data                                     | Signals                                                                                      | Status |
| -------- | ---------------- | --------------------------- | ------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| S1       | Rust integration | `cargo test -p core-engine` | `git_status_shortstat_skipped_when_clean`               | cloned temp repo, no local edits                   | `additions=0`, `deletions=0`, `uncommitted_count=0`, shortstat calls 0, branch still present | pass   |
| S2       | Rust integration | `cargo test -p core-engine` | `git_status_shortstat_skipped_when_untracked_only`      | clean clone + one `??` file                        | dirty true, uncommitted ≥ 1, +/- = 0, shortstat calls 0                                      | pass   |
| S3       | Rust integration | `cargo test -p core-engine` | `git_status_unstaged_only_matches_two_call_sum`         | modify tracked file, do not stage                  | +/- equals `git diff --shortstat` + cached; shortstat calls 1                                | pass   |
| S4       | Rust integration | `cargo test -p core-engine` | `git_status_staged_only_matches_two_call_sum`           | stage tracked edit                                 | +/- equals cached shortstat; shortstat calls 1                                               | pass   |
| S5       | Rust integration | `cargo test -p core-engine` | `git_status_staged_and_unstaged_additive_matches_sum`   | stage one new line, then add another unstaged line | +/- equals two-call sum and HEAD shortstat; shortstat calls 1                                | pass   |
| S6       | Rust integration | `cargo test -p core-engine` | `git_status_staged_new_file_counts_insertions`          | untracked then `git add`                           | +/- > 0 and matches cached/HEAD; shortstat calls 1                                           | pass   |
| S7       | Rust unit        | `cargo test -p core-engine` | `porcelain_has_tracked_diff_*` / `parse_diff_shortstat` | porcelain strings; shortstat stdout samples        | `??`/`!!`/empty skip; ` M`/`M `/`A ` need shortstat; parse still reads insertions/deletions  | pass   |
| S8       | Rust integration | `cargo test -p core-engine` | existing `git_status_reports_*`                         | existing ahead/behind/conflict fixtures            | default-branch ahead/behind and `has_merge_conflicts` still pass                             | pass   |
| S9       | Toolchain        | shell                       | `package.json` script text                              | repo root                                          | `oxlint --max-warnings=455`; no new `WsAction`                                               | pass   |

## Scenarios

### S1 — Clean repo skips shortstat

- **Level**: Rust integration
- **Given**: a cloned temp repo with a clean worktree.
- **When**: `GitEngine::get_git_status` runs.
- **Then**: `has_uncommitted_changes` is false, `uncommitted_count` is 0, `additions` and `deletions` are 0. The test-only shortstat counter is 0. `current_branch` / default-branch fields still resolve.
- **Signals**: `GitStatus` fields; shortstat call counter.

### S2 — Untracked-only skips shortstat and keeps dirty

- **Level**: Rust integration
- **Given**: S1 plus one untracked file (`??`).
- **When**: `get_git_status` runs.
- **Then**: `has_uncommitted_changes` is true and `uncommitted_count` ≥ 1. `additions` and `deletions` stay 0. Shortstat counter is 0.
- **Signals**: dirty flag; +/- zeros; call count.

### S3 — Unstaged-only +/- matches today's two-call sum

- **Level**: Rust integration
- **Given**: a tracked file edited in the worktree, not staged.
- **When**: `get_git_status` runs.
- **Then**: `additions` / `deletions` equal `git diff --shortstat` plus `git diff --cached --shortstat`. Shortstat counter is 1.
- **Signals**: parsed independent git shortstats; call count.

### S4 — Staged-only +/- matches today's two-call sum

- **Level**: Rust integration
- **Given**: a tracked edit fully staged.
- **When**: `get_git_status` runs.
- **Then**: same as S3 against the two-call sum (cached side only). Shortstat counter is 1.
- **Signals**: independent git shortstats; call count.

### S5 — Additive staged + unstaged matches the sum and HEAD

- **Level**: Rust integration
- **Given**: one staged insertion, then a further unstaged insertion on a new line.
- **When**: `get_git_status` runs.
- **Then**: +/- equals both the two-call sum and `git diff --shortstat HEAD --`. Shortstat counter is 1.
- **Signals**: three independent git shortstats; call count.

### S6 — Staged new file counts insertions

- **Level**: Rust integration
- **Given**: a new file added to the index (`A ` porcelain).
- **When**: `get_git_status` runs.
- **Then**: `additions` matches cached/HEAD shortstat (untracked-only would have been 0). Shortstat counter is 1. `uncommitted_count` ≥ 1.
- **Signals**: +/-; porcelain dirty; call count.

### S7 — Porcelain skip and shortstat parse helpers

- **Level**: Rust unit
- **Given**: porcelain snippets and shortstat stdout strings.
- **When**: `porcelain_has_tracked_diff` and `parse_diff_shortstat` run.
- **Then**: empty, `??`, and `!!` are skip; ` M`, `M `, `A `, `MM`, and mixed `??` plus ` M` are not skip. Parse still handles insertions-only, deletions-only, both, empty, and `0 insertions`.
- **Signals**: boolean / `(u32, u32)` assertions.

### S8 — Existing branch / conflict git status tests still pass

- **Level**: Rust integration
- **Given**: the existing `git_status_reports_*` tests in `crates/core-engine/src/git/tests.rs`.
- **When**: `cargo test -p core-engine git_status_reports`.
- **Then**: equal / ahead / behind / no-upstream / tracking-default-only / merge-conflicts still pass.
- **Signals**: existing test names.

### S9 — Tooling and transport stay put

- **Level**: Toolchain
- **Given**: `package.json` and this PR diff.
- **When**: the lint script and WS catalog are read.
- **Then**: `oxlint --max-warnings=455`. No new `WsAction`. No client path-collect edit required for pass.
- **Signals**: script string; diff scope.

## Performance & load budgets

Per `get_git_status` path: **0** shortstat processes when porcelain has no tracked diff; **1** otherwise. Do not reintroduce the unstaged + cached pair. Client batch size / `staleTime` are not a budget this PR.

## Regression checklist

- [x] Clean and untracked-only rows still show 0 +/-.
- [x] Untracked files still increment `uncommitted_count` / `has_uncommitted_changes`.
- [x] Staged-only, unstaged-only, and additive both still show the same +/- as the old two-call sum.
- [x] Merge-conflict porcelain still sets `has_merge_conflicts`.
- [x] Default-branch ahead/behind tests still pass.
- [x] WS `current_branch` still comes from the engine (no extra `rev-parse --abbrev-ref HEAD` in the mapper).
- [x] `package.json` lint script is still `--max-warnings=455`.

## Exploratory agent-browser checks

Omitted. No screen, copy, or route change. The bug is extra git processes in `get_git_status`.

## Acceptance criteria

- [x] S1–S7 pass at the declared level.
- [x] S8 existing `git_status_reports_*` tests pass.
- [x] S9 oxlint cap is 455; no new WS action.
- [x] `cargo test -p core-engine` git status / shortstat tests pass.
- [x] `cargo clippy -p core-engine --all-targets --all-features -- -D warnings` passes, or a scoped clippy on touched packages is recorded.
- [x] No new REST route. No client path-collect refactor.

## Manual verification steps

None. Automated engine tests cover skip, one-call, and parity.

## Non-coverage

- Same-line staged+unstaged overlap and canceling staged-then-revert: HEAD is net, old sum inflated. TECH accepts this; do not assert equality to the two-call sum there.
- `git add -N` intent-to-add.
- WS `get_remote_url` still runs per path (residual).
- Client visible-window / `staleTime` batching.
- File-level `get_changed_files` numstat.

## Coverage Status

- S1 — pass. `cargo test -p core-engine --lib git_status_shortstat_skipped_when_clean`. +/- 0, uncommitted 0, shortstat calls 0, `current_branch` is `main`.
- S2 — pass. `cargo test -p core-engine --lib git_status_shortstat_skipped_when_untracked_only`. Dirty with +/- 0; shortstat calls 0.
- S3 — pass. `cargo test -p core-engine --lib git_status_unstaged_only_matches_two_call_sum`. Engine +/- equals two-call sum and HEAD; shortstat calls 1.
- S4 — pass. `cargo test -p core-engine --lib git_status_staged_only_matches_two_call_sum`. Same as S3 for staged-only.
- S5 — pass. `cargo test -p core-engine --lib git_status_staged_and_unstaged_additive_matches_sum`. `additions == 2`; matches sum and HEAD; shortstat calls 1.
- S6 — pass. `cargo test -p core-engine --lib git_status_staged_new_file_counts_insertions`. `additions == 1`; shortstat calls 1.
- S7 — pass. `cargo test -p core-engine --lib porcelain_skip` and `reads_insertions`. Porcelain skip helper plus parse cases including `0 insertions`.
- S8 — pass. `cargo test -p core-engine --lib git_status` (12 tests), including `git_status_reports_equal_remote_default_branch`, ahead/behind, no-upstream, tracking-default-only, merge-conflicts.
- S9 — pass. `package.json` `lint` is `oxlint --max-warnings=455`. Diff has no new `WsAction`.
- `cargo clippy -p core-engine --all-targets --all-features -- -D warnings` passed.
- `cargo clippy -p api --all-targets --all-features -- -D warnings` passed.
- Agent-browser: not run. No UI surface.

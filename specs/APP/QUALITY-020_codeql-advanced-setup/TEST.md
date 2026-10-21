# TEST · QUALITY-020: CodeQL Advanced Setup

> Test Plan · how we verify the CodeQL workflow matches default-setup language coverage and the CI constraints in TECH QUALITY-020. No product behavior changes.

## Test strategy

The change is one workflow file and this spec. Proof is static: actionlint, a structural read of `.github/workflows/codeql.yml`, the existing release-workflow shell scan, and the oxlint cap. There is no web UI, so there is no Playwright journey and no agent-browser pass.

GitHub will run the new jobs on the pull request. Upload is expected to fail while default setup stays on. That failure is recorded in Coverage Status. It is not a defect to fix in this PR. Any other red check is.

- **Workflow lint**: `actionlint` on `.github/workflows/codeql.yml`.
- **Structural**: the matrix, triggers, permissions, concurrency, category, and absence of `run:`.
- **Existing security scan**: `cargo test -p api --test workflow_shell_env`.
- **Lint cap**: `package.json` still has `oxlint --max-warnings=455`. Do not run a repo-wide oxlint ratchet change.
- **Manual**: Settings switch, re-run, `main` scan, alerts, branch protection. Those need a person with repository admin. This change must not perform them.

## Coverage map

| Requirement                                                                                     | Scenario IDs |
| ----------------------------------------------------------------------------------------------- | ------------ |
| Same five languages as default setup                                                            | S1           |
| Rust and JavaScript/TypeScript `build-mode: none`; Python and Actions `none`; C/C++ `autobuild` | S2           |
| Pull requests skip docs and static resources                                                    | S3, S4       |
| Unfiltered scans only on push to `main` and the weekly schedule                                 | S5           |
| Least permissions, including `security-events: write`                                           | S6           |
| Concurrency cancels the previous run                                                            | S7           |
| No `${{ }}` inside `run:`                                                                       | S8           |
| Action majors match repo style                                                                  | S9           |
| actionlint accepts the file                                                                     | S10          |
| Existing workflow shell scan still passes                                                       | S11          |
| oxlint cap stays 455                                                                            | S12          |
| Default setup is not disabled by this change                                                    | S13          |
| Check name and SARIF category stay per language                                                 | S14          |
| Upload failure while default setup is on is expected, and other CI is not                       | S15          |

## Execution map

| Scenario   | Level            | Expected tool       | Target command / method                       | Fixture / data              | Signals                                                                     | Status  |
| ---------- | ---------------- | ------------------- | --------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- | ------- |
| S1–S9, S14 | Review           | File read           | `.github/workflows/codeql.yml` against TECH   | Workflow text               | Matrix, triggers, permissions, names, category match TECH                   | planned |
| S10        | Lint             | actionlint 1.7.12   | `actionlint .github/workflows/codeql.yml`     | The workflow file           | Exit 0, no findings                                                         | planned |
| S11        | Rust integration | `cargo test -p api` | `cargo test -p api --test workflow_shell_env` | Release and sync workflows  | 1 passed; scanned `run:` bodies have no forbidden `${{ }}`                  | planned |
| S12        | Review           | `rg`                | `package.json` script `lint`                  | Root `package.json`         | Value is `oxlint --max-warnings=455`                                        | planned |
| S13        | Review           | Diff                | PR diff and commit list                       | This branch                 | No settings API, no default-setup PATCH                                     | planned |
| S4         | Review           | Path-filter reading | Ignore list vs sample paths                   | TECH ignore table           | Docs-only set matches; a `.rs` or `.yml` file does not                      | planned |
| S15        | CI               | GitHub Actions      | This pull request's checks                    | Default setup still enabled | New CodeQL upload fails; default-setup CodeQL and other required CI succeed | planned |

## Scenarios

### S1 — Languages match default setup

- **Level**: Review
- **Given**: default-setup check runs on `main` (`39490339805`) and on PR 337 (`39486995024`) named `Analyze (actions)`, `Analyze (c-cpp)`, `Analyze (javascript-typescript)`, `Analyze (python)`, and `Analyze (rust)`.
- **When**: the workflow matrix is read.
- **Then**: those five `language` values are present, each once, and no other language is present.
- **Signals**: five `matrix.include` rows.

### S2 — Build modes

- **Level**: Review
- **Given**: TECH requires `none` for Rust and JavaScript/TypeScript, and the suitable mode for the other detected languages.
- **When**: each row's `build-mode` is read.
- **Then**: `actions`, `javascript-typescript`, `python`, and `rust` are `none`. `c-cpp` is `autobuild`.
- **Signals**: `build-mode` on each include row.

### S3 — Docs-only pull request is ignored

- **Level**: Review
- **Given**: a pull request whose files are only `README.md`, `specs/APP/QUALITY-020_codeql-advanced-setup/TECH.md`, `docs/guide.md`, and `marketing/creative/projects/atmos-intro/poster.png`.
- **When**: GitHub evaluates `pull_request.paths-ignore`.
- **Then**: every file matches, so the workflow does not start.
- **Signals**: patterns `**/*.md`, `specs/**`, `docs/**`, and `**/*.png` are present. This scenario is not executed against a live pull request in this change; the live PR also edits the workflow, so CodeQL does start (S15).

### S4 — A code or workflow change is not ignored

- **Level**: Review
- **Given**: a pull request that changes `README.md` and either `crates/infra/src/lib.rs` or `.github/workflows/codeql.yml`.
- **When**: path filters run.
- **Then**: the workflow starts, because `paths-ignore` skips only when every file matches.
- **Signals**: `.rs` and `.yml` are not in the ignore list. `fail-fast` is `false`.

### S5 — Unfiltered scans

- **Level**: Review
- **Given**: the `on` block.
- **When**: `push` and `schedule` are compared with `pull_request`.
- **Then**: `push` is `branches: [main]` with no `paths` and no `paths-ignore`. `schedule` is `cron: "17 4 * * 1"` with no path filter. `paths-ignore` appears only under `pull_request`.
- **Signals**: those three keys.

### S6 — Permissions

- **Level**: Review
- **Given**: an explicit permissions block replaces the repository default.
- **When**: the block is read.
- **Then**: the scopes are exactly `actions: read`, `contents: read`, `packages: read`, and `security-events: write`. No scope is `write` except `security-events`.
- **Signals**: four keys. No `contents: write`, no `id-token`, no `pull-requests`.

### S7 — Concurrency

- **Level**: Review
- **Given**: two runs for the same ref.
- **When**: the second starts.
- **Then**: `cancel-in-progress` is `true` and the group is `codeql-${{ github.workflow }}-${{ github.ref }}`.
- **Signals**: the `concurrency` block. The expression is not inside `run:`.

### S8 — No shell expansion

- **Level**: Review
- **Given**: the injection rule that forbids expanding untrusted `${{ }}` inside `run:`.
- **When**: the workflow is scanned for `run:`.
- **Then**: there is no `run:` key. `matrix.language` and `matrix.build-mode` appear only in `name`, `with:`, and the concurrency group is `github.ref` / `github.workflow`.
- **Signals**: `rg -n '^\\s*run:' .github/workflows/codeql.yml` prints nothing.

### S9 — Action versions

- **Level**: Review
- **Given**: CI workflows use `actions/checkout@v5` and floating majors rather than SHAs.
- **When**: `uses:` lines are read.
- **Then**: checkout is `@v5`, and both CodeQL steps are `github/codeql-action/init@v4` and `github/codeql-action/analyze@v4`.
- **Signals**: three `uses:` lines.

### S10 — actionlint

- **Level**: Lint
- **Given**: actionlint 1.7.12.
- **When**: it lints `.github/workflows/codeql.yml`.
- **Then**: exit code is 0 and stdout has no finding.
- **Signals**: command log.

### S11 — Existing workflow shell scan

- **Level**: Rust integration
- **Given**: `apps/api/tests/workflow_shell_env.rs` still lists the sync and release workflows.
- **When**: `cargo test -p api --test workflow_shell_env` runs.
- **Then**: the test passes. `codeql.yml` is not required to be in `SCANNED_WORKFLOWS` because S8 already shows it has no `run:` body.
- **Signals**: `ok` for `workflow_shell_env`.

### S12 — oxlint cap

- **Level**: Review
- **Given**: QUALITY-010 left the cap at 455.
- **When**: the root lint script is read.
- **Then**: it is `oxlint --max-warnings=455`. This spec does not edit that script and does not add a warning.
- **Signals**: `package.json` `"lint"` value. No diff on that line.

### S13 — Default setup stays on

- **Level**: Review
- **Given**: the instruction not to disable default setup.
- **When**: the branch diff is reviewed.
- **Then**: the only executable change is `.github/workflows/codeql.yml` plus spec docs. No settings write, no `gh api` PATCH, no `default-setup` call.
- **Signals**: `git diff --stat` against `main`.

### S14 — Check name and category

- **Level**: Review
- **Given**: branch protection may require `Analyze (<language>)`.
- **When**: the job `name` and the analyze `category` are read.
- **Then**: the job name is `Analyze (${{ matrix.language }})` and the category is `/language:${{ matrix.language }}`.
- **Signals**: those two fields.

### S15 — Expected upload failure, other CI green

- **Level**: CI
- **Given**: default setup remains enabled, and this pull request edits the workflow so the new jobs start.
- **When**: GitHub Actions finishes.
- **Then**: each new `Analyze (*)` job from `.github/workflows/codeql.yml` fails at upload. Default setup's dynamic CodeQL workflow still succeeds. `oxlint` and `oxfmt` succeed. Any other failure is fixed before the PR is left as the final draft.
- **Signals**: check names, job logs, and the Actions URL. Do not "fix" the upload by disabling default setup.

### S16 — Edge: schedule and push share a concurrency group

- **Level**: Review
- **Given**: a Monday schedule and a `main` push both use `refs/heads/main`.
- **When**: they overlap.
- **Then**: the newer run cancels the older one. That is accepted. It is not a reason to split the group.
- **Signals**: S7 group key. No second concurrency group.

## Performance and load budgets

- Docs-only and asset-only pull requests do not start the five jobs. That removes the measured CodeQL block from those PRs: about 20m 13s parallel, about 35m 20s billed, on the audited `main` run.
- On code changes, Rust no longer autobuilds. The Rust job is today's critical path (20m 13s, including Autobuild). `build-mode: none` removes the compile. The remaining extract-and-query time is not estimated here; job logs were not readable. JavaScript analysis (~10m) still runs. C/C++, Python, and Actions stay around their current one to two minutes.
- The savings do not appear on this PR. Default setup keeps running, and the new matrix is additional until Settings is switched.

## Regression checklist

- [ ] `package.json` lint cap is still 455.
- [ ] `workflow_shell_env` still passes.
- [ ] No `run:` was added to `codeql.yml`.
- [ ] `paths-ignore` is not copied onto `push` or `schedule`.
- [ ] C/C++ remains in the matrix.
- [ ] Default setup was not disabled from this environment.

## Exploratory agent-browser checks

Omitted. The change has no screen, copy, or route.

## Acceptance criteria

- [ ] S1–S14 hold on the committed workflow.
- [ ] `actionlint .github/workflows/codeql.yml` exits 0.
- [ ] `cargo test -p api --test workflow_shell_env` passes.
- [ ] Root lint script is still `oxlint --max-warnings=455`.
- [ ] The pull request is draft. It is not merged. `main` is not pushed. Default setup is not modified.
- [ ] CI failures other than the expected advanced-setup upload error are fixed.
- [ ] Coverage Status names the commands and the CI outcome, including the CodeQL upload result.

## Manual verification steps

A repository admin does these. This change must not.

1. Before merge: Settings → Code security → set CodeQL to Advanced, or turn default setup off.
2. Re-run the failed CodeQL jobs on the PR. All five `Analyze (*)` jobs from `.github/workflows/codeql.yml` upload.
3. Merge.
4. On `main`, the first file-based CodeQL run succeeds for all five languages.
5. Open code scanning alerts. Existing alerts should remain, not close as fixed and reopen under a new tool or category. If they split, record the category GitHub actually used.
6. Compare branch protection required checks with `Analyze (actions)`, `Analyze (c-cpp)`, `Analyze (javascript-typescript)`, `Analyze (python)`, and `Analyze (rust)`. If the context is now prefixed with the workflow name, update the required checks.
7. Confirm the dynamic workflow `dynamic/github-code-scanning/codeql` is no longer running.
8. Open a docs-only PR later and confirm whether skipped `Analyze (*)` checks block merge. If they do, that is the follow-up in TECH.

## Non-coverage

- A live docs-only pull request (S3). The delivery PR edits the workflow, so it must run CodeQL.
- Measuring the post-switch Rust duration. Upload cannot succeed until default setup is off, and this environment must not turn it off.
- Query-suite equality with a customized default setup. The configuration endpoint was 403.
- Product tests (`just test`, Playwright). No application code changes.

## Coverage Status

Local checks, 2026-10-21, before the pull request CI run:

- S1–S9, S12, S14 — pass by reading `.github/workflows/codeql.yml` and root `package.json`. Matrix build modes: `actions`/`javascript-typescript`/`python`/`rust` = `none`, `c-cpp` = `autobuild`. Lint script is `oxlint --max-warnings=455`. No `run:` key. `paths-ignore` is only under `pull_request`.
- S10 — pass. `actionlint` 1.7.12 on `.github/workflows/codeql.yml` exited 0 with no findings.
- S11 — pass. `cargo test -p api --test workflow_shell_env`: `release_workflows_pass_untrusted_refs_through_env` ok. 1 passed.
- S13 — the branch diff is the workflow, this spec, and the README row. No settings API.
- S15 — waiting on the pull request checks. Advanced-setup upload is expected to fail while default setup stays enabled.
- `bunx oxfmt` on `specs/README.md`, `TECH.md`, and `TEST.md` made no extra formatting edits beyond the README row.

S3 is not executed as its own pull request. S16 is the concurrency reading in S7.

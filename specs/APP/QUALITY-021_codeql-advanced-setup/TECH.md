# TECH · QUALITY-021: CodeQL Advanced Setup

> Technical Design · HOW. Quality spec. No BRAINSTORM or PRD. Replaces GitHub CodeQL default setup with `.github/workflows/codeql.yml`.

## Scope summary

CodeQL is about 18% of CI time under default setup. This spec adds one advanced-setup workflow that:

- analyzes the same languages default setup analyzes today
- uses `build-mode: none` for Rust and JavaScript/TypeScript
- skips pull requests that only touch documentation or static resources
- runs an unfiltered scan on every push to `main` and once a week

Out of scope: disabling default setup from this change (the API must not be called), custom query packs, path filters inside the CodeQL database, larger runners, and raising the oxlint cap above 455.

Default setup and advanced setup cannot upload at the same time. This PR leaves default setup enabled. The new workflow's SARIF upload is expected to fail until a maintainer switches it off.

## Quality target

| Item                        | Before                                                             | After                                                                         |
| --------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Configuration               | Default setup, workflow path `dynamic/github-code-scanning/codeql` | `.github/workflows/codeql.yml`                                                |
| Languages                   | `actions`, `c-cpp`, `javascript-typescript`, `python`, `rust`      | Same five, one job each                                                       |
| Rust / JS build             | Default setup runs an Autobuild step                               | `build-mode: none`                                                            |
| C/C++ build                 | Default setup Autobuild, ~90s                                      | `build-mode: autobuild`                                                       |
| Python / Actions            | Interpreted; Autobuild step is a fast no-op                        | `build-mode: none`                                                            |
| Docs-only PRs               | CodeQL still runs                                                  | `pull_request` `paths-ignore` skips the workflow                              |
| Push to `main`, weekly cron | Full language matrix                                               | Same matrix, no path filter                                                   |
| Check name                  | `Analyze (<language>)`                                             | Job name kept identical                                                       |
| Alert category              | Default setup's per-language category                              | `category: /language:<language>`                                              |
| Token scopes                | Default setup's generated token                                    | `actions: read`, `contents: read`, `packages: read`, `security-events: write` |
| Shell injection             | Not applicable to the generated workflow                           | No `run:` step at all                                                         |

## Audit

`GET /repos/AruNi-01/atmos/code-scanning/default-setup` returned 403 (`Resource not accessible by integration`) for the GitHub App token, and 401 without auth. Languages are taken from the public check runs of the default-setup workflow (`workflow_id` 324592994, path `dynamic/github-code-scanning/codeql`).

Latest `main` run at audit time: [actions/runs/39490339805](https://github.com/AruNi-01/atmos/actions/runs/39490339805) on `9da0a38f3` (2026-10-20, event `dynamic`, display title `Push on main`). A pull request run, [actions/runs/39486995024](https://github.com/AruNi-01/atmos/actions/runs/39486995024), has the same five job names. Each job's steps are Checkout, Setup proxy, Initialize CodeQL, Autobuild, Perform CodeQL Analysis.

Wall clock on that `main` run (jobs start together; the group waits on Rust):

| Job                               | Start     | End       | Duration |
| --------------------------------- | --------- | --------- | -------- |
| `Analyze (rust)`                  | 20:15:00Z | 20:35:13Z | 20m 13s  |
| `Analyze (javascript-typescript)` | 20:15:00Z | 20:25:29Z | 10m 29s  |
| `Analyze (python)`                | 20:15:00Z | 20:16:38Z | 1m 38s   |
| `Analyze (c-cpp)`                 | 20:15:00Z | 20:16:32Z | 1m 32s   |
| `Analyze (actions)`               | 20:15:00Z | 20:16:28Z | 1m 28s   |

Parallel critical path is 20m 13s. Billed job time is about 35m 20s. Job logs are 403 without admin, so the Rust compile slice inside Autobuild is not separately measured.

The query suite is not in the check-run payload. This workflow does not set `queries:`, so CodeQL uses the action default suite. If the repository's default setup was switched to a non-default suite in the UI, that customization is not copied. Re-check open alerts after the first successful advanced upload.

`QUALITY-019` is open PR #341 (`specs/APP/QUALITY-019_e2e-concurrency-preserve-main/`). `QUALITY-020` is open PR #342 (E2E prebuilt API). This spec is `QUALITY-021`, the next id that quoted search did not find on an open pull request. Check open pull requests again immediately before opening this PR.

## Architecture overview

```
.github/workflows/codeql.yml
  on: push main | pull_request (paths-ignore) | schedule (Monday 04:17 UTC)
  permissions: actions/contents/packages read, security-events write
  concurrency: cancel older run on the same ref
  job analyze  ×  matrix language
    actions/checkout@v5
    github/codeql-action/init@v4     languages + build-mode
    github/codeql-action/analyze@v4  category /language:<language>
```

No crate, app, package, table, or WebSocket message changes. The oxlint cap in `package.json` stays `--max-warnings=455`.

Repository C/C++ is a handful of sources (`apps/desktop-electron/native/**/*.c`, `vendor/serve-sim/**/*.h`) with no top-level Makefile. Python is scripts under `scripts/` and `skills/`. JavaScript/TypeScript is the monorepo. Rust is the Cargo workspace. Actions are `.github/workflows`.

## Workflow design

### Triggers

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
    paths-ignore: [...]
  schedule:
    - cron: "17 4 * * 1"
```

- **Push** has no `paths` and no `paths-ignore`. Every commit on `main` scans all five languages. That is the unfiltered scan.
- **Schedule** is weekly, Monday 04:17 UTC, also unfiltered. The minute is off the hour so it does not pile onto other top-of-hour jobs. Nothing else in `.github/workflows` uses `cron`.
- **pull_request** uses `paths-ignore` only. GitHub skips the workflow when every changed file matches. One file outside the list runs the full five-language matrix. This is not a diff database: CodeQL still builds a database for the whole tree. The filter only decides whether the jobs start.

Ignored on pull requests:

| Pattern                                                               | Why                                                 |
| --------------------------------------------------------------------- | --------------------------------------------------- |
| `**/*.md`, `**/*.mdx`                                                 | Documentation, including `apps/docs` markdown       |
| `docs/**`, `specs/**`                                                 | Root docs and specs (markdown plus `docs/justfile`) |
| `**/*.png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `ico`, `avif`, `bmp` | Images                                              |
| `**/*.mp4`, `mov`, `webm`, `mp3`, `wav`, `ogg`                        | Video and audio                                     |
| `**/*.pdf`                                                            | Documents                                           |
| `**/*.woff`, `woff2`, `ttf`, `otf`                                    | Fonts                                               |

Not ignored: `**/*.json`, `**/*.mjs`, `**/*.yml`, `apps/docs` source that is not markdown, `marketing/**` scripts (`.mjs` / `.html`). Media under `marketing/creative` is covered by the extensions. `apps/docs` TypeScript is not under `docs/**`.

`paths-ignore` is not applied to `push` or `schedule`. A docs-only commit on `main` still scans.

### Matrix and build mode

`strategy.fail-fast` is `false`. One language failing upload must not cancel the others.

| `language`              | `build-mode` | Why                                                                                                                                                 |
| ----------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions`               | `none`       | Only supported mode                                                                                                                                 |
| `javascript-typescript` | `none`       | Required. Interpreted. Default setup's Autobuild step does not compile it                                                                           |
| `python`                | `none`       | Interpreted. Same reason                                                                                                                            |
| `rust`                  | `none`       | Required. Skips the Cargo autobuild that makes the Rust job the 20 minute critical path                                                             |
| `c-cpp`                 | `autobuild`  | Compiled language. Default setup's C/C++ Autobuild already succeeds in ~90s, so it is not the cost. `none` would drop build-dependent C/C++ queries |

There is no manual build step. The matrix never sets `build-mode: manual`. A `run:` block is omitted on purpose so the file cannot interpolate `${{ }}` into a shell. If C/C++ autobuild later fails with "unable to automatically build", switch that row to `none` (the sources have no single build entrypoint) or add a manual build that reads only shell variables, not `${{ }}` inside `run:`.

Job name is `Analyze (${{ matrix.language }})`. The check run name stays `Analyze (rust)`, `Analyze (javascript-typescript)`, `Analyze (c-cpp)`, `Analyze (python)`, and `Analyze (actions)`.

`analyze` sets `category` to `/language:${{ matrix.language }}`, which is the advanced-setup category GitHub uses to keep alerting continuous across runs of the same language. Confirm after the first successful upload that existing alerts stay open instead of closing as fixed and reopening under a new category.

Action versions follow this repo's floating major tags: `actions/checkout@v5` (the CI workflows) and `github/codeql-action/*@v4` (current CodeQL action major; the upstream starter workflow uses v4). No SHA pins. `pullfrog.yml` uses `checkout@v6`; that one file is not the CI style.

Runner is `ubuntu-latest`. No larger runner. Default setup already finishes on the standard runner.

### Permissions

The block is exhaustive. Unlisted scopes are none. `write-all` is not used.

| Scope                    | Why it is required                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `security-events: write` | Upload SARIF                                                                        |
| `contents: read`         | `actions/checkout` once a permissions block is set                                  |
| `packages: read`         | CodeQL query packs from GHCR. The upstream starter marks this as required for packs |
| `actions: read`          | The `actions` language resolves action definitions through the GitHub API           |

`pull_request` is used, not `pull_request_target`. The workflow runs the PR's code with read contents, not with a privileged checkout of `main`.

### Concurrency

```yaml
concurrency:
  group: codeql-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

`github.ref` is `refs/pull/<n>/merge` on pull requests and `refs/heads/main` on push and schedule. A newer run for that ref cancels the older one. A schedule can cancel an in-progress `main` push scan, and the reverse. That is the requested cancellation behavior. The group key is not expanded inside `run:`.

### Steps

1. Checkout, `actions/checkout@v5`, default fetch depth. Current `codeql-action` fetches the merge base itself when the checkout is too shallow for a pull request diff.
2. `github/codeql-action/init@v4` with `languages` and `build-mode` from the matrix.
3. `github/codeql-action/analyze@v4` with the per-language category.

No `queries:` input. No config file under `.github/codeql`. No `upload: false`. Upload stays on so that, once default setup is off, results reach code scanning. While default setup is on, this third step is the one that fails.

## Security and permissions

- Token is the workflow `GITHUB_TOKEN` with the four scopes above.
- No secret is read.
- No `run:` step, so `github.event.*`, `github.head_ref`, `inputs.*`, and pull request titles cannot be expanded into a shell. `apps/api/tests/workflow_shell_env.rs` keeps scanning the release and sync workflows; this file is not added to that list because it has no shell.
- `paths-ignore` does not weaken scanning of workflow files. A pull request that edits `.github/workflows/codeql.yml` or any other non-ignored path still runs the `actions` language.
- This change does not call `PATCH /repos/AruNi-01/atmos/code-scanning/default-setup` and does not change repository settings.

## Rollout plan

1. Land this spec, the README row, and `.github/workflows/codeql.yml` in a draft PR. Do not merge. Do not disable default setup.
2. On the PR, expect the new `Analyze (*)` jobs to fail at SARIF upload while default setup's own `Analyze (*)` jobs still succeed. Other CI stays green.
3. Maintainer, before merge: Settings → Code security → CodeQL, switch default setup to Advanced or turn default setup off. Then re-run the failed CodeQL jobs on the PR and confirm upload succeeds for all five languages.
4. Merge.
5. On `main`, confirm the first file-based CodeQL run succeeds, alerts carry over, and required check names still match branch protection. Update branch protection if the context gained a workflow prefix.

## Risks and tradeoffs

- **Expected failure**: with default setup still enabled, advanced upload fails. GitHub reports this as default setup already being enabled (wording is the product's, typically that CodeQL default setup must be disabled before advanced results upload). This PR will be red on the new workflow until step 3 of the rollout. That is not a workflow bug.
- **Double cost until the switch**: default setup keeps running. This PR adds a second CodeQL matrix. Minutes go up until default setup is off. The 18% savings starts after the switch, not on this PR.
- **Rust `none`**: skips Cargo. Some Rust queries that need a traced build return fewer results than Autobuild. Chosen because the Rust Autobuild job is the CodeQL critical path (~20m) and the task requires `none`.
- **C/C++ `autobuild`**: keeps build-traced queries for a job that is already ~90s. If autobuild starts failing or starts compiling the Rust workspace, switch that one row to `none`.
- **Query suite**: not readable via the 403 configuration endpoint. Omitted `queries:` means the action default. A UI-selected `security-extended` suite would not carry over automatically.
- **paths-ignore and required checks**: if a workflow is skipped because every file matched `paths-ignore`, GitHub does not report the check. A required `Analyze (rust)` (and the other four) can sit pending and block a docs-only pull request. Confirm branch protection after rollout. The mitigation, if that happens, is a follow-up that always emits a passing check for ignored path sets. This spec uses `paths-ignore` as requested and does not add that extra job.
- **Same job name while both setups run**: two check runs can share `Analyze (rust)`. One success (default setup) and one failure (this workflow) make that context red. Draft PR only.
- **Category mismatch**: if default setup used a different SARIF category, the first advanced upload can close old alerts and open new ones. Verify the alert list; do not dismiss them as fixed without looking.
- **Rollback**: revert this PR (remove `.github/workflows/codeql.yml`) and turn CodeQL default setup back on in Settings. Do not leave both enabled. Do not force-push.

## Dependencies and compatibility

- Depends on spec: none. Id is `QUALITY-021`. Open PRs #341 and #342 already hold `QUALITY-019` and `QUALITY-020`.
- Blocks: none.
- Does not change Atmos runtime, CLI, or API behavior.
- External actions: `actions/checkout@v5`, `github/codeql-action/init@v4`, `github/codeql-action/analyze@v4`.
- Lint cap stays `oxlint --max-warnings=455` in `package.json`.

## Open questions

None. C/C++ stays on `autobuild` for the reason in the matrix table. Default setup stays enabled until a person changes repository settings.

# TECH · QUALITY-019: E2E concurrency preserves main

> Technical Design · HOW. Engineering cleanup: `CI - E2E` must not cancel an in-progress `main` push when the next merge lands. Not a product feature. No BRAINSTORM or PRD (quality spec).

## Scope summary

One workflow change in `.github/workflows/ci-e2e.yml`:

- **M1.** `concurrency.cancel-in-progress` is true only for `pull_request`.
- **M2.** `main` `push` runs that share a group are not cancelled; they queue until the in-progress run finishes.
- **M3.** Pull requests keep today's "new push cancels the previous run on the same PR" behavior.

Out of scope: sharing one compiled `api` binary across E2E shards (QUALITY-020), changing the `merge` job's `ci-e2e-pages-report` concurrency, other workflows, raising `oxlint --max-warnings` above 455, and `EVIDENCE_PUSH`.

## Quality target

| Item                                          | Before                                                                         | After                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Workflow-level `cancel-in-progress`           | `true` for every event                                                         | `${{ github.event_name == 'pull_request' }}`                                                    |
| `push` to `main` while a previous run is live | New run cancels the previous one (`group` is `github.ref` = `refs/heads/main`) | In-progress run finishes; the new run waits in the same group                                   |
| Same PR, new commit                           | Cancel in-progress (unchanged)                                                 | Unchanged                                                                                       |
| `workflow_dispatch` on `main`                 | Same group as `push` / `refs/heads/main`, previously cancellable               | Same group, `cancel-in-progress` false, so it queues behind (or ahead of pending) `main` pushes |

## Architecture overview

```
on.push.main  ─┐
               ├─ concurrency.group = ci-e2e-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
on.pull_request┤
               │
on.dispatch  ─┘
                 cancel-in-progress = (event_name == pull_request)
```

Touched file: `.github/workflows/ci-e2e.yml` (workflow-level `concurrency` only).

## Design

### Keep the existing group key

Today:

```yaml
concurrency:
  group: ci-e2e-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

- `pull_request`: `github.event.pull_request.number` is set, so every commit on PR _N_ shares `ci-e2e-CI - E2E-N`.
- `push` to `main`: number is empty, so the group is `ci-e2e-CI - E2E-refs/heads/main`. Every `main` push shares that group, which is why `cancel-in-progress: true` cancelled the previous merge's E2E.

Keep this group. Putting `github.run_id` into the `main` group would stop cancellation **and** skip the queue, so two merges would compile and run Playwright at the same time. The requirement is **排队跑完**, so `main` stays on `github.ref`.

### `cancel-in-progress` is an expression

GitHub Actions allows a boolean expression here (the documented PR-vs-default-branch pattern):

```yaml
concurrency:
  group: ci-e2e-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

| Event               | Group uniqueness                          | Cancel in-progress |
| ------------------- | ----------------------------------------- | ------------------ |
| `pull_request`      | Per PR number                             | true               |
| `push` (`main`)     | Shared `refs/heads/main`                  | false              |
| `workflow_dispatch` | Shared `github.ref` of the dispatched ref | false              |

### GitHub pending-run caveat (do not paper over with `run_id`)

With `cancel-in-progress: false`, GitHub still cancels **pending** (not started) runs in the same group when a newer run is queued. Only the in-progress run is protected. Example: run A live, B pending, C arrives → B is dropped, A finishes, C waits. That matches "the live `main` E2E is not killed by the next merge."

The `merge` job keeps its own `concurrency` (`ci-e2e-pages-report`, `cancel-in-progress: false`) so Pages deploys do not race. Unchanged.

## Rollout plan

1. Land QUALITY-019 spec (`TECH.md`, `TEST.md`) and the README row.
2. Change the workflow-level `concurrency` block; add a comment stating PR cancel vs `main` queue.
3. Add `e2e/scripts/ci-e2e-workflow.test.cjs` so a later edit cannot restore `cancel-in-progress: true` at the workflow root.
4. Confirm on the PR that `CI - JS` and `CI - E2E` are the expected jobs (path filters skip backend/web/packages).

## Risks & tradeoffs

- **Risk**: two close `main` merges serialize E2E. That is the point; GitHub-hosted minutes may sit in queue instead of overlapping.
- **Risk**: a pending `main` run can still be skipped if a third push arrives while the second is waiting. Call that out; do not unique-group with `run_id`.
- **Tradeoff**: `workflow_dispatch` on `main` shares the `main` push group. Cancelling a manual run must not cancel a live post-merge E2E, so they queue together.
- **If this breaks**: revert the `concurrency` block to `cancel-in-progress: true`. No production runtime change.

## Dependencies & compatibility

- Depends on: nothing.
- Blocks: QUALITY-020 (prebuilt `api` artifact for E2E shards), which stacks on this branch without rebase.
- oxlint cap stays `--max-warnings=455`. Do not set `EVIDENCE_PUSH`.

## Open questions

None. Group key stays; only `cancel-in-progress` becomes event-dependent.

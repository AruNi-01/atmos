# TEST · QUALITY-010: Audit Safety Hardening

> Test plan for the Monday audit cleanup. References TECH QUALITY-010. Coverage Status is filled after the commands below actually run.

## Test strategy

The risks are a native crash, a public git push, shell injection, a CI job that is either always-on or accidentally required, and a lint cap that no longer matches the inventory. Proof is unit/script level plus reading the workflow. There is no iOS Simulator in this environment, so the Hermes crash is not reproduced on device.

Layers:

- **Bun tests** under `apps/mobile` (the structural CI job runs `bun test` there).
- **Shell probes** inside `evidence.sh` (`EVIDENCE_ARG_PROBE`, `EVIDENCE_POLICY_PROBE`) so tests do not boot a Simulator.
- **oxlint** on a temporary file, then `bun lint` for the warning cap.
- **`tsc`** on the packages this spec touches.
- **Manual / not run:** iOS Simulator or Release build of the Settings theme switch. Record that gap; do not claim it.

No Playwright web journey and no agent-browser pass. The user-visible theme change is React Native, and this environment cannot drive it.

## Coverage map

| Requirement                                                                    | Scenario IDs |
| ------------------------------------------------------------------------------ | ------------ |
| Settings preference does not select a native color scheme                      | S1, S2       |
| Query-pin / carousel still skip native appearance; disk-pin still may apply it | S3           |
| Evidence does not push unless `EVIDENCE_PUSH=1`                                | S4           |
| `meta.json` has no `host`                                                      | S5           |
| Old `EVIDENCE_NO_PUSH` does not publish                                        | S4           |
| just note cannot inject                                                        | S6           |
| Skill warns that the evidence remote is public                                 | S7           |
| `ios-simulator` is not a default PR job; concurrency is per PR                 | S8           |
| Branch protection was checked before skipping the job                          | S8           |
| `static-components` is warn on the #318 override paths                         | S9           |
| Warning cap equals the new inventory                                           | S9           |
| The six `next/no-img-element` disables suppress the real diagnostic            | S10          |
| Local type errors fixed; #325 file left alone                                  | S11          |
| Product regression for the touched mobile tests                                | S12          |

## Execution map

| Scenario | Level     | Tool                                     | Command / method                                                         | Signals                                                                                                                                  | Status  |
| -------- | --------- | ---------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| S1       | Unit      | Bun                                      | `bun test src/theme/parity-preview-theme.test.ts` in `apps/mobile`       | `nativeColorSchemeToApply(null)` → `null` (no preference argument)                                                                       | pass    |
| S2       | Unit      | Bun                                      | same file, source scan                                                   | `Appearance.setColorScheme` appears once, immediately after `if (next != null)`; Settings and account popover do not import `Appearance` | pass    |
| S3       | Unit      | Bun                                      | same file                                                                | query/carousel `nativeAppearance` false; disk true; disk dark → `"dark"`                                                                 | pass    |
| S4       | Script    | Bun + bash                               | `apps/mobile/script/evidence-safety.test.ts`                             | default and `EVIDENCE_PUSH=0` print `NO_PUSH`; `EVIDENCE_PUSH=1` prints `PUSH`; `EVIDENCE_NO_PUSH=1` prints `NO_PUSH`                    | pass    |
| S5       | Script    | Bun + bash                               | same                                                                     | parsed `meta.json` has no `host`; a note with newlines, backslashes, and quotes round-trips                                              | pass    |
| S6       | Script    | Bun + `just`, or bash argv               | same, payload `$(touch marker); echo "a'b"`                              | marker file absent; stdout note equals the payload. Missing `just` or `zsh` calls `bash evidence.sh` with the note as argv               | pass    |
| S7       | Review    | File read                                | skill Evidence section                                                   | contains the public-repo warning                                                                                                         | pass    |
| S8       | Review    | File read + the `gh api` results in TECH | workflow YAML                                                            | `concurrency.cancel-in-progress`; `ios-simulator` `if` is dispatch or `ios-parity` label; structural has no such `if`                    | pass    |
| S9       | Toolchain | oxlint                                   | `bun lint`, `--max-warnings=454`, and a string read of `.oxlintrc.jsonc` | lint exits 0 at 455; 454 exits 1; DOM override `react/static-components` is `warn`                                                       | pass    |
| S10      | Toolchain | oxlint                                   | temp file under `apps/web`                                               | bare `<img>` warns `next(no-img-element)`; `next/no-img-element` directive does not                                                      | pass    |
| S11      | Typecheck | `tsc`                                    | package `typecheck` scripts                                              | previously listed errors gone except `use-agent-chat-thread.test.ts`                                                                     | partial |
| S12      | Unit      | Bun                                      | `bun test` in `apps/mobile`                                              | no new failures                                                                                                                          | pass    |

## Scenarios

### S1 — Settings preference is not a native scheme

- **Level**: Unit
- **Given**: no parity preview override.
- **When**: `nativeColorSchemeToApply(null)` is evaluated. The function takes no preference argument.
- **Then**: the result is `null`, so `AppProviders` does not call `Appearance.setColorScheme`.
- **Signals**: bun `expect(...).toBeNull()`.

### S2 — Settings UI does not talk to Appearance

- **Level**: Unit
- **Given**: `SettingsIndexScreen` and `AccountPopoverButton` switch theme only through `theme.setPreference`.
- **When**: those sources and `AppProviders` are read by the test.
- **Then**: neither settings file imports `Appearance`. `AppProviders` contains `Appearance.setColorScheme` exactly once, and that call is immediately guarded by `if (next != null)`.
- **Signals**: source assertions, including a count of `Appearance.setColorScheme`.

### S3 — Preview matrix from #320 stays

- **Level**: Unit
- **Given**: the preview override helper.
- **When**: query, carousel, and disk sources are built.
- **Then**: query and carousel set `nativeAppearance` false and `nativeColorSchemeToApply` returns null. Disk sets `nativeAppearance` true and returns that color scheme.
- **Signals**: equality assertions. This is the residual native path, called out in TECH.

### S4 — Push is off unless `EVIDENCE_PUSH=1`

- **Level**: Script
- **Given**: `EVIDENCE_POLICY_PROBE=1` and a temp output directory. No Simulator.
- **When**: the script runs with the variable unset, `EVIDENCE_PUSH=0`, `EVIDENCE_PUSH=1`, and legacy `EVIDENCE_NO_PUSH=1` without `EVIDENCE_PUSH`.
- **Then**: only `EVIDENCE_PUSH=1` prints `PUSH`. The other three print `NO_PUSH` and do not reach `git push` (the probe exits first; the source order test also requires `evidence_should_push` before `git push`).
- **Signals**: stdout token; `rg` of `evidence.sh`.

### S5 — meta has no hostname

- **Level**: Script
- **Given**: the policy probe wrote `meta.json`.
- **When**: the JSON is parsed.
- **Then**: keys are exactly the set in TECH (no `host`). `note` round-trips a double quote, and a separate probe round-trips newlines, backslashes, and quotes as valid JSON (`jq -n`).
- **Signals**: `JSON.parse` and `Object.hasOwn(meta, "host") === false`.

### S6 — just note injection

- **Level**: Script
- **Given**: `set positional-arguments` is on, and the recipe line is `bash apps/mobile/e2e/scripts/evidence.sh "$1" "$2"` with no `{{pr}}` or `{{note}}`.
- **When**: `just mobile-e2e-evidence 315 '<payload>'` runs with `EVIDENCE_ARG_PROBE=1`. Payload includes `$(touch <marker>)`, a semicolon, and both quote styles. If `just` or `zsh` is missing, the test calls `bash evidence.sh` with the PR and the note as argv.
- **Then**: the marker file does not exist. Stdout is the PR number and the payload unchanged.
- **Signals**: exit 0, file absence, string equality.

### S7 — Skill warning

- **Level**: Review
- **Given**: `.agents/skills/verify-atmos-mobile/SKILL.md` Evidence section.
- **When**: a reader follows the evidence command.
- **Then**: the text says push is not the default, and it warns that the remote is a public repo and must not receive screenshots or chat content of a paired app.
- **Signals**: those phrases are in the file. The bun test asserts them.

### S8 — Simulator job is opt-in and not a required check

- **Level**: Review
- **Given**: the branch-protection results in TECH (403 on classic protection, empty rulesets, #318 and #312 merged without `ios-simulator`).
- **When**: the workflow file is read.
- **Then**: `concurrency.group` includes the PR number, `cancel-in-progress` is true, `structural` has no event `if`, and `ios-simulator` runs only for `workflow_dispatch` or label `ios-parity`.
- **Signals**: YAML assertions in the bun test, plus the TECH table. Do not claim a live branch-protection read that the token could not perform.

### S9 — static-components warn and the cap

- **Level**: Toolchain
- **Given**: the DOM override sets `react/static-components` to `warn`.
- **When**: `bun lint` runs, then `oxlint --max-warnings=454`.
- **Then**: `bun lint` exits 0. The tighter cap exits 1. Problem count is 455 (headroom 0 against 455; previous headroom was 450 − 447 = 3). The DOM override in `.oxlintrc.jsonc` contains `"react/static-components": "warn"`, so turning that rule back to `off` fails the string assertion even while 447 is still under the cap of 455.
- **Signals**: exit codes, the oxlint "problems" line, and the string assertion.

### S10 — img directive namespace

- **Level**: Toolchain
- **Given**: a temporary TSX file under `apps/web` (a Next root in `.oxlintrc.jsonc`).
- **When**: oxlint runs on it.
- **Then**: an `<img>` with `oxlint-disable-next-line next/no-img-element` produces no `no-img-element` diagnostic. An `<img>` with no directive does, and the diagnostic id contains `next(no-img-element)`.
- **Signals**: oxlint unix output. The temp file is removed even on failure.

### S11 — Typecheck of the small fixes

- **Level**: Typecheck
- **Given**: the edits in TECH §6.
- **When**: `bun run typecheck` runs in `apps/mobile`, `apps/desktop-electron`, `e2e`, and `packages/relay`.
- **Then**: desktop, e2e, and relay exit 0. Mobile may still fail, and the only remaining diagnostics are in `use-agent-chat-thread.test.ts`.
- **Signals**: `tsc` output saved with the PR. No claim that the whole monorepo is clean if another package fails.

### S12 — Mobile unit regression

- **Level**: Unit
- **Given**: the theme and fixture edits.
- **When**: `bun test` runs in `apps/mobile`.
- **Then**: exit 0.
- **Signals**: bun summary.

## Exploratory agent-browser checks

Not used. The crash is Hermes on iOS, and the other items are shell, CI, and lint. `agent-browser` cannot show the native appearance crash.

## Regression checklist

- [x] S1–S3 bun theme tests
- [x] S4–S7 evidence / just / skill
- [x] S8 workflow YAML
- [x] S9 `bun lint` and cap 454
- [x] S10 img directive
- [x] S11 package typechecks
- [x] S12 `bun test` in `apps/mobile`
- [x] oxfmt on touched TS/JSON/MD

## Acceptance criteria

- Settings theme switch has no code path that passes the persisted preference to `Appearance.setColorScheme`.
- Default evidence run does not push. `meta.json` has no `host`.
- The injection payload does not execute.
- Ordinary pull requests run `structural` and skip `ios-simulator`, and TECH records why that does not block merge.
- `bun lint` is green at `--max-warnings=455` and red at 454.
- The PR states Simulator verification as **not reproduced**.

## Manual verification steps

1. On a Mac with the app installed, open Settings and switch Theme between System, Light, and Dark. The JS surfaces (page background, `StatusBar`, Expo controls that take `colorScheme`) follow the choice. The process must not abort in `localtime_r`. **Not run in this environment.**
2. Do not set `EVIDENCE_PUSH=1` against a paired Simulator. If a push is required, use a neutral `EVIDENCE_LINK` and accept that the branch is public.

## Non-coverage

- Hermes crash on Simulator or Release (no Apple toolchain here).
- Disk-pin `setColorScheme` (intentionally still present).
- Deleting historical `agent-artifacts` objects.
- The four `tsc` errors in `use-agent-chat-thread.test.ts`.
- Re-enabling React Compiler rules other than `static-components`.
- A baseline-diff typecheck GitHub job.

## Coverage Status

> Filled 2026-10-19 on this branch after the implementation commands below. Simulator / Release theme switch was not run.

| Scenario | Result  | Evidence                                                                                                                                                                                                                                                                                                                                   |
| -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1–S3    | pass    | `bun test src/theme/parity-preview-theme.test.ts` in `apps/mobile`. `nativeColorSchemeToApply(null)` is null (no preference argument). Query/carousel null; disk dark/light returned. `Appearance.setColorScheme` appears once and is immediately guarded by `if (next != null)`.                                                          |
| S4–S5    | pass    | `script/evidence-safety.test.ts`: unset, `EVIDENCE_PUSH=0`, and `EVIDENCE_NO_PUSH=1` print `NO_PUSH`; `EVIDENCE_PUSH=1` prints `PUSH`. `meta.json` keys are pr, sha, branch, device, bundleId, capturedAt, agentDevice, note. No `host`. A note with a newline, backslash, and quotes round-trips through `jq -n`.                         |
| S6       | pass    | Same file. With `just` and `zsh` present, real `just` 1.58 prints `$(touch <marker>); echo "a'b"; say "hi"` unchanged and the marker file is absent. If `just` or `zsh` is missing, the test calls `bash evidence.sh` with that note as argv.                                                                                              |
| S7       | pass    | Skill text assertion: `PUBLIC repo` and "Do not push screenshots or chat content of a paired app".                                                                                                                                                                                                                                         |
| S8       | pass    | Workflow assertions: concurrency group, `cancel-in-progress: true`, `ios-simulator` `if` is `workflow_dispatch` or label `ios-parity`. `structural` slice has neither. Branch protection recorded in TECH before the job was made opt-in.                                                                                                  |
| S9       | pass    | From repo root: `bun lint` exit 0; `oxlint --max-warnings=454` exit 1; unix format `455 problems`; 9 `static-components`. Cap in `package.json` is 455 (headroom 0). String assertion: the DOM override (`apps/web/**` through the next override) contains `"react/static-components": "warn"`.                                            |
| S10      | pass    | Probe file under `apps/web` (deleted in `finally`): one `next(no-img-element)` hit, on the bare `<img>` line. The `next/no-img-element` directive suppressed the other.                                                                                                                                                                    |
| S11      | partial | `bun run typecheck` (TS 7.0.2): web, landing, docs, desktop-electron, e2e, ui, shared, i18n, api-types, agent-transcript, api-client, hub-client, relay-client, pt-design, md-live, hub, relay pass. Mobile fails only on the four #325 errors in `use-agent-chat-thread.test.ts` (`bun:test`, `node:fs`, `node:path`, `import.meta.dir`). |
| S12      | pass    | `bun test` in `apps/mobile`: 418 pass, 0 fail, 102 files.                                                                                                                                                                                                                                                                                  |
| Manual   | not run | No iOS Simulator or Release build. Theme crash: not reproduced; verified by unit tests + code reasoning.                                                                                                                                                                                                                                   |

Commands:

```bash
cd apps/mobile && bun test script/evidence-safety.test.ts src/theme/parity-preview-theme.test.ts src/features/agent-chat/fold-transcript.test.ts
cd apps/mobile && bun test
bun run typecheck
bun lint
bunx oxlint --max-warnings=454
bunx oxlint --max-warnings=100000 --format=unix
```

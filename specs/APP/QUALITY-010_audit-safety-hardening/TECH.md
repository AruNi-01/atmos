# TECH · QUALITY-010: Audit Safety Hardening

> Technical Design · HOW. Engineering cleanup from the Monday audit: mobile theme must not flip native appearance mid-session, mobile e2e evidence must not publish to a public branch by default, the evidence just recipe must not interpolate into the shell, the iOS parity workflow must not run the heavy simulator job on every PR, and the oxlint ratchet must keep `react/static-components` at least at warn. Pre-existing TypeScript errors are fixed only when the edit is local and does not rewrite files owned by open PRs #323, #324, or #325.

## Scope summary

This is not a product feature. It closes six audit items:

1. **Settings theme crash.** `Appearance.setColorScheme("dark")` after the first JS frame crashes Hermes in `localtime_r`. #320 stopped that call for the parity preview `openurl` / carousel path. Switching theme in Settings (and the account popover) still reaches the call, because a null preview makes `nativeColorSchemeToApply` return the persisted preference.
2. **Public evidence push.** `apps/mobile/e2e/scripts/evidence.sh` pushes to orphan branch `agent-artifacts` unless `EVIDENCE_NO_PUSH=1`. `meta.json` includes the machine hostname. The remote is public. `agent-artifacts` already contains `pr-315/*/meta.json` with `"host": "AarynLudeMacBook-Air"`.
3. **just injection.** `mobile-e2e-evidence` interpolates `{{pr}}` and `{{note}}` into a `zsh -cu` script. A note containing `$(...)`, `;`, or quotes is executed by that shell.
4. **iOS parity CI cost.** `.github/workflows/ci-mobile-ios-parity.yml` runs the 180-minute `ios-simulator` job on every matching pull request, with no per-PR concurrency.
5. **oxlint follow-up from #318.** The DOM-app override sets `react/static-components` to `off`. Six `oxlint-disable-next-line next/no-img-element` comments need a check against the config key `nextjs/no-img-element`. `--max-warnings=450` has almost no headroom.
6. **Typecheck does not block main.** `scripts/typecheck-all.ts` is not a required CI job. `main` has 11 `tsc` errors in mobile, desktop-electron, e2e, and relay.

Out of scope:

- Rewriting open PRs #323, #324, or #325, including `apps/mobile/src/features/agent-chat/use-agent-chat-thread.test.ts`.
- Force-pushing or deleting `agent-artifacts` (or `pr-315` on that branch).
- Turning the other React Compiler advisory rules (`refs`, `set-state-in-effect`, `immutability`, `preserve-manual-memoization`, `purity`, `incompatible-library`) back on. #318 turned those off because the inventory is hundreds of warnings and the fixes change render timing.
- A new CI typecheck job in this PR. If the remaining errors are not fixed here, the recommendation is a baseline-diff job, not a red `main`.
- Reproducing the Hermes crash on an iOS Simulator or Release build from this Linux agent. There is no Simulator here.

## Quality target

| Item                                                                            | Before                                                      | After                                                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Settings / account theme switch                                                 | `Appearance.setColorScheme(preference)` from `AppProviders` | JS theme only (`useMobileTheme`, CSS variables, `Host colorScheme`, `StatusBar`)                  |
| Disk-pin preview native appearance                                              | Still allowed once (`nativeAppearance: true`)               | Unchanged. #320's cold disk pin may still call `setColorScheme`. Query-pin and carousel stay null |
| Evidence publish                                                                | Push unless `EVIDENCE_NO_PUSH=1`                            | Push only when `EVIDENCE_PUSH=1`                                                                  |
| `meta.json`                                                                     | Includes `host`                                             | No `host` field                                                                                   |
| `just mobile-e2e-evidence`                                                      | `{{pr}}` / `{{note}}` interpolated                          | Positional `"$1"` `"$2"` under existing `set positional-arguments`                                |
| `ios-simulator` job                                                             | Every matching `pull_request`                               | `workflow_dispatch`, or a PR that carries the `ios-parity` label                                  |
| Workflow concurrency                                                            | None                                                        | Per PR (or ref), `cancel-in-progress: true`                                                       |
| `react/static-components` on web / landing / ui / pt-design / md-live / scripts | `off`                                                       | `warn`                                                                                            |
| `bun lint` warning cap                                                          | 447 warnings, `--max-warnings=450` (headroom 3)             | 455 warnings, `--max-warnings=455` (headroom 0)                                                   |
| `next/no-img-element` disables                                                  | Already suppress the diagnostic                             | Left as `next/no-img-element` (the emitted id). Regression test locks that                        |
| Typecheck errors                                                                | 11                                                          | Fix the 7 that are local. Leave the 4 in the #325 file                                            |

## 1. Settings theme stays on the JS layer

`useMobileTheme` already resolves light / dark / system, including a parity preview override, and feeds:

- `MobileThemeVariablesProvider` (`react-native-css` `colorScheme.set` — JS, not `Appearance`)
- `StatusBar style={theme.statusBarStyle}`
- Expo UI `Host colorScheme={theme.colorScheme}`

The crash path is only `AppProviders`:

```ts
const next = nativeColorSchemeToApply({ preference, preview });
if (next != null) Appearance.setColorScheme(next);
```

Today a null preview returns `"dark" | "light" | "unspecified"`. Settings `setPreference` (segmented control and account popover) updates the Zustand store, the effect re-runs, and `setColorScheme` runs mid-session.

Decision: a persisted preference is never a native scheme.

```ts
export function nativeColorSchemeToApply(
  preview: ParityPreviewThemeOverride | null,
): MobileThemeColorScheme | null {
  if (!preview?.nativeAppearance) return null;
  return preview.colorScheme;
}
```

- Settings, system, query-pin, and carousel → `null` → the effect does not call `Appearance.setColorScheme`.
- Disk-pin (`nativeAppearance: true`) still returns the preview scheme. That is the #320 cold-launch exception, not the Settings path. It remains a residual crash risk if that effect runs after the first frame; this spec does not widen #320.

`SystemUI.setBackgroundColorAsync` stays. It sets a color, not the native color scheme.

No Simulator or Release binary is available in this environment. Verification is the unit contract plus code reading. The PR must say: not reproduced; verified by unit tests and code reasoning.

## 2. Evidence publish is opt-in and has no hostname

`evidence.sh`:

- Delete `EVIDENCE_NO_PUSH`. No backward compatibility.
- `evidence_should_push` is true only when `EVIDENCE_PUSH=1`.
- Default path prints the local stage directory and exits 0 before any `git push`.
- `evidence_write_meta` writes `pr`, `sha`, `branch`, `device`, `bundleId`, `capturedAt`, `agentDevice`, `note` with `jq -n` (newlines, backslashes, and quotes stay valid JSON). No `host`, no `scutil`, no `hostname`.
- `EVIDENCE_ARG_PROBE=1` prints the two received arguments and exits before Simulator work, so the just quoting test can call the real script.
- `EVIDENCE_POLICY_PROBE=1` writes meta to `EVIDENCE_POLICY_OUT` and prints `PUSH` or `NO_PUSH`, then exits. Same reason.

Sync the contract text in `specs/APP/QUALITY-009_mobile-agent-e2e/TECH.md` (command table, meta layout, public-remote bullet) and in that spec's TEST S5 plus manual step 3. The historical coverage line may still record that the original run pushed; the current contract is no push by default, only `EVIDENCE_PUSH=1`.

`.agents/skills/verify-atmos-mobile/SKILL.md` Evidence section: the command stages locally; push is `EVIDENCE_PUSH=1` only; warn that `agent-artifacts` is a **public** repo and must not receive screenshots or chat content from a paired app.

### Public branch already leaked the hostname

Read-only `git fetch` of `origin/agent-artifacts` (no push, no delete, no force-push) shows:

| Path                         | Field                            |
| ---------------------------- | -------------------------------- |
| `pr-315/17a860c08/meta.json` | `"host": "AarynLudeMacBook-Air"` |
| `pr-315/7f6480137/meta.json` | `"host": "AarynLudeMacBook-Air"` |

Those commits also store `screen.png` and `a11y.txt`. A follow-up commit that deletes the files leaves the blobs in history. Cleanup has to be a separate maintainer action (rewrite or delete the orphan branch). This PR does not do that.

## 3. just recipe uses positional arguments

Root `justfile` already has `set shell := ["zsh", "-cu"]` and `set positional-arguments`.

```just
mobile-e2e-evidence pr note="":
    bash apps/mobile/e2e/scripts/evidence.sh "$1" "$2"
```

`just` 1.58 passes recipe parameters as positional arguments to `zsh -cu`, so `$1` is the PR and `$2` is the note. The note is never spliced into the script text. `quote()` was checked on 1.58 and is also safe; positional arguments match the justfile setting and fail closed if that setting is removed (`$1` empty → numeric PR check exits 2) instead of executing the note.

Injection case (must not create a marker file, must print the note unchanged):

```text
$(touch <marker>); echo "a'b"; say "hi"
```

## 4. iOS parity workflow

### Branch protection check (before changing required jobs)

| Query                                                | Result                                           |
| ---------------------------------------------------- | ------------------------------------------------ |
| `GET /repos/AruNi-01/atmos/branches/main/protection` | **403** `Resource not accessible by integration` |
| `GET .../protection/required_status_checks`          | **403** same                                     |
| `GET /repos/AruNi-01/atmos/rulesets`                 | **200** `[]`                                     |
| `GET /repos/AruNi-01/atmos/rules/branches/main`      | **200** `[]`                                     |
| GraphQL `branchProtectionRules`                      | **FORBIDDEN**                                    |

The token cannot read classic branch protection. Rulesets visible to the token are empty.

Empirical check: required status checks block merge when the check is absent. These merged PRs do not touch the workflow path filters and did not report `ios-simulator`:

- #318 (`chore(lint)`, mobile path count 0) — checks include `oxlint`, not `ios-simulator`
- #312 (`fix(api)`) — no `ios-simulator` / `structural` check

So `ios-simulator` is not a required status check. Skipping it on ordinary PRs does not make `main` unmergeable. `structural` keeps running on `pull_request` so the fast job still reports.

### Workflow shape

```yaml
concurrency:
  group: ci-mobile-ios-parity-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

on:
  workflow_dispatch:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]
    paths: [unchanged]
```

`ios-simulator` runs only when `github.event_name == 'workflow_dispatch'` or the pull request labels contain `ios-parity`. `structural` stays unconditional inside the workflow. Adding or removing the label re-runs the workflow; concurrency cancels the previous run.

The `ios-parity` label does not need to exist until someone applies it. This PR does not create GitHub labels (the token is not an admin).

## 5. oxlint

### `static-components`

In the override for `apps/web`, `apps/landing`, `packages/ui`, `packages/pt-design`, `packages/md-live`, and `scripts`, change `react/static-components` from `off` to `warn`. Leave the other advisory rules off. The root rule stays `error` for every other path. Mobile already overrides it to `warn`.

Measured on this tree (oxlint 1.88, unix format, "N problems" line):

| Config                           | Problems | `static-components`                           |
| -------------------------------- | -------- | --------------------------------------------- |
| Current (`off` in that override) | **447**  | 1 (mobile `SessionInboxScreen`, already warn) |
| Override set to `warn`           | **455**  | 9 (the mobile one + 8 in `packages/ui`)       |

`package.json` `"lint": "oxlint --max-warnings=450"` therefore has **headroom 3** today (450 − 447). After the restore, 455 − 450 = **5 over the cap**, so `CI - JS` / `bun lint` would fail. Set the cap to **455**. New headroom is **0**: one new warning fails CI. That matches the QUALITY-007 ratchet (cap equals inventory). Do not leave the extra 3 slots.

The 8 new warnings are pre-existing components in `packages/ui` (`text-scramble`, `animated-number`, `text-shimmer-wave`, `text-effect`, `color-picker`, `ai-elements/shimmer`). This spec does not restructure them.

### `no-img-element` directives

Config enables `nextjs/no-img-element`. Diagnostics print `next(no-img-element)`. A deleted probe under `apps/web` showed:

| Directive on the line above `<img>`                  | Warning                     |
| ---------------------------------------------------- | --------------------------- |
| none                                                 | yes, `next(no-img-element)` |
| `oxlint-disable-next-line next/no-img-element`       | no                          |
| `oxlint-disable-next-line nextjs/no-img-element`     | no                          |
| `eslint-disable-next-line @next/next/no-img-element` | no                          |

The six comments use `next/no-img-element`, which is the emitted rule id, and they already suppress the warning. `nextjs/no-img-element` is an alias that also suppresses. Renaming them does not fix a hole. Keep the six comments. Add a bun test that writes a temporary file under `apps/web`, runs oxlint, and asserts the `next/` directive suppresses while a bare `<img>` warns. Delete the file in `finally`.

## 6. Typecheck errors on main

Command: `bun run typecheck` filtered per package (`apps/mobile`, `apps/desktop-electron`, `e2e`, `packages/relay`). 11 errors. No other packages were in the audit list; re-run `bun run typecheck` after the edits and record anything else.

| #   | Location                                                            | Error                                                                        | Decision                                                                                                                                                                      |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2 | `apps/mobile/src/features/agent-chat/fold-transcript.test.ts`       | `AgentTool.params` required                                                  | **Fix.** Add `params: { type: "search", query: "search" }` on both fixtures                                                                                                   |
| 3   | `apps/mobile/src/features/agent-chat/hide-scroll-edge.tsx`          | `requireNativeView` returns `ComponentType`, annotation is a call signature  | **Fix.** Annotate as `ComponentType`                                                                                                                                          |
| 4   | `apps/mobile/src/ui/primitives/expo-drawer.web.tsx`                 | `touchAction` is not in RN `ViewStyle`                                       | **Fix.** Spread a `ViewStyle` cast so the web CSS property stays                                                                                                              |
| 5–8 | `apps/mobile/src/features/agent-chat/use-agent-chat-thread.test.ts` | `bun:test`, `node:fs`, `node:path`, `import.meta.dir`                        | **Do not edit.** Open PR #325 owns this file. Same `@ts-expect-error` pattern as other mobile tests would fix it; that belongs on #325 or a follow-up that is not this branch |
| 9   | `apps/desktop-electron/src/appshot/host-shift.ts`                   | `export type { HostShiftCapturedPayload } from` does not bind the local name | **Fix.** `import type` and re-export                                                                                                                                          |
| 10  | `e2e/tests/smoke/workspace/workspace-center-explorer.e2e.ts`        | Playwright 1.62 `TestDetails` has no `timeout`                               | **Fix.** `test.setTimeout(180_000)` inside the test                                                                                                                           |
| 11  | `packages/relay/src/server-hub.ts` → `ackDelivery(env: Env)`        | `ServerHubEnv` has `DB` but not `PT_DESIGN_ROOM`                             | **Fix.** Type delivery-state helpers as `{ DB: D1Database }` (they only touch `env.DB`)                                                                                       |

Recommendation if the four deferred diagnostics should block later: a CI job that runs `bun run typecheck` and fails on a **new** error against a committed baseline, instead of failing `main` on the current four. Not implemented in this spec.

## Affected files

| Area     | Files                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme    | `apps/mobile/src/providers/AppProviders.tsx`, `apps/mobile/src/theme/parity-preview-theme.ts`, `parity-preview-theme.test.ts`                                         |
| Evidence | `apps/mobile/e2e/scripts/evidence.sh`, `justfile`, `.agents/skills/verify-atmos-mobile/SKILL.md`, QUALITY-009 `TECH.md`                                               |
| Tests    | `apps/mobile/script/evidence-safety.test.ts` (just injection, push gate, meta host, img directive)                                                                    |
| CI       | `.github/workflows/ci-mobile-ios-parity.yml`                                                                                                                          |
| Lint     | `.oxlintrc.jsonc`, `package.json` `lint` script                                                                                                                       |
| Types    | `fold-transcript.test.ts`, `hide-scroll-edge.tsx`, `expo-drawer.web.tsx`, `host-shift.ts`, `workspace-center-explorer.e2e.ts`, `packages/relay/src/delivery-state.ts` |
| Spec     | this directory, `specs/README.md` row **QUALITY-010**                                                                                                                 |

## Risks

- Disk-pin preview can still call `Appearance.setColorScheme` after mount. Settings cannot.
- JS theme does not change UIKit's global `userInterfaceStyle`. Expo `Host colorScheme` and `StatusBar` are per-control. Native chrome outside those props can stay on the system scheme. That is the crash tradeoff.
- `EVIDENCE_NO_PUSH=1` no longer means anything. Callers must set `EVIDENCE_PUSH=1` to publish. Default becomes the safe side.
- Skipping `ios-simulator` hides visual parity regressions until someone labels the PR or runs the workflow by hand. `structural` still runs.
- Raising `--max-warnings` to 455 admits 8 `static-components` warnings. Headroom goes from 3 to 0.
- Narrowing relay delivery env to `{ DB: D1Database }` is type-only. Runtime still uses `env.DB`.

## Follow-ups

- Maintainer cleanup of public `agent-artifacts` history for `pr-315` (hostname and screenshots). Do not force-push from this change.
- #325 (or a follow-up) adds the `bun:test` / `node:*` ts-expect-error lines on `use-agent-chat-thread.test.ts`.
- Optional baseline-diff `bun run typecheck` job once that file is clean.
- Re-enable the other React Compiler advisory rules per directory, not in this PR.
- Drop disk-pin `nativeAppearance` if a Simulator shows it also crashes mid-session.

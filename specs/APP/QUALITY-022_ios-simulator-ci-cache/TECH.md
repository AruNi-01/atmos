# TECH · QUALITY-022: iOS Simulator CI Cache

> Technical Design · HOW. Speeds up the `ios-simulator` job in `.github/workflows/ci-mobile-ios-parity.yml` by caching the generated `ios/` tree (so `expo prebuild` and `pod install` can be skipped) and Xcode DerivedData (so clang can be incremental). No BRAINSTORM or PRD (quality spec). The `ios-parity` label gate from [QUALITY-010](../QUALITY-010_audit-safety-hardening/TECH.md) stays.

## Scope summary

`ios-simulator` on `macos-26` is about half of Atmos CI wall time (often 50–180 minutes). `ios/` is gitignored, so every run used to:

1. Regenerate `apps/mobile/ios` with `expo prebuild --no-install`.
2. Run `pod install` (codegen + generate Pods project + integrate the app).
3. Run a clean `xcodebuild`.

Numbering: `origin/main` last published **QUALITY-020** (E2E prebuilt API artifact, #342). Concurrent draft [PR #344](https://github.com/AruNi-01/atmos/pull/344) registered **QUALITY-021** for CodeQL advanced config, so this spec is **QUALITY-022**.

This spec does not change triggers, does not add or remove the `ios-parity` label, does not raise `oxlint --max-warnings=455`, and does not commit screenshots, evidence files, or hostnames.

Out of scope:

- Speeding up the ubuntu `structural` job or the capture half of `ios-simulator`.
- Bundling or caching `~/.atmos`, simulators, or Xcode.app.
- Making `ios-simulator` required, or running it on every push.
- ccache / sccache.

## Measured failure of Pods-only + DerivedData restore

Run [39530230224](https://github.com/AruNi-01/atmos/actions/runs/39530230224) on SHA `3581e6854`, same SHA, two attempts:

| Step                | Attempt 1 (miss)               | Attempt 2 (exact hit)                                                     |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| Restore CocoaPods   | 2s miss                        | 41s hit (522 MB)                                                          |
| Install CocoaPods   | 2m20s, `Installing …` 121 pods | 2m19s, codegen + `Generating Pods project` + `Integrating client project` |
| Restore DerivedData | 1s miss                        | 58s hit (1.5 GB)                                                          |
| Build Release       | **27m07s**, CompileC 1402      | **49m01s**, CompileC 1322                                                 |

Exact cache hits did **not** skip `pod install`. `expo prebuild` always rewrote `ios/` (new mtimes). `pod install` then rewrote Pods sources, `Pods.xcodeproj`, and the app pbxproj. Clang saw every translation unit as new. Restoring 1.5 GB of `.o` files added I/O on top of a full rebuild, so the hit was **22 minutes slower**.

Root causes:

1. **prebuild** always regenerates `ios/` (`ios/` is gitignored).
2. **`pod install` always ran**, even with `Pods/` restored — RN/Expo codegen rewrites native files.
3. **`actions/checkout` + `bun install`** stamp `node_modules` with “now”, so even a pristine DerivedData tree looks stale.
4. **`restore-keys` prefix hits** are the same class of failure as (2)+(3): a restored tree plus rewritten sources.

## Quality target

| Item                | After                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Generated `ios/`    | Exact-key cache of `apps/mobile/ios`. Hit **skips** prebuild and `pod install`. No `restore-keys`. |
| CocoaPods downloads | `~/Library/Caches/CocoaPods` only on the miss path (prefix fallback allowed)                       |
| Xcode DerivedData   | Exact-key restore of `$GITHUB_WORKSPACE/artifacts/derived`. No `restore-keys`.                     |
| Incremental clang   | On exact DerivedData hit, pin native-input mtimes to `bun.lock` before `xcodebuild`                |
| Trigger             | Unchanged: `workflow_dispatch` or PR label `ios-parity`                                            |

## Architecture overview

```
ios-simulator (macos-26, still label-gated)
  checkout → bun install
  xcode-select Xcode 26.5; record version + scope
  boot iPhone 17 Pro (unchanged)
  bake .env + exclude-dev-client (mutates package.json)
  restore ios-gen-*                  → apps/mobile/ios
  miss: restore ios-podhome-* ; prebuild ; pod install ; save both
  hit: skip prebuild and pod install
  verify tree (Info.plist, SceneDelegate, Podfile.lock, .xcode.env.local)
  restore ios-dd-* (exact only)
  exact dd hit: pin node_modules / ios / modules mtimes to bun.lock
  xcodebuild -derivedDataPath artifacts/derived  COMPILER_INDEX_STORE_ENABLE=NO
  prune Logs + Index.noindex
  save ios-dd-*                      → before capture
  simctl install + ios-capture.sh    → unchanged
```

```mermaid
flowchart TD
  bake["exclude-dev-client"] --> iosRestore["restore ios-gen-* exact"]
  iosRestore -->|miss| prebuild["expo prebuild + pod install"]
  prebuild --> iosSave["save ios-gen-*"]
  iosRestore -->|hit| verify["verify ios tree"]
  iosSave --> verify
  verify --> ddRestore["restore ios-dd-* exact"]
  ddRestore -->|hit| mtime["pin native input mtimes"]
  ddRestore -->|miss| xcodebuild["xcodebuild"]
  mtime --> xcodebuild
  xcodebuild --> prune["rm Logs and Index.noindex"]
  prune --> ddSave["save ios-dd-*"]
  ddSave --> capture["install / launch / capture"]
```

## Cache key design

Scope (from the Xcode step, env in / shell out — QUALITY-015):

| Event               | `steps.xcode.outputs.scope`     |
| ------------------- | ------------------------------- |
| `pull_request`      | `pr-<number>`                   |
| `workflow_dispatch` | `ref-<ref_name>` with `/` → `-` |

Xcode version: `xcodebuild -version` awk `NR==1 $2` + `NR==2 $3` → `26.5-17F42`. Spaces never enter the key.

`hashFiles` for `ios-gen` runs **after** `exclude-dev-client.js` mutates `apps/mobile/package.json`.

### Generated iOS tree (`id: ios-restore` / save)

Path: `apps/mobile/ios` (Pods, `Podfile`, `Podfile.lock`, xcworkspace, pbxproj, codegen).

Exact key:

```text
ios-gen-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-${{ hashFiles('bun.lock', 'apps/mobile/package.json', 'apps/mobile/app.config.js', 'apps/mobile/app.json', 'apps/mobile/plugins/**', 'apps/mobile/modules/**', 'scripts/agent-chat-parity/exclude-dev-client.js') }}
```

No `restore-keys`. `outputs.cache-hit == 'true'` is the only skip gate for prebuild / `pod install`.

### CocoaPods download cache (miss path only)

Path: `~/Library/Caches/CocoaPods`

```text
ios-podhome-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ hashFiles('bun.lock') }}
```

`restore-keys`: xcode prefix, then `runner.os`. This only speeds a cold `pod install`.

### DerivedData (`id: deriveddata-restore` / save)

Path: `${{ github.workspace }}/artifacts/derived`. Do **not** `rm -rf` it before `xcodebuild`.

```text
ios-dd-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-${{ hashFiles('bun.lock') }}-${{ hashFiles('apps/mobile/ios/Podfile.lock') }}
```

No `restore-keys`. A prefix restore plus rewritten sources was slower than a miss.

### Invalidation

| Change                                                     | ios-gen exact          | DerivedData exact             |
| ---------------------------------------------------------- | ---------------------- | ----------------------------- |
| Xcode / runner OS / other PR                               | miss                   | miss                          |
| `bun.lock` / package.json / app config / plugins / modules | miss                   | miss via lock                 |
| JS/TS only, same native inputs                             | hit, skip prebuild+pod | hit; bundle script still runs |

## Incremental compile

On `steps.deriveddata-restore.outputs.cache-hit == 'true'` only, walk `node_modules`, `apps/mobile/node_modules`, `apps/mobile/ios`, and `apps/mobile/modules` and `os.utime` each file to `bun.lock`'s atime/mtime.

The exact key already says those inputs match the tree that produced the `.o` files. Checkout/bun install had stamped them with “now”, which is why attempt 2 recompiled ~1300 `CompileC` lines.

The RN bundle script phase still runs every build (no outputs declared), so JS/TS edits still re-bundle into `main.jsbundle`. Existing gates (`[parity] preview-chat route`, SceneDelegate) still run.

## DerivedData path and size

- `COMPILER_INDEX_STORE_ENABLE=NO`; prune `Logs` / `Index.noindex` before save.
- Split restore/save so a later capture timeout does not drop the save.
- Do not restrict save to `main`. A PR re-run is how miss vs hit is measured.
- `permissions` stay `contents: read`.
- `summary.md` records ios-gen / cocoapods-home / deriveddata `cache-hit` + `cache-matched-key` and the `CompileC` count. No hostname.

## Trigger (must not change)

```yaml
on:
  workflow_dispatch:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]

ios-simulator:
  if: >-
    github.event_name == 'workflow_dispatch' ||
    (github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, 'ios-parity'))
```

No `push:` trigger. This work does not add or remove the `ios-parity` label.

## How to get miss vs hit timings

The Eng Manager applies `ios-parity` when needed (this change does not). New keys (`ios-gen-*`, exact `ios-dd-*`) miss on the first labeled run after this lands, then:

1. First `ios-simulator` on the new SHA: expect `ios-gen cache-hit` and `deriveddata cache-hit` false. `Prebuild iOS` and `Install CocoaPods` run. `CompileC count` in `summary.md` is the cold baseline (about 1400).
2. After that run finishes the save steps, **Re-run jobs** on the **same SHA**. Expect both exact hits, skipped prebuild/pod install, `Normalize native input mtimes` ran, and `CompileC count` far below the baseline (native skip; bundle script still runs). Compare `Build Release simulator app` duration.
3. If native `CompileC` stays near 1400 on the re-run, DerivedData is still not paying for itself — drop `ios-dd-*` rather than keep a harmful restore.

## Affected files

| Area  | Files                                                                                  |
| ----- | -------------------------------------------------------------------------------------- |
| CI    | `.github/workflows/ci-mobile-ios-parity.yml`                                           |
| Tests | `apps/mobile/script/ios-parity-ci-cache.test.ts` (picked up by `apps/mobile` bun test) |
| Spec  | this directory, `specs/README.md` row **QUALITY-022**                                  |

## Risks & tradeoffs

- **Stale `ios/` on a missed input.** If a prebuild input is not in `hashFiles`, an exact hit skips prebuild and ships an old native tree. The glob covers `package.json`, app config, plugins, modules, `bun.lock`, and `exclude-dev-client.js`. Add to that list when a new native input appears.
- **mtime pin is exact-hit only.** A wrong pin would skip a needed compile. The pin runs only when the DerivedData exact key matches `bun.lock` + `Podfile.lock`.
- **10 GB repo cache cap.** `ios/` (~500 MB) plus DerivedData (~1.5 GB) is large. Index/Logs stay out. A failed save is a warning; the job still continues.
- **QUALITY-015.** No `${{ github.event.* }}` inside `run:` bodies. Skip gates use `steps.*.outputs.cache-hit` in `if:`.

## Rollout

1. Register QUALITY-022 and this TECH/TEST.
2. Workflow + bun tests.
3. Draft PR; `structural` and non-iOS CI must be green.
4. Eng Manager labels / re-runs `ios-parity` to measure miss vs hit. This PR does not change that label.

## Follow-ups

- Drop DerivedData if a labeled re-run still shows ~1400 `CompileC`.
- ccache only if mtime pin is insufficient and ios-gen skip is already in place.

# REVIEW · APP-036: Grok Build CLI Support - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-07-16  
**Review scope**: functional review + quality review  
**Related code**:
- `resources/terminal-agents/builtin_agents.json`
- `packages/shared/src/terminal/title.ts`
- `crates/core-service/src/service/cli_identity.rs`
- `crates/core-service/src/service/agent_hooks/grok_build.rs`
- `crates/core-service/src/service/automation/{agents,output_rendering}.rs`
- `crates/core-engine/src/agent_hooks/grok_build.rs`
- `apps/api/src/api/hooks/mod.rs`
- `apps/web/src/features/{terminal,agent,settings}/**` (hooks store, icons, contested owners, title)
- `apps/mobile/src/features/terminal/use-contested-cli-owners.ts`

---

## How to use this file

| Rule | Detail |
|------|--------|
| **When to add** | After code implementation reaches review or post-review and the findings need durable tracking before cleanup. |
| **Entry id** | `REV-NNN` - zero-padded, monotonic in this file (next: **REV-027**). |
| **Status** | `open` -> `in_progress` -> `fixed` -> `verified` (or `wont-fix` with reason). |
| **Do not** | Duplicate full TECH/TEST content; link to baseline docs and record only review findings plus fix status. |
| **Fix proof** | Each fixed item should name the code change and the verification command or manual check. |

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | backend | Grok hooks detection treats any `agent` on PATH as Grok | verified |
| REV-002 | P1 | backend | Contested identity probe does not enforce timeout | verified |
| REV-003 | P1 | backend | Notification hook matcher may drop PermissionRequest | verified |
| REV-004 | P2 | frontend | Canvas pin path omits contestedOwners | verified |
| REV-005 | P2 | frontend | Mobile freehand `agent` identity not wired | verified |
| REV-006 | P1 | frontend | Unknown `agent` can fall back to a stale agent label | verified |
| REV-007 | P2 | frontend | Mobile Grok icon is stored outside the required bundle path | fixed |
| REV-008 | P1 | backend | PATH lookup remains unbounded inside the identity endpoint | verified |
| REV-009 | P2 | frontend | Web identity cache is reused across different Computers | fixed |
| REV-010 | P2 | frontend | Per-pane focus refresh can fan out identity probes | fixed |
| REV-011 | P2 | frontend | Executable paths and path-valued arguments bypass agent matching | verified |
| REV-012 | P2 | frontend | Mobile Grok icon has no dark-terminal treatment | fixed |
| REV-013 | P1 | backend | Grok ignores the configured asynchronous hook flag | verified |
| REV-014 | P2 | backend | Grok model catalog includes status lines as models | verified |
| REV-015 | P2 | frontend | Mobile identity refresh can publish the previous Computer's owner | fixed |
| REV-016 | P1 | backend | Grok run-config flags split `-p` from its prompt value | verified |
| REV-017 | P1 | frontend | Interactive Grok prompts incorrectly launch single-turn headless mode | verified |
| REV-018 | P1 | frontend | Hook settings bypass the selected relay Computer | fixed |
| REV-019 | P3 | tests | Grok hook tests leak process-wide HOME state | fixed |
| REV-020 | P1 | frontend | Web headless run config still split `-p` from the prompt | verified |
| REV-021 | P2 | frontend | Argument-free absolute agent executables were treated as CWDs | verified |
| REV-022 | P1 | backend | Descendants retaining probe pipes could bypass the identity deadline | verified |
| REV-023 | P1 | frontend | Hook settings could restore stale Computer state | fixed |
| REV-024 | P1 | backend | Automation discovery omitted `~/.grok/bin` | verified |
| REV-025 | P2 | backend | Hook management ignored `GROK_HOME` | verified |
| REV-026 | P2 | backend | Chunk boundaries could corrupt UTF-8 JSONL output | verified |

---

## REV-001 · Grok hooks detection treats any `agent` on PATH as Grok

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Grok Build hook detection treats bare `which agent` success as “Grok is installed”, without fingerprinting the binary. On machines where PATH’s `agent` is Cursor (or any other product), Atmos can:

1. Report Grok Build as **detected** in Settings / install-all.
2. Create `~/.grok/hooks/` (and thus a sticky `~/.grok`) even when Grok was never installed.
3. Write `atmos-status.json` under a home layout the user did not opt into.

This diverges from TECH M9 detection: “`which grok` / `which agent` **resolves to Grok fingerprint**”.

### Evidence

- `crates/core-engine/src/agent_hooks/grok_build.rs` (pre-fix) — `grok_detected()` treated any PATH `agent` as success.
- [TECH.md](./TECH.md) §3.1: detect if `~/.grok` **or** `which grok` / `which agent` **resolves to Grok fingerprint**.

### Required fix

- Treat bare `agent` as detection **only** when the resolved binary path fingerprints as Grok (`/.grok/` or `grok*` filename).
- Prefer `~/.grok` + `grok` on PATH as primary signals; do not create `~/.grok` solely because an unrelated `agent` exists.
- Unit tests for non-Grok agent and Grok-path agent.

### Acceptance

- [x] Cursor-only machine (or fixture with non-Grok `agent`) does not show Grok Build as detected.
- [x] Install does not create `~/.grok` when only a non-Grok `agent` is present.
- [x] Real `~/.grok` or Grok-fingerprinted `agent` still detects correctly.
- [x] `cargo test -p core-engine --lib grok` passes.

### Fix log

- 2026-07-16 — Replaced bare `which agent` with PATH scan + path fingerprint (`path_looks_like_grok`). Added unit tests `non_grok_agent_on_path_is_not_detected_and_does_not_create_home` and `agent_under_grok_home_path_is_detected`.
- Verification: `cargo test -p core-engine --lib grok` → 3 passed.

---

## REV-002 · Contested identity probe does not enforce timeout

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`run_with_timeout` for contested `agent` classification did **not** kill or cancel a hung binary. A stuck `agent --version` / `agent --help` could block `GET /hooks/cli-identity` indefinitely.

### Evidence

- Pre-fix: blocking `Command::output()` with post-hoc logging only.
- Endpoint: `apps/api/src/api/hooks/mod.rs` (`GET /hooks/cli-identity`).

### Required fix

- Enforce a real ~800ms timeout with kill on hang; fail open to no banner classification (`Unknown` when only banner would have classified).

### Acceptance

- [x] Hung `agent --version` fixture does not block identity resolution beyond ~3s budget in tests.
- [x] Timeout path yields no banner owner (path without fingerprint → `Unknown`).
- [x] `cargo test -p core-service --lib cli_identity` passes.

### Fix log

- 2026-07-16 — Implemented spawn + `try_wait` loop + `kill` after `PROBE_TIMEOUT_MS` (800ms). Added `hung_version_probe_times_out_and_returns_none` and `hung_binary_classifies_as_unknown_without_path_fingerprint`.
- Verification: `cargo test -p core-service --lib cli_identity` → 7 passed (timeout tests ~0.8s wall).

---

## REV-003 · Notification hook matcher may drop PermissionRequest

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Installed Grok Notification hooks used matcher `permission_prompt|elicitation_dialog`. If Grok does not accept that OR regex dialect, PermissionRequest never fires while install/check still look healthy.

### Evidence

- Pre-fix install matcher OR pattern; server filter already correct in `agent_hooks/grok_build.rs`.
- [TECH.md](./TECH.md) open question on matcher dialect.

### Required fix

Install Notification with broad matcher `.*`; keep server-side allowlist for `permission_prompt` / `elicitation_dialog`.

### Acceptance

- [x] Install fixture no longer embeds `permission_prompt|elicitation_dialog`.
- [x] Notification hook section still present with ATMOS_MANAGED curl.
- [x] Server-side notification filter unchanged (existing unit tests still pass).

### Fix log

- 2026-07-16 — Notification matcher set to `.*`; install lifecycle test asserts OR matcher is gone and Notification remains.
- Verification: `cargo test -p core-engine --lib grok` + `cargo test -p core-service --lib grok` (state mapping) green.

---

## REV-004 · Canvas pin path omits contestedOwners

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Canvas pin naming did not pass `contestedOwners`, so freehand `agent` pins could bake a raw/wrong title.

### Evidence

- `use-terminal-grid-canvas-pins.ts` previously called `getTerminalDisplayMeta` without contested owners.

### Required fix

Pass `useContestedCliOwners()` into pin `getTerminalDisplayMeta`.

### Acceptance

- [x] Pin path includes `contestedOwners` in dependency list and meta call.
- [x] Title unit matrix still green (`bun test` terminal-title).

### Fix log

- 2026-07-16 — Wired `useContestedCliOwners` in `use-terminal-grid-canvas-pins.ts`.
- Verification: `bun test apps/web/src/features/terminal/components/__tests__/terminal-title.test.ts` → 8 passed.

---

## REV-005 · Mobile freehand `agent` identity not wired

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Mobile terminal header used shared title helpers without `contestedOwners`, so freehand `agent` could not brand correctly.

### Evidence

- `TerminalScreen.tsx` pre-fix: no cli-identity fetch.

### Required fix

Fetch `/hooks/cli-identity` via active computer HTTP gateway + client token; pass owners into `getTerminalDisplayMeta`.

### Acceptance

- [x] `useContestedCliOwners` hook probes gateway with fail-open `unknown`.
- [x] Terminal header + entry labels use contested owners map.
- [x] Unique cmds still work when owners map empty.

### Fix log

- 2026-07-16 — Added `apps/mobile/src/features/terminal/use-contested-cli-owners.ts`; wired through `TerminalScreen` display meta.
- Verification: shared title tests still pass; hook is fail-open on network errors (no local Grok binary required on phone).

---

## REV-006 · Unknown `agent` can fall back to a stale agent label

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`resolveAgentForTitle` correctly returns no match for bare `agent` when the owner is unknown, but `getTerminalDisplayMeta` then falls back to the persisted/base-title agent. A pane previously titled `Cursor Agent` or `Grok Build` can therefore display that old brand while an unknown bare `agent` is running. This violates PRD M7's requirement to show raw `agent` and never invent a brand.

### Evidence

- `packages/shared/src/terminal/title.ts:223-233` - contested owner `unknown` returns `undefined`.
- `packages/shared/src/terminal/title.ts:291-305` - `labelAgent` is still selected after the contested match fails.
- Reproduction:
  `getTerminalDisplayMeta({ baseTitle: "Cursor Agent", dynamicTitle: "agent", contestedOwners: { agent: "unknown" }, ... })`
  returns `displayTitle: "Cursor Agent"` and `toolbarAgent.id: "cursor"`.
- [PRD.md](./PRD.md) M7 - missing or unknown must show raw `agent`.

### Required fix

Treat an unresolved contested dynamic token as authoritative: suppress base-label and persisted-agent fallback for that render, while retaining those fallbacks for runtime-wrapper/version titles.

### Acceptance

- [x] Unknown/missing owner + base title `Cursor Agent` displays raw `agent` with no toolbar agent.
- [x] Unknown/missing owner + base title `Grok Build` displays raw `agent` with no toolbar agent.
- [x] Known Grok/Cursor owners still resolve correctly.
- [x] Existing runtime-wrapper fallback tests remain green.

### Fix log

- 2026-07-16 - Second-pass review reproduced the stale-label fallback with a direct Bun invocation.
- 2026-07-16 - `getTerminalDisplayMeta` now treats unresolved contested `agent` as authoritative and skips stale persisted/base-agent fallback. Covered by S9/S10/S11 title tests.
- Verification: focused Bun suite passed (27 tests); web typecheck passed.

---

## REV-007 · Mobile Grok icon is stored outside the required bundle path

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`MobileAgentIcon.tsx` statically requires `apps/mobile/assets/agents/grok-build.png`, but the new asset is located at `apps/mobile/src/assets/agents/grok-build.png`. Metro cannot resolve the require target, so including the new icon can break the mobile bundle.

### Evidence

- `apps/mobile/src/features/terminal/MobileAgentIcon.tsx:50` - `require("../../../assets/agents/grok-build.png")` resolves from `src/features/terminal` to `apps/mobile/assets/agents/grok-build.png`.
- Git status lists only `apps/mobile/src/assets/agents/grok-build.png`; reading the required `apps/mobile/assets/agents/grok-build.png` returns file-not-found.

### Required fix

Move the PNG to `apps/mobile/assets/agents/grok-build.png`, matching all existing mobile agent assets and the static require.

### Acceptance

- [x] The exact static require target exists.
- [ ] iOS and Android Metro bundles resolve `MobileAgentIcon`.
- [ ] `MobileAgentIcon` renders `grok-build` without falling back to `BotIcon`.

### Fix log

- 2026-07-16 - Mobile export could not reach asset resolution because the local dependency install is also missing `babel-preset-expo`; path inspection independently confirms the broken target.
- 2026-07-16 - Corrected the static require to the committed `src/assets/agents/grok-build.png`.
- 2026-07-16 - Normalized the asset into `apps/mobile/assets/agents/` and restored the same static require depth used by every other mobile agent icon.
- Verification gap: a fresh `expo export --platform ios` reached Metro startup but failed while constructing the transformer because the existing install lacks `babel-preset-expo`, before module graph/asset resolution.

---

## REV-008 · PATH lookup remains unbounded inside the identity endpoint

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

REV-002 bounded `agent --version` / `--help`, but the preceding `sh -lc "command -v agent"` still uses blocking `Command::output()` with no deadline. Login-shell startup files can block, so `GET /hooks/cli-identity` can still hang indefinitely and occupies an async API worker while doing so.

### Evidence

- `crates/core-service/src/service/cli_identity.rs:139-144` - unbounded shell process and blocking `.output()`.
- `apps/api/src/api/hooks/mod.rs:157-169` - the synchronous resolver runs directly inside the async handler.
- [TEST.md](./TEST.md) performance budget requires the contested identity probe to remain around 800 ms.

### Required fix

Bound the PATH-resolution subprocess as part of the same end-to-end probe deadline (or avoid the login shell and scan the API process PATH directly). Run blocking process work off the async runtime worker.

### Acceptance

- [x] A hanging PATH-resolution fixture returns `Unknown` within the documented budget.
- [x] The complete endpoint, not only banner probing, has a bounded duration.
- [x] The Axum handler does not perform blocking process waits on a Tokio worker.

### Fix log

- 2026-07-16 - Second-pass review found the remaining unbounded stage after REV-002 verification.
- 2026-07-16 - Replaced login-shell lookup with direct executable PATH scanning, shared the deadline across banner probes, and moved the resolver to `spawn_blocking`.
- Verification: core-service's 176-test suite and API's 22-test suite passed, including timeout and endpoint response tests.

---

## REV-009 · Web identity cache is reused across different Computers

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The web hook caches one module-global owner without a key for the active local/relay API target. Switching to another Computer can reuse the previous machine's owner for up to 60 seconds, so bare `agent` may be branded from the wrong machine.

### Evidence

- `apps/web/src/features/terminal/hooks/use-contested-cli-owners.ts:9-19` - cache lookup is based only on time.
- `apps/web/src/features/terminal/hooks/use-contested-cli-owners.ts:22-24` - the active HTTP target is resolved only after the unkeyed cache has missed.
- The hook does not subscribe to active Computer identity changes; its next non-forced interval may continue returning the old cache entry.

### Required fix

Key cache/in-flight state by the resolved API target or selected Computer id, clear it when connection identity changes, and immediately refresh after a Computer switch.

### Acceptance

- [ ] Switching between two Computers with different `agent` owners updates the title without waiting for TTL.
- [ ] A cached local result is never reused for relay mode (or vice versa).
- [ ] Tests cover target switching and an in-flight response from the previous target.

### Fix log

- 2026-07-16 - Found during second-pass review of local/relay title behavior.
- 2026-07-16 - Web owner cache and pending requests are now keyed by selected Computer plus resolved API target; target switches publish only matching cached state and refresh immediately.
- Verification gap: deterministic target-switch hook coverage is still pending.

---

## REV-010 · Per-pane focus refresh can fan out identity probes

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

`useContestedCliOwners` is mounted in each mosaic pane and toolbar/pin consumer. Every instance registers a focus listener, and forced refresh intentionally bypasses the shared `inFlight` promise. Focusing a window with many panes can issue one identity request per consumer; concurrent backend cache misses can each spawn shell/banner probes.

### Evidence

- `apps/web/src/features/terminal/components/terminal-mosaic-scoped-pane-window.tsx:121-123` - one hook instance per pane.
- `apps/web/src/features/terminal/hooks/use-contested-cli-owners.ts:18-20` - in-flight dedupe applies only when `force` is false.
- `apps/web/src/features/terminal/hooks/use-contested-cli-owners.ts:56-64` - every mounted instance owns a focus listener and interval.

### Required fix

Expose contested-owner state through one connection-scoped external store/provider, or otherwise share one listener/timer. A forced refresh should invalidate cached data but still join an already-running request.

### Acceptance

- [ ] One focus event causes at most one `/hooks/cli-identity` request regardless of pane count.
- [ ] Concurrent refresh callers share one in-flight request.
- [ ] Unmounting terminal surfaces leaves no orphaned timer/listener.

### Fix log

- 2026-07-16 - Found during second-pass frontend lifecycle review.
- 2026-07-16 - Replaced per-hook timers/listeners with one ref-counted external-store manager; forced refreshes still join an existing request.
- Verification gap: pane-count/focus fan-out is verified by design inspection, not an executable hook harness.

---

## REV-011 · Executable paths and path-valued arguments bypass agent matching

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The matcher is designed to normalize the first token to its basename, but it exits early whenever any part of the title contains `/`. Absolute executables such as `/Users/me/.grok/bin/grok --always-approve` remain raw, and so do ordinary commands with path-valued arguments such as `grok --cwd /tmp/project`.

### Evidence

- `packages/shared/src/terminal/title.ts:133-136` - command normalization supports basename extraction.
- `packages/shared/src/terminal/title.ts:194-201` - `isPathLikeTitle(title)` returns before that normalization can be used.
- Direct reproduction with `/Users/me/.grok/bin/grok --always-approve` returns no `toolbarAgent`.
- The same early return applies to `grok --cwd /tmp/project` because `isPathLikeTitle` checks `trimmed.includes("/")` across the whole command line.
- [TECH.md](./TECH.md) §5.1 requires first-token basename normalization.

### Required fix

Distinguish a bare CWD/path title from a command line whose first token is an executable path, then exact-match the executable basename.

### Acceptance

- [x] Absolute-path `grok` resolves to Grok Build.
- [x] Absolute-path `cursor-agent` resolves to Cursor Agent.
- [x] Cursor's versioned `.../cursor-agent/versions/.../agent` path resolves without arguments.
- [x] `grok` / `cursor-agent` with path-valued arguments still resolves from the first token.
- [x] Bare CWD titles remain path titles and do not become agents.
- [x] Paths containing spaces/quoted executable tokens have explicit behavior and tests.

### Fix log

- 2026-07-16 - Reproduced with a direct Bun invocation.
- 2026-07-16 - Added quoted/escaped first-token parsing and basename matching while preserving bare filesystem titles.
- 2026-07-16 - Added strong Cursor/Grok installation-path fingerprints for argument-free legacy `agent` executable paths outside `bin`.
- Verification: absolute executable, quoted executable, path-valued argument, and bare-path Bun cases passed.

---

## REV-012 · Mobile Grok icon has no dark-terminal treatment

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The supplied mobile PNG is near-black, while the dark terminal background is also near-black. Grok Build is not included in the mobile tint/theme handling, so after REV-007 is fixed the icon will be effectively invisible in dark mode.

### Evidence

- `apps/mobile/assets/agents/grok-build.png` - black Grok glyph on transparency.
- `apps/mobile/src/features/terminal/MobileAgentIcon.tsx:27,88-96,109-113` - only `INVERTED_THEME_ICONS` receive terminal foreground tint; `grok-build` is absent.
- `apps/mobile/src/theme/colors.ts:76-77` - dark terminal background `#09090b`, foreground `#f8f8f8`.
- [TEST.md](./TEST.md) S21 requires the icon to be visible in light and dark themes.

### Required fix

Use a theme-appropriate mobile asset pair or tint the monochrome Grok PNG with the terminal foreground color in dark mode.

### Acceptance

- [ ] Grok icon is visibly distinct in light and dark terminal headers.
- [ ] The icon remains brand-correct and is not replaced by the generic bot.
- [ ] Light/dark mobile smoke evidence is recorded for S21.

### Fix log

- 2026-07-16 - Found by comparing the shipped PNG pixels with mobile terminal theme colors.
- 2026-07-16 - Added `grok-build` to mobile's monochrome terminal-foreground tint set.
- Verification gap: light/dark device smoke remains pending.

---

## REV-013 · Grok ignores the configured asynchronous hook flag

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Every high-frequency Atmos prompt/tool/notification handler includes `"async": true`, but the current Grok Build hook schema has no `async` field and silently ignores unknown handler fields. Grok therefore waits for `cat | curl` to finish on those events (while SessionStart/SessionEnd are explicitly synchronous). If the local API is slow or wedged, Grok can pause for the hook runner's five-second default timeout per event, contradicting the status-only, fail-open design and making Atmos availability affect the user's agent workflow.

### Evidence

- `crates/core-engine/src/agent_hooks/grok_build.rs:54-107` - prompt/tool/notification/stop handlers are generated with `"async": true`; only SessionStart/SessionEnd use explicit synchronous timeouts.
- [TECH.md](./TECH.md) §4.3 requires hook commands to be asynchronous and status-only.
- Current upstream `xai-grok-hooks/src/config.rs` `RawHandler` accepts only `type`, `command`, `url`, `timeout`, and `env`; it has no `async` member and does not deny unknown fields.
- Current upstream `xai-grok-hooks/src/runner/command.rs` awaits `child.wait_with_output()` under `spec.timeout_ms`; the default timeout is five seconds.

### Required fix

Make the generated command genuinely fire-and-forget using syntax supported by Grok's command runner, while first consuming/copying stdin so the background sender retains the complete event payload. Add an explicit short network deadline and preserve silent fail-open behavior. Do not rely on the unsupported `async` JSON property.

### Acceptance

- [x] Hook installation no longer relies on an unsupported `async` field.
- [x] A deliberately slow or unreachable Atmos endpoint does not delay Grok prompt/tool execution beyond a small local spawn budget.
- [x] The detached sender receives and posts the complete stdin JSON payload.
- [x] Hook failures remain non-blocking and do not emit user-visible hook errors.
- [x] An integration-style test exercises the generated shell command against a slow endpoint.

### Fix log

- 2026-07-16 - Confirmed against the current `xai-org/grok-build` hook config schema and command runner.
- 2026-07-16 - Removed unsupported async fields. High-frequency commands consume stdin into a shell variable, launch a fully redirected background curl with short network deadlines, and return immediately.
- Verification: `detached_hook_returns_before_slow_sender_and_preserves_payload` passed against a deliberately slow local endpoint.
- Upstream verification: current `xai-grok-hooks` runs the shell via `wait_with_output()` with `kill_on_drop(true)` but does not kill its detached process group after a normal shell exit. Because the sender redirects inherited stdio, the shell completes and the sender survives; timeout cleanup applies only while the shell is still running.

---

## REV-014 · Grok model catalog includes status lines as models

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The Grok manifest routes `grok models` through the generic `line_list` parser. Current Grok output includes `You are logged in with grok.com.` and `Default model: grok-4.5` before the actual list; neither line is filtered, so both become selectable model ids. Selecting either bogus entry passes it to `grok --model` and causes the run to fail.

### Evidence

- `resources/terminal-agents/builtin_agents.json` - `grok-build.modelList` executes `grok models` with parser `line_list`.
- `crates/core-service/src/service/automation/agents.rs:710-737` - `parse_line_model_catalog` skips only empty lines, `Available models`, exact `model(s)`, and headings ending in `:`.
- Local current CLI output:
  `You are logged in with grok.com.`, `Default model: grok-4.5`, `Available models:`, then the two bullet entries.
- `crates/core-service/src/service/automation/agents.rs:1635-1646` - the added test omits the real preamble, so it cannot catch the bogus options.

### Required fix

Use a Grok-specific catalog parser (preferred) that starts after `Available models:` and accepts only its bullet rows, or otherwise make the line parser explicitly discard the login/default preamble without regressing other agents. Keep default selection derived from the bullet's `(default)` suffix.

### Acceptance

- [x] Current `grok models` output produces exactly `grok-4.5` and `grok-composer-2.5-fast`.
- [x] Login and `Default model:` lines never appear in Agent Select.
- [x] The real multi-line output, including preamble, is covered by a unit test.
- [x] Existing agents using `line_list` retain their catalog behavior.

### Fix log

- 2026-07-16 - Reproduced with the installed current Grok CLI; the parser would return four entries instead of two.
- 2026-07-16 - Added the `grok_line_list` parser, which begins after `Available models:` and accepts only bullet rows.
- Verification: `grok_model_catalog_ignores_status_preamble` passed; full core-service suite passed (176 tests).

---

## REV-015 · Mobile identity refresh can publish the previous Computer's owner

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The mobile hook keeps one global owner, cache key, and in-flight promise. Switching Computers does not clear the component's current owner before the new request finishes, and an older request can overwrite the global owner after the cache key has already changed. A slow response from Computer A can therefore be stored under Computer B's gateway key and make later B cache hits show A's `agent` brand.

### Evidence

- `apps/mobile/src/features/terminal/use-contested-cli-owners.ts:7-10` - all targets share one mutable owner/key/promise tuple.
- `apps/mobile/src/features/terminal/use-contested-cli-owners.ts:38-65` - the key changes before awaiting, but completion writes `cachedOwner` without verifying that the response still belongs to the current key; any completion also clears the shared `inFlight`.
- `apps/mobile/src/features/terminal/use-contested-cli-owners.ts:78-97` - state initializes from the unqualified global owner and is not reset when `gateway_url` changes.
- PRD M7 requires missing/unknown identity to remain raw rather than showing an invented brand.

### Required fix

Store cache and in-flight promises per gateway/Computer key. On active-session change, immediately publish only a matching cached value (otherwise unknown), and ignore stale completions for the current component state. Include a request-generation or key check before committing results.

### Acceptance

- [ ] Switching from A to B never renders A's owner for B, including during loading.
- [ ] An A response that resolves after B cannot overwrite B's cache or visible state.
- [ ] Concurrent requests for different gateways retain separate in-flight state.
- [ ] A focused hook test covers out-of-order completion and target switching.

### Fix log

- 2026-07-16 - Found by tracing cache mutation and effect order across `activeClientSession` changes.
- 2026-07-16 - Mobile now keeps per-Computer/gateway caches and in-flight requests; an active-key guard prevents stale completions from becoming visible.
- Verification gap: out-of-order hook coverage is still pending; mobile typecheck is blocked by the pre-existing missing `sf-symbols-typescript` module.

---

## REV-016 · Grok run-config flags split `-p` from its prompt value

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The built-in headless args end in `-p`, but model/reasoning args are appended afterward and the actual prompt is appended only when the invocation is built. Any Grok automation with a selected model or reasoning effort therefore produces `grok ... -p --model ... <prompt>` (or `-p --reasoning-effort ... <prompt>`). Grok requires the prompt immediately after `-p` and exits with argument error, so M2's run configuration does not work.

### Evidence

- `resources/terminal-agents/builtin_agents.json` - Grok `params` ends with `-p`.
- `crates/core-service/src/service/automation/agents.rs:335-346` - parsed base flags are extended with `build_run_config_args`.
- `crates/core-service/src/service/automation/agents.rs:170-180` and the process launcher append the prompt after the complete args vector; `PromptFlag` does not preserve a flag/value pair.
- Direct current-CLI reproduction:
  `grok --always-approve --output-format streaming-json -p --model __atmos_invalid_model__ hello`
  exits 2 with `a value is required for '--single <PROMPT>' but none was supplied`.
- Existing tests assert the static params and run-config flags independently, but do not execute or assert the final ordered argv.

### Required fix

Represent the prompt flag structurally or insert run-config options before the trailing prompt flag, ensuring final argv is `... --model <id> --reasoning-effort <value> -p <prompt>`. Avoid a Grok-only string splice if the shared `PromptFlag` strategy can enforce correct ordering for all agents.

### Acceptance

- [x] Model-only Grok automation starts with `--model <id> -p <prompt>`.
- [x] Reasoning-only and model+reasoning invocations start successfully.
- [x] No-run-config invocation remains unchanged.
- [x] An argv-order unit test covers the final invocation, not only static manifest fields.
- [x] At least one current-CLI smoke run with a configured model reaches headless execution instead of Clap argument parsing failure.

### Fix log

- 2026-07-16 - Reproduced against the installed current Grok CLI using the exact generated ordering.
- 2026-07-16 - `PromptFlag` run-config options are inserted before the trailing prompt flag so `-p` remains adjacent to its prompt.
- Verification: argv-order unit test passed; corrected current-CLI smoke reached model validation (`unknown model id`) rather than the prior missing-`-p`-value parse error.

---

## REV-017 · Interactive Grok prompts incorrectly launch single-turn headless mode

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The shared interactive launch builder infers `-p` from Grok's automation params and reuses it when opening a terminal with an initial prompt. For Grok, `-p` means `--single`: the CLI prints one response and exits. A user launching Grok from New Workspace or another workspace prompt flow therefore gets a headless one-shot process instead of the interactive TUI required by PRD M2.

### Evidence

- `resources/terminal-agents/builtin_agents.json` - automation params contain `--output-format streaming-json -p`, while interactive params contain only `--always-approve`.
- `apps/web/src/features/agent/lib/terminal-agent-run-config.ts:300-313,351-364` - interactive `prompt_flag` handling derives the last automation-only flag (`-p`) and appends it to the interactive command.
- `apps/web/src/app-shell/CenterStage.tsx:664-687` - workspace prompt launch uses this plan in default interactive mode.
- Direct builder reproduction returns `{ launchCommand: "grok --always-approve -p 'fix this'" }`.
- Current `grok --help` defines `-p, --single <PROMPT>` as single-turn output that exits.

### Required fix

Give Grok an explicit interactive-prompt policy: pass the initial prompt positionally (`grok --always-approve '<prompt>'`) and reserve `-p` plus streaming JSON for headless automation. Prefer a manifest/schema field or strategy behavior over another agent-id-specific branch if it can stay simple.

### Acceptance

- [x] Interactive workspace prompt produces `grok --always-approve '<prompt>'` with no `-p`.
- [ ] The launched Grok process remains in its interactive TUI after the first response.
- [x] Headless automation still uses `--output-format streaming-json -p <prompt>`.
- [x] Agent Select/run-plan tests assert both Grok modes.

### Fix log

- 2026-07-16 - Reproduced by invoking `buildInteractiveAgentRunPlan` with the shipped Grok definition.
- 2026-07-16 - Interactive Grok prompts are positional; only headless automation retains streaming JSON and `-p`.
- Verification: Agent Select test asserts both command modes; live interactive-TUI persistence remains a manual check.
- 2026-07-16 - Acceptance checkboxes updated for automated coverage; only manual TUI persistence remains open.

---

## REV-018 · Hook settings bypass the selected relay Computer

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The settings card resolves a local runtime base and calls `fetch` directly for hook status and install/uninstall actions. In hosted web or Desktop relay mode, these requests do not use the active Computer's gateway or bearer token. Grok's M10 status row can therefore fail, show the local machine, or install/uninstall hooks on the wrong machine.

### Evidence

- `apps/web/src/features/settings/components/AgentHookStatusCard.tsx:71-149` - status and all install/uninstall actions call `httpBase(getRuntimeApiConfig())` directly.
- `apps/web/src/api/rest-api.ts:21-31,149-157` - the existing `resolveHttpFetchTarget` / `fetchHooksApi` path correctly selects relay gateway and authorization.
- `agentHooksApi.getCliIdentity` already uses that relay-aware path, demonstrating the expected transport for the same route group.
- PRD M10 requires Grok Build hook status and controls to have parity in the settings UX.

### Required fix

Move status, install-all, uninstall-all, install-tool, and uninstall-tool calls into the relay-aware `agentHooksApi` and consume that client from the component. Keep target resolution and authentication out of the feature component.

### Acceptance

- [ ] In relay mode, status and every hook mutation target the selected Computer gateway with its bearer token.
- [ ] Local mode still targets the local API.
- [ ] Switching Computers refreshes the report for the new target.
- [ ] A transport test covers URL, authorization, and install/uninstall method for relay mode.

### Fix log

- 2026-07-16 - Confirmed by comparing the settings component's direct fetches with the relay-aware hook API client.
- 2026-07-16 - Moved all hook status/install/uninstall calls to relay-aware `agentHooksApi`; the card subscribes to target identity and reloads when the selected Computer changes.
- Verification: relay transport test covers bearer auth and all five status/mutation URLs; focused web typecheck/lint passed.

---

## REV-019 · Grok hook tests leak process-wide HOME state

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P3 |
| **Area** | tests |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The new core-engine tests replace process-wide `HOME` but never restore it. Their mutex only coordinates tests in this module, so other concurrently running Rust tests can observe a temporary or already-deleted home directory, causing order-dependent failures or writes to the wrong fixture.

### Evidence

- `crates/core-engine/src/agent_hooks/grok_build.rs:290-335` - lifecycle test sets `HOME`, removes the temporary directory, and exits without restoration.
- `crates/core-engine/src/agent_hooks/grok_build.rs:339-413` - PATH is restored in the other tests, but HOME is still left changed.
- Rust's test runner executes tests from different modules concurrently; the module-local lock cannot protect those readers.

### Required fix

Use an RAII environment guard that restores both HOME and PATH on every exit/panic, or inject home/PATH lookup into the module so tests do not mutate global environment.

### Acceptance

- [ ] Each test restores original HOME and PATH even on panic.
- [ ] Running the full core-engine test suite repeatedly with multiple test threads is stable.
- [ ] Tests do not leave HOME pointing at a deleted directory.

### Fix log

- 2026-07-16 - Found during cross-module test-isolation review.
- 2026-07-16 - Hook lifecycle helpers now accept explicit home/PATH values; tests no longer mutate process-wide HOME or PATH.
- Verification: all Grok hook tests pass. The wider core-engine suite exposed unrelated intermittent Git fixture cleanup failures (`DirectoryNotEmpty`), while isolated reruns passed.

---

## REV-020 · Web headless run config still split `-p` from the prompt

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |

### Finding and resolution

The Rust automation path had been corrected, but the web workspace headless builder still appended model/reasoning flags after Grok's trailing `-p`. The run-plan builder now inserts structured options before a trailing prompt flag.

### Verification

- [x] `buildCommand(..., "headless")` asserts complete model + reasoning argv.
- [x] Focused Bun suite passes (27 tests).

---

## REV-021 · Argument-free absolute agent executables were treated as CWDs

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | frontend |

### Finding and resolution

The CWD guard rejected `/Users/me/.grok/bin/grok` and `/opt/bin/cursor-agent` when no arguments followed. Path-only titles under `bin`/`sbin` now qualify as executable paths; ordinary project paths remain CWD titles.

### Verification

- [x] Argument-free Grok/Cursor executable-path cases pass.
- [x] `/Users/me/projects/grok` remains unbranded.

---

## REV-022 · Descendants retaining probe pipes could bypass the identity deadline

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |

### Finding and resolution

After the probed parent exited, synchronous pipe draining could wait forever on a descendant that inherited stdout/stderr. Probes now run in a dedicated process group, drain pipes concurrently, terminate remaining group members, and collect output only within the shared deadline.

### Verification

- [x] Background-descendant inherited-pipe fixture completes within the deadline.
- [x] Hung parent fixtures remain bounded.
- [x] CLI identity suite passes (8 tests).

---

## REV-023 · Hook settings could restore stale Computer state

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |

### Finding and resolution

Target changes could leave the previous report visible, and late status/mutation responses could overwrite the selected Computer, including A→B→A reuse. Report/loading/action state now uses the shared Computer query scope (instance, connection epoch, relay revision), and every async completion must match both that scope and a monotonic request generation.

### Verification

- [x] Previous-target reports are hidden synchronously by derived target identity.
- [x] Late status and mutation completions are guarded.
- [x] A→B→A cannot reuse an earlier connection epoch or request generation.
- [x] Web typecheck and touched-file ESLint pass.
- [ ] A component-level out-of-order response test remains pending.

---

## REV-024 · Automation discovery omitted `~/.grok/bin`

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |

### Finding and resolution

API/Desktop processes with a sanitized PATH could miss the official Grok install directory. `~/.grok/bin` is now one of the supported user executable search paths.

### Verification

- [x] Executable fixture under a temporary `.grok/bin` resolves without PATH participation.

---

## REV-025 · Hook management ignored `GROK_HOME`

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |

### Finding and resolution

Install/check/uninstall always targeted `~/.grok`. They now resolve `${GROK_HOME}/hooks/atmos-status.json` when the environment variable is non-empty and otherwise retain the default.

### Verification

- [x] Custom-root lifecycle test installs, checks, and removes only the override path.
- [x] Grok hook suite passes (5 tests).

---

## REV-026 · Chunk boundaries could corrupt UTF-8 JSONL output

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |

### Finding and resolution

Structured stdout decoded each arbitrary read chunk independently, so a split multibyte character became replacement characters. JSONL state now buffers raw bytes through newline boundaries and decodes complete records.

### Verification

- [x] A Grok text event split inside an emoji round-trips Chinese text and emoji exactly.
- [x] Full core-service suite passes (179 tests).

---

## What looks solid (no finding)

| Area | Notes |
|------|--------|
| M1 built-in identity | `builtin_agents.json` has `grok-build` / `Grok Build` / `grok` / streaming parser. |
| Base registration/parsing | Built-in identity, Cursor `cursor-agent` migration, dedicated streaming parser, state mapping, and Grok settings metadata are wired; launch/catalog/relay defects are tracked above. |
| Layering | REST hooks + cli-identity justified; WS state path reused. |

## Verification run (post-fix)

```text
cargo test -p core-engine --lib grok            # 3 passed
cargo test -p core-service --lib cli_identity   # 7 passed
cargo test -p core-service --lib grok           # (state mapping still green if re-run)
bun test apps/web/.../terminal-title.test.ts    # 8 passed
```

## Verification run (second pass)

```text
cargo test -p core-engine --lib grok            # 3 passed
cargo test -p core-service --lib cli_identity   # 7 passed
cargo test -p core-service --lib grok           # 9 passed
cargo check -p api                              # passed
bun test apps/web/src/features/terminal/components/__tests__/terminal-title.test.ts
                                                   # 8 passed
bun --cwd apps/web typecheck                    # passed
bun --filter @atmos/mobile typecheck            # blocked: pre-existing/missing sf-symbols-typescript
bunx expo export --platform ios                 # blocked before bundling: missing babel-preset-expo
cargo test -p core-service --lib service::automation
                                                   # 53 passed
grok ... -p --model __atmos_invalid_model__ hello
                                                   # reproduced REV-016: exits 2, missing -p value
bun test apps/web/src/features/wiki/components/__tests__/agent-select.test.ts
                                                   # 12 passed; no Grok case, confirming the coverage gap
cargo test -p core-engine --lib agent_hooks       # 14 passed
bun -e 'buildInteractiveAgentRunPlan(...)'        # reproduced REV-017: interactive command contains -p
```

## Verification run (all review fixes)

```text
cargo test -p core-service --lib                 # 179 passed
cargo test -p api                                # 22 passed
cargo test -p core-engine --lib agent_hooks::grok_build
                                                   # 5 passed
bun test <three focused APP-036 web test files>  # 27 passed
bun --cwd apps/web typecheck                    # passed
bunx eslint <touched APP-036 web files>         # 0 errors, 1 pre-existing img warning
cargo clippy -p core-engine -p core-service -p api --all-targets --no-deps
                                                   # passed with 4 unrelated existing warnings
grok ... --model __atmos_invalid_model__ -p hello
                                                   # reached model validation; argv parsed correctly
```

Remaining verification gaps:

- No API-harness test covers `POST /hooks/grok-build`; service-level state mapping is covered.
- Web/mobile target-switch cache behavior has design-level review but no dedicated hook harness.
- Mobile typecheck/export is blocked by missing `sf-symbols-typescript` / `babel-preset-expo` in the existing dependency install.
- Manual S14 PATH/TUI matrix, S19/S20 settings and Agent Select, and S21 light/dark icon checks remain unrecorded.
- The full core-engine suite intermittently fails unrelated Git fixture teardown with `DirectoryNotEmpty`; isolated reruns pass.

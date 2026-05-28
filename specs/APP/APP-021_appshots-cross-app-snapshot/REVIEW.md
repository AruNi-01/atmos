# REVIEW · APP-021: Appshots Cross-App Snapshot - Implementation Review

> Post-implementation review log for functional completeness, architecture, maintainability, code size, testability, and follow-up fixes. Complements the planning quartet ([BRAINSTORM](./BRAINSTORM.md) -> [PRD](./PRD.md) -> [TECH](./TECH.md) -> [TEST](./TEST.md)); does not replace them.

**Review date**: 2026-05-28
**Review scope**: functional review + quality review
**Related code**: `apps/desktop/src-tauri/src/appshot`, `apps/web/src/features/appshot`, `apps/web/src/features/welcome/components/PromptComposer.tsx`, `apps/web/src/features/automations/components/AutomationSetup.tsx`

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | frontend | Automation composer did not resolve shared composer tokens | verified |
| REV-002 | P2 | backend | Accepted pending captures are not copy-atomic or retryable | verified |
| REV-003 | P2 | backend | Permission-blocked pending captures never expire | verified |
| REV-004 | P2 | performance | Preview and history payloads embed full PNGs | verified |
| REV-005 | P2 | backend | Native capture subprocesses have no timeout | verified |
| REV-006 | P2 | test | Required history, gating, record, and redaction coverage is missing | verified |
| REV-007 | P1 | backend | Long target pages can block window lookup and drop screenshots | verified |

---

## REV-001 · Automation composer did not resolve shared composer tokens

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Appshot protocol parsing is implemented in the shared `PromptComposer`, and the updated product scope requires both Welcome and Automation setup to behave as supported prompt composers. Automation setup reused `WelcomeComposerCard`/`PromptComposer`, but originally submitted `instructions.trim()` directly without expanding Appshot chips, `@file` chips, or pasted image placeholders into agent-readable paths. As a result, a saved automation could persist internal composer tokens literally.

### Evidence

- `apps/web/src/features/welcome/components/PromptComposer.tsx:63` - `TOKEN_REGEX` recognizes `[#appshot:<timestamp>]` globally inside the shared composer.
- `apps/web/src/features/welcome/components/PromptComposer.tsx:587` - paste handling parses any first-line Appshot protocol and inserts an Appshot chip.
- `apps/web/src/features/automations/components/AutomationSetup.tsx` - automation setup reuses `WelcomeComposerCard`, so it must also reuse the Welcome composer submit-time resolver.
- `specs/APP/APP-021_appshots-cross-app-snapshot/PRD.md` - product scope now lists Welcome and Automation setup as supported composers.
- `specs/APP/APP-021_appshots-cross-app-snapshot/TECH.md` - technical design now requires Automation setup to expand Appshot and `@file` placeholders and send pasted image attachments to the automation backend.

### Required fix

Keep `PromptComposer` shared, update PRD/TECH/TEST to include Automation setup as a supported composer, and make Automation setup use the same placeholder resolution and attachment persistence path as workspace creation.

### Acceptance

- [x] Pasting Appshot protocol text into the Welcome composer renders one compact Appshot label and submits the protocol prompt text.
- [x] Pasting the same text into Automation setup renders one compact Appshot label and submit explicitly expands it after the PRD/TECH/TEST update.
- [x] Automation setup supports the same image paste path and backend attachment resolution as workspace creation.

### Fix log

- 2026-05-28 - Product scope updated in `PRD.md`, `TECH.md`, and `TEST.md` to treat Automation setup as a supported prompt composer.
- 2026-05-28 - `AutomationSetup` now uses shared `WelcomeComposerCard` attachment, `@file`, `/skill`, and Appshot placeholder flows; submit calls `resolvePromptPlaceholders` and sends image attachment payloads to the automation service.
- 2026-05-28 - Automation backend now writes pasted image attachments under `~/.atmos/automations/definitions/{automation_guid}/attachments/` and replaces `[#img-n]` tokens with absolute paths before validation/persistence.
- 2026-05-28 - Verified with `bun --filter web typecheck`, focused web placeholder tests, and `cargo test -p core-service resolves_written_attachment_tokens_to_paths`.

---

## REV-002 · Accepted pending captures are not copy-atomic or retryable

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Accepting a pending Appshot removes it from memory before the record write and clipboard copy complete. `records::write_record` finalizes the record directory before calling `pbcopy`; if the clipboard write fails, the command returns an error after the pending entry is gone and the record has already been persisted. The UI then cannot retry the same pending capture because a second Copy sees "no longer pending"; native auto-accept also ignores that error entirely.

### Evidence

- `apps/desktop/src-tauri/src/appshot/pending.rs:51` - `accept` removes the pending capture from the map before writing/copying.
- `apps/desktop/src-tauri/src/appshot/records.rs:110` - the temp directory is renamed into final `records/{timestamp}` before clipboard copy.
- `apps/desktop/src-tauri/src/appshot/records.rs:117` - `pbcopy` failure is returned after the final record exists.
- `apps/desktop/src-tauri/src/appshot/pending.rs:68` - native auto-accept discards the accept result and does not surface copy failure.
- `apps/web/src/features/appshot/components/AppshotCapturePreview.tsx:57` - UI shows the copy error, but retrying the same pending id is no longer possible.

### Required fix

Make pending acceptance resolve atomically from the user perspective. Either copy before removing the pending entry, keep enough accepted-record state to retry clipboard copy, or return a successful response with the saved timestamp plus a clear copy failure state and a retry action. Native auto-accept should surface or log the copy failure without silently losing it.

### Acceptance

- [x] If clipboard copy fails, the user can retry copying the saved Appshot reference or the pending preview remains recoverable.
- [x] Auto-accept failures do not silently disappear.
- [x] Targeted native tests or an injected clipboard failure path cover the behavior.

### Fix log

- 2026-05-28 - Fixed in native backend: pending accept now keeps recoverable state on write/copy failure, retries copy the same saved timestamp, discard cleans up a saved-but-not-copied record, and auto-accept logs failures. Added injected clipboard failure test.
- 2026-05-28 - Verified with `cargo test -p atmos-desktop appshot`.

---

## REV-003 · Permission-blocked pending captures never expire

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

Pending captures with any denied permission are inserted into the in-memory pending map with `expires_in_ms = 0`. The native auto-accept path is only scheduled when `expires_in_ms > 0`, and there is no separate cleanup. Repeated captures while Screen Recording or Accessibility is denied can accumulate pending entries containing captured metadata/context until the app exits.

### Evidence

- `apps/desktop/src-tauri/src/appshot/pending.rs:25` - pending insertion detects any denied permission.
- `apps/desktop/src-tauri/src/appshot/pending.rs:38` - denied-permission previews get `expires_in_ms: 0`.
- `apps/desktop/src-tauri/src/appshot/pending.rs:44` - the denied-permission capture is still inserted into the pending map.
- `apps/desktop/src-tauri/src/appshot/mod.rs:95` - native auto-accept is only scheduled for positive `expires_in_ms`.

### Required fix

Add an explicit cleanup policy for non-expiring previews. Options include not storing non-acceptable permission previews, expiring them after a longer bounded window, replacing the previous pending preview when a new one arrives, or discarding them after the user opens permissions. Keep permission recovery visible without retaining unbounded captured data.

### Acceptance

- [x] Repeated permission-denied captures cannot grow the pending map without bound.
- [x] Permission recovery UI remains usable.
- [x] A native unit test or small test-only hook proves denied-permission pending entries are cleaned up or bounded.

### Fix log

- 2026-05-28 - Fixed in native backend: denied-permission previews are internally bounded by TTL and replacement policy, so repeated blocked captures keep at most one blocked pending entry. Added unit coverage for replacement behavior.
- 2026-05-28 - Verified with `cargo test -p atmos-desktop appshot`.

---

## REV-004 · Preview and history payloads embed full PNGs

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | performance |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The preview event and history detail API encode the full `snapshot.png` as base64/data URLs. A Retina full-window screenshot can be several MB, so a single shortcut event can push a large payload through Tauri event serialization and React state, and the history popover can load up to ten full screenshots for thumbnail rows. This conflicts with the lightweight preview/history intent and the TEST performance budget.

### Evidence

- `apps/desktop/src-tauri/src/appshot/pending.rs:20` - the pending preview base64-encodes `captured.screenshot_png` directly.
- `apps/desktop/src-tauri/src/appshot/records.rs:206` - each visible history detail reads `snapshot.png` into a data URL.
- `apps/desktop/src-tauri/src/appshot/records.rs:260` - `read_snapshot_data_url` base64-encodes the entire PNG.
- `apps/web/src/features/appshot/components/AppshotsHistoryPopover.tsx:94` - history reads details for the first 10 visible timestamps.
- `specs/APP/APP-021_appshots-cross-app-snapshot/TEST.md:143` - history should render first 10 detail rows within 300 ms for normal record sizes.

### Required fix

Use bounded thumbnails or file/blob URLs for UI previews. The native record can still preserve the full `snapshot.png`, but preview event payloads and history row thumbnails should be size-capped and should not inline ten full-resolution images.

### Acceptance

- [x] Preview payload size is bounded independently of source window size.
- [x] History details for the first 10 rows do not inline ten full-resolution screenshots.
- [x] A test or measurement documents the payload cap and verifies thumbnail rendering.

### Fix log

- 2026-05-28 - Native preview/history payloads now use `MAX_INLINE_SNAPSHOT_BYTES`; full `snapshot.png` stays on disk, while oversized inline images are omitted with a warning.
- 2026-05-28 - Web preview/history state now applies payload sanitizers, and history reads details in bounded batches instead of inlining all 10 row thumbnails at once.
- 2026-05-28 - Verified with `cargo test -p atmos-desktop appshot`, focused web Appshot tests, and `bun --filter web typecheck`.

---

## REV-005 · Native capture subprocesses have no timeout

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The macOS v1 backend shells out to `osascript` and `screencapture` without any timeout or cancellation. If System Events stalls on a target app, secure input mode, permission prompt, or a hung accessibility tree traversal, the capture task can sit indefinitely and the user may see no preview or recovery state. This is especially risky because the global shortcut can be pressed repeatedly.

### Evidence

- `apps/desktop/src-tauri/src/appshot/macos.rs:116` - capture work is offloaded to `spawn_blocking`, but no deadline is applied.
- `apps/desktop/src-tauri/src/appshot/macos.rs:438` - `screencapture` waits for process completion without timeout.
- `apps/desktop/src-tauri/src/appshot/macos.rs:513` - `run_osascript` uses `Command::output()` without timeout for both frontmost-window and accessibility traversal.
- `specs/APP/APP-021_appshots-cross-app-snapshot/TEST.md:141` - happy-path capture preview has p50/p95 timing expectations.

### Required fix

Wrap each external process with a bounded timeout and return a partial Appshot with warnings when a subprocess exceeds the deadline. Longer-term, move toward direct macOS APIs where practical, but v1 should not allow unbounded subprocess waits.

### Acceptance

- [x] Hung `osascript` or `screencapture` calls fail into a visible warning/error within a defined deadline.
- [x] Repeated shortcut presses cannot accumulate indefinitely blocked capture workers.
- [x] A targeted test or injected command runner covers timeout behavior.

### Fix log

- 2026-05-28 - Fixed in native backend: frontmost-window `osascript`, accessibility-tree `osascript`, and `screencapture` now run through a timeout-bound process wrapper and downgrade failures to warnings/partial capture. Added command-runner timeout tests.
- 2026-05-28 - Verified with `cargo test -p atmos-desktop appshot`.

---

## REV-006 · Required history, gating, record, and redaction coverage is missing

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P2 |
| **Area** | test |
| **Reported by** | internal review |
| **Owner** | unassigned |

### Finding

The current automated coverage only validates protocol formatting/parsing, submit-time Appshot placeholder expansion, base64 helpers, timestamp validation, and preview truncation. The APP-021 TEST acceptance calls for coverage of Header history UI, web gating, canonical record file layout, and secure-field redaction, but those paths have no automated checks yet.

### Evidence

- `apps/web/src/features/appshot/__tests__/appshot-protocol.test.ts:9` - web Appshot tests cover parser behavior only.
- `apps/web/src/features/welcome/lib/__tests__/welcome-appshot-placeholders.test.ts:15` - Welcome tests cover placeholder expansion only.
- `apps/desktop/src-tauri/src/appshot/records.rs:281` - native record tests cover preview truncation only, not three-file layout or deletion.
- `apps/desktop/src-tauri/src/appshot/protocol.rs:17` - native protocol tests cover timestamp/prompt formatting only.
- `specs/APP/APP-021_appshots-cross-app-snapshot/TEST.md:167` - acceptance requires `bun test` coverage for protocol parsing, Welcome paste handling, submit expansion, Header history UI, and web gating.
- `specs/APP/APP-021_appshots-cross-app-snapshot/TEST.md:159` - acceptance requires canonical record file verification.
- `specs/APP/APP-021_appshots-cross-app-snapshot/TEST.md:150` - regression checklist requires secure text redaction checks.

### Required fix

Add focused tests for the high-risk paths: Header history pagination/copy/delete rendering with mocked Tauri client, Desktop-vs-browser gating, native record write/delete layout with an injectable data root or temp home, and redaction normalization independent of real macOS accessibility.

### Acceptance

- [x] Header history pagination/copy/delete behavior has a web test.
- [x] Browser/non-Tauri gating has a web test.
- [x] Native record write/delete creates and removes `snapshot.png`, `context.md`, and `metadata.json` under a test data root.
- [x] Secure-field redaction is covered without needing real OS accessibility.

### Fix log

- 2026-05-28 - Native coverage added: record layout/delete test for `snapshot.png`, `context.md`, and `metadata.json`; retryable clipboard failure test; permission-blocked replacement test; timeout-bound command runner tests; secure-field AppleScript redaction condition test.
- 2026-05-28 - Web coverage added: history pagination/copy/delete test, browser/non-Tauri gating test, Appshot payload guard test, and Welcome/Automation placeholder expansion behavior test.
- 2026-05-28 - Verified with focused web Appshot tests, `cargo test -p atmos-desktop appshot`, and `bun --filter web typecheck`.

---

## REV-007 · Long target pages can block window lookup and drop screenshots

| Field | Value |
|-------|--------|
| **Status** | verified |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | dogfood |
| **Owner** | unassigned |

### Finding

Dogfood records showed that the macOS capture path used System Events to identify the frontmost window and read bounds before screenshot capture. On long/heavy app pages, that lookup could time out, leaving `app_name: "Unknown App"` and no window bounds, so `snapshot.png` degraded to a 1x1 placeholder even though Screen Recording permission was granted. The same records also exposed an invalid AppleScript redaction condition that made every Accessibility tree capture fail with a syntax error.

### Evidence

- `~/.atmos/appshots/records/1779960519355/metadata.json` - `quality: "metadata_only"`, `app_name: "Unknown App"`, `snapshot.png` is 1x1, warnings include `frontmost window lookup timed out after 2500 ms`.
- `~/.atmos/appshots/records/1779960703397/metadata.json` and `1779960830548/metadata.json` - app/window screenshots were present, but Accessibility always failed with `syntax error: 预期是行的结尾，却找到标识符`.
- Previous `apps/desktop/src-tauri/src/appshot/macos.rs` coupled window bounds to System Events before running `screencapture -R`.

### Required fix

Make app/window identification and screenshot bounds independent from Accessibility traversal. Use fast native window metadata (`NSWorkspace` and CoreGraphics window list) for app, pid, window id, title, and bounds. Keep System Events only as a fallback/semantic tree path. Fix AppleScript redaction condition syntax so Accessibility failures represent target app limitations or timeout, not a generated script bug.

### Acceptance

- [x] Long or complex target pages can still produce app metadata and a real `snapshot.png` when Accessibility tree traversal times out.
- [x] Accessibility script no longer emits the redaction-condition syntax error.
- [x] Native tests cover frontmost window selection behavior and the redaction condition shape.

### Fix log

- 2026-05-28 - macOS capture now uses `NSWorkspace.frontmostApplication()` plus `CGWindowListCopyWindowInfo` for app identity and window bounds before screenshot capture; System Events is a fallback for metadata and remains the v1 Accessibility tree source.
- 2026-05-28 - `CapturedAppshot.window_id` is populated from CoreGraphics when available, and `context.md` includes Window ID.
- 2026-05-28 - AppleScript redaction clauses are parenthesized, fixing the observed syntax error.
- 2026-05-28 - Added native tests for pid-matched window selection, non-Atmos fallback selection, app-only selection, and redaction condition syntax. Verified with `cargo test -p atmos-desktop appshot`.

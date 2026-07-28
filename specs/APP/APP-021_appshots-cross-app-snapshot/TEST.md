# TEST · APP-021: Appshots Cross-App Snapshot

> Test Plan · how we verify global dual-shift Appshots, local records, protocol copy, history, and supported composer labels. References PRD APP-021 and TECH APP-021.

## Test strategy

- Unit / integration: Validate protocol formatting/parsing, record file layout, prompt expansion, payload caps, redaction, unsupported-platform responses, and permission state mapping without real OS capture.
- Desktop integration: Exercise Electron AppShot modules (`apps/desktop-electron/src/appshot`) and legacy Tauri commands with mocked or platform-gated backends where possible.
- End-to-end: Verify dual-shift capture, right-top preview, record persistence, clipboard protocol, Header history, and supported composer paste behavior in a Desktop build.
- Manual-only: Real macOS dual-shift gesture, Screen Recording, and Accessibility permission flows, because OS permission dialogs and cross-app capture are not stable in headless automation.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1       | S1, S10 |
| M2       | S1, S2, S3 |
| M3       | S2, S3 |
| M4       | S3, S5 |
| M5       | S3, S5, S8 |
| M6       | S3, S4, S8 |
| M7       | S6 |
| M8       | S6 |
| M9       | S7 |
| M10      | S7 |
| M11      | S7 |
| M12      | S7 |
| M13      | S8 |
| M14      | S9 |
| M15      | S10 |
| M16      | S11 |
| M17      | S12 |

## Scenarios

### S1 - Dual-shift captures from another app

- **Level**: Manual macOS Desktop plus native integration.
- **Given**: Atmos Desktop (Electron production) is running with required permissions and another app is focused.
- **When**: the user holds **Left Shift + Right Shift**.
- **Then**: Atmos captures the focused external app (not Atmos) and emits a pending preview event.
- **Signals**: preview event has `preview_id`, app/window metadata, `source_bounds` when known, screenshot preview when available, and `expires_in_ms: 6000`; `appshot_status.trigger.required_modifiers` is `["left_shift","right_shift"]`.

### S2 - Preview popover resolves by delete

- **Level**: E2E / native integration.
- **Given**: a pending Appshot preview is visible in the right-top popover.
- **When**: the user clicks Delete before 6 seconds elapse.
- **Then**: the pending capture is discarded, no record directory is written, and clipboard content is unchanged.
- **Signals**: `appshot_discard_pending` succeeds; `~/.atmos/appshots/records/{timestamp}/` is absent; popover disappears.

### S3 - Preview popover resolves by copy or timeout

- **Level**: E2E / native integration.
- **Given**: a pending Appshot preview is visible.
- **When**: the user clicks Copy, or takes no action for 6 seconds.
- **Then**: Atmos writes a timestamped record directory and copies protocol prompt text.
- **Signals**: record path is `~/.atmos/appshots/records/{13-digit timestamp}/`; clipboard starts with `atmos://appshots/{timestamp}`; popover disappears.

### S4 - Protocol parser accepts only Appshot first-line references

- **Level**: Unit.
- **Given**: plain text payloads with `atmos://appshots/{timestamp}` on the first line, later in the body, malformed timestamps, and unrelated text.
- **When**: `parseAppshotProtocol` runs.
- **Then**: only payloads whose first line matches `atmos://appshots/<13 digits>` are treated as Appshots.
- **Signals**: accepted payload returns timestamp and prompt text; rejected payload remains ordinary pasted text.

### S5 - Record directory contains canonical files

- **Level**: Native integration.
- **Given**: an accepted happy-path Appshot.
- **When**: the record is written.
- **Then**: the record directory contains `snapshot.png`, `context.md`, and `metadata.json`.
- **Signals**: `snapshot.png` is a readable PNG; `context.md` includes app/window metadata and non-empty accessibility/text content; `metadata.json` includes paths, quality, warnings, and screenshot dimensions.

### S6 - Supported composer paste collapses protocol into a label

- **Level**: E2E / component integration.
- **Given**: the clipboard contains valid protocol prompt text for an existing Appshot record.
- **When**: the user pastes into the Welcome page composer or Automation setup composer.
- **Then**: the visible composer shows one compact Appshot label, while submit text preserves the protocol reference and fixed instruction.
- **Signals**: DOM contains an Appshot chip/token; serialized composer text contains `[#appshot:<timestamp>]`; submit resolver expands it to `atmos://appshots/{timestamp}` plus instruction.

### S7 - Header history pages recent records

- **Level**: E2E / component integration.
- **Given**: at least 12 record directories exist under `~/.atmos/appshots/records/`.
- **When**: the user opens the Header Appshots popover.
- **Then**: the button appears immediately left of Open in Web; the popover explains Appshots; records are sorted newest first; only the first 10 records have details loaded until More is clicked.
- **Signals**: first page renders 10 rows with app, time, thumbnail, truncated context, Copy, and Delete; clicking a thumbnail opens the shared image preview overlay; More reveals rows 11-20 by reading additional details.

### S8 - History copy and delete

- **Level**: E2E / native integration.
- **Given**: a record row is visible in the Header Appshots history.
- **When**: the user clicks Copy.
- **Then**: clipboard contains the same `atmos://appshots/{timestamp}` plus fixed instruction.
- **When**: the user clicks Delete.
- **Then**: the entire record directory is removed and the row disappears.
- **Signals**: `appshot_copy_record` returns `copied: true`; `appshot_delete_record` removes `snapshot.png`, `context.md`, `metadata.json`, and the parent directory.

### S9 - Security: secure text values are redacted

- **Level**: Unit / native integration.
- **Given**: an accessibility node representing a secure text field or password-like role is returned by the platform backend.
- **When**: the record files are written.
- **Then**: the node remains structurally present only if useful, but its value is omitted or replaced with a redaction marker.
- **Signals**: `context.md` does not contain the original secure value; `metadata.json` does not contain the secure value; logs do not contain the secure value.

### S10 - Explicit user action only

- **Level**: Unit / E2E.
- **Given**: Atmos is open and the user types or pastes ordinary text into Welcome composer.
- **When**: the user does not click Appshot or invoke a configured capture action.
- **Then**: no native capture command runs, no pending preview appears, and no record directory is written.
- **Signals**: no preview event; records directory unchanged; submitted prompt contains only user-entered text and regular placeholders.

### S11 - Unsupported runtime or platform

- **Level**: Unit / integration.
- **Given**: the web app runs outside Desktop runtime (`isDesktopRuntime()` false), or the native backend reports unsupported on Windows/Linux v1.
- **When**: the Appshots Header button renders or `appshot_status` is called.
- **Then**: Appshot controls are hidden or disabled with an unsupported state, and no capture attempt is made.
- **Signals**: `isDesktopRuntime()` gates the web client; native status returns `supported: false`.

### S12 - Permission recovery

- **Level**: Manual macOS Desktop plus component integration.
- **Given**: one or more required macOS permissions are missing: Accessibility or Screen Recording / Screen & System Audio Recording.
- **When**: the user opens the Header Appshots popover or attempts Appshot capture.
- **Then**: Atmos shows a single permission recovery block with Enable (opens the dedicated Appshots permissions window). When permissions are denied, `trigger.last_error` is not shown above that CTA even if native set an Accessibility-off diagnostic.
- **And when**: the user grants permission from the permissions window / System Settings and returns to Atmos.
- **Then**: Atmos refreshes `appshot_status` and removes the missing-permission state without requiring an app restart when possible (some TCC changes may still need restart).
- **Signals**: `appshot_status` returns denied permissions with `recovery_action`; `appshot_show_permissions_window` / `appshot_open_permissions` succeed or return manual steps; Header history test asserts one Enable CTA and no duplicate last_error copy.

## Performance & load budgets

- Accessibility traversal defaults to no more than 420 nodes, depth 8, 24 KB raw accessibility text, and 28 KB final `context.md` in macOS v1.
- A happy-path macOS capture should show the preview popover within 2 seconds at p50 and 5 seconds at p95 in dogfood testing.
- Accepting a pending Appshot should write all three canonical files and copy protocol text within 500 ms at p50 after capture is complete.
- Header history should list filenames without parsing all details; first 10 detail rows should render within 300 ms for normal record sizes.

## Regression checklist

- [x] Appshot capture does not run in browser, hosted web, or relay web mode.
- [x] Triggering dual-shift captures the focused external app, not Atmos (manual dogfood on Electron).
- [x] Long or complex target app pages still produce app/window metadata and `snapshot.png` even if Accessibility tree capture times out.
- [x] Permission-denied results are recoverable UI states with a permissions window / System Settings path, not unhandled exceptions; history popover shows a single CTA without stacking `trigger.last_error`.
- [x] Secure text is redacted in `context.md`, `metadata.json`, prompts, and logs (native unit coverage where available).
- [x] Welcome and Automation setup composers still support ordinary text paste, image paste, `@file` chips, and `/skill` chips.
- [x] Appshot labels are removable and do not leave hidden protocol state behind.
- [x] Delete removes the whole record directory.

## Acceptance criteria

- [x] All Must Have PRD items map to scenarios above (macOS Electron production path shipped).
- [x] macOS Desktop happy path shows a right-top preview after dual-shift capture.
- [x] Accepted records create `snapshot.png`, `context.md`, and `metadata.json` under `~/.atmos/appshots/records/{timestamp}/`.
- [x] Clipboard text starts with `atmos://appshots/{timestamp}` and includes the fixed instruction pointing at the record directory.
- [x] Missing permission states identify the exact permission, provide recovery, and refresh after authorization.
- [x] Welcome and Automation setup composers render pasted Appshot protocol text as compact labels and submit the protocol reference/instruction.
- [x] Header Appshots history can page, copy, and delete records.
- [x] The agent receives Appshot context through the existing Welcome submit/queue flow, without a new Appshot REST endpoint.
- [x] Captured content is excluded from logs.
- [x] The feature is gated off outside supported Desktop runtimes.
- [x] `bun test` covers protocol parsing, Welcome paste handling, submit-time expansion, Header history UI, and web gating.
- [x] Electron AppShot unit tests cover contract, records, protocol, shift chord, and pending behavior (`apps/desktop-electron/src/appshot/*.test.ts`).

## Manual verification steps

1. On macOS Desktop, revoke one Appshots permission, open the Header Appshots popover, and confirm a single Permissions required / Enable block (no duplicate Accessibility-off banner above it).
2. Click Enable, grant the permission from the permissions window / System Settings, return to Atmos, and confirm the permission state refreshes (restart only if TCC still requires it).
3. Grant Screen Recording and Accessibility; focus an external app window and hold Left Shift + Right Shift.
4. Confirm the target app briefly shows a blue capture border/flash, then the right-top preview appears with a screenshot, Copy, Delete, a live countdown, and a movement animation into Atmos; hover it and confirm the countdown pauses; move the mouse out and confirm the countdown resumes and creates a record directory on timeout.
5. Inspect `~/.atmos/appshots/records/{timestamp}/` and confirm `snapshot.png`, `context.md`, and `metadata.json` exist.
6. Paste the clipboard into a plain text editor and confirm the first line is `atmos://appshots/{timestamp}` and the instruction points at the record directory.
7. Paste the same clipboard into the Welcome composer and confirm it becomes a compact Appshot label.
8. Create a workspace from the Welcome page and confirm the resulting requirement/queued prompt includes the protocol reference and instruction.
9. Paste the same clipboard into Automation setup and confirm saved automation instructions include the protocol reference and instruction.
10. Paste an image into Automation setup and confirm the saved automation instruction points at an attachment under `~/.atmos/automations/definitions/{automation_guid}/attachments/`.
11. Open the Header Appshots popover next to Open in Web and confirm recent records show thumbnails, app/time, truncated context, Copy, Delete, and More pagination. Click a thumbnail and confirm it opens in the same full-screen image preview overlay used by composer attachments.
12. Delete a record from history and confirm its directory is removed.
13. Focus a long Electron/browser page and capture; confirm `metadata.json` does not degrade to `app_name: "Unknown App"` and `snapshot.png` is a real window image even if `quality` is `screenshot_only`.
14. Focus a password field in a target app, capture, and confirm `context.md`, `metadata.json`, submitted prompt, and logs do not contain the password value.
15. Run the web app in a regular browser and confirm Appshot controls are not available.

## Non-coverage

- Windows UI Automation and Linux AT-SPI2 backends are not covered until N4 moves into scope.
- OCR or model-based visual fallback is deferred until N2 moves into scope.
- Automated validation of macOS System Settings dialogs is manual-only because OS dialogs are not reliable in CI.

## Coverage Status

> Appended 2026-07-28 after Electron dual-shift AppShot production path and history permission-UX polish.

| Scenario | Status | Evidence |
|----------|--------|----------|
| S1 Dual-shift capture | partial | Electron `shift-chord` / trigger unit tests; full OS capture is manual dogfood |
| S2–S5 Pending + records | covered | Electron `pending` / `records` / `protocol` tests; Tauri legacy still has `cargo test -p atmos-desktop appshot` |
| S4 Protocol parse | covered | `apps/web` appshot protocol tests |
| S6 Composer paste | covered | Welcome / Automation placeholder expansion web tests |
| S7–S8 History | covered | `apps/web/src/features/appshot/__tests__/appshots-history-popover.test.tsx` |
| S9 Redaction | partial | Native normalization tests where present; full secure-field dogfood remains manual |
| S10 Explicit only | covered | Desktop runtime gate + no background capture |
| S11 Unsupported | covered | Non-desktop client returns unsupported status |
| S12 Permission recovery | covered | History popover single Enable CTA + no stacked `last_error`; permissions window flow in product |

### Commands

```bash
# Web Appshot feature tests
bun test apps/web/src/features/appshot

# Electron AppShot unit tests
cd apps/desktop-electron && bun test src/appshot
```

### Remaining gaps

- Full dual-shift + TCC dialog path is manual-only (CI cannot grant Accessibility / Screen Recording).
- Windows/Linux backends remain out of scope (N4).

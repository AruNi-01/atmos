# TEST · APP-021: Appshots Cross-App Snapshot

> Test Plan · how we verify global-shortcut Appshots, local records, protocol copy, history, and supported composer labels. References PRD APP-021 and TECH APP-021.

## Test strategy

- Unit / integration: Validate protocol formatting/parsing, record file layout, prompt expansion, payload caps, redaction, unsupported-platform responses, and permission state mapping without real OS capture.
- Desktop integration: Exercise Tauri commands with mocked or platform-gated backends where possible.
- End-to-end: Verify global shortcut capture, right-top preview, record persistence, clipboard protocol, Header history, and supported composer paste behavior in a Desktop build.
- Manual-only: Real macOS global shortcut, Screen Recording, Accessibility, and possible Input Monitoring permission flows, because OS permission dialogs and cross-app capture are not stable in headless automation.

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

### S1 - Global shortcut captures from another app

- **Level**: Manual macOS Desktop plus native integration.
- **Given**: Atmos Desktop is running with required permissions and another app is focused.
- **When**: the user presses the configured global shortcut.
- **Then**: Atmos captures the focused external app, not Atmos, and emits a pending preview event.
- **Signals**: preview event has `preview_id`, app/window metadata, screenshot preview when available, and `expires_in_ms: 6000`.

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
- **Signals**: first page renders 10 rows with app, time, thumbnail, truncated context, Copy, and Delete; More reveals rows 11-20 by reading additional details.

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
- **Given**: the web app runs outside Tauri, or the native backend reports unsupported on Windows/Linux v1.
- **When**: the Appshots Header button renders or `appshot_status` is called.
- **Then**: Appshot controls are hidden or disabled with an unsupported state, and no capture attempt is made.
- **Signals**: `isTauriRuntime()` gates the web action; native status returns `supported: false`.

### S12 - Permission recovery

- **Level**: Manual macOS Desktop.
- **Given**: one or more required macOS permissions are missing: Accessibility, Screen Recording / Screen & System Audio Recording, or Input Monitoring.
- **When**: the user opens the Header Appshots popover or attempts Appshot capture.
- **Then**: Atmos shows the missing permission name, why Appshots need it, and an Open System Settings action.
- **And when**: the user clicks Open System Settings.
- **Then**: Atmos opens the relevant macOS System Settings pane, or opens Privacy & Security and shows exact manual steps when a direct pane cannot be opened.
- **And when**: the user grants permission and returns to Atmos.
- **Then**: Atmos refreshes `appshot_status` and removes the missing-permission state without requiring an app restart.
- **Signals**: `appshot_status` returns denied permissions with `recovery_action`; `appshot_open_permissions` succeeds or returns manual steps; UI updates after focus returns.

## Performance & load budgets

- Accessibility traversal defaults to no more than 420 nodes, depth 8, 24 KB raw accessibility text, and 28 KB final `context.md` in macOS v1.
- A happy-path macOS capture should show the preview popover within 2 seconds at p50 and 5 seconds at p95 in dogfood testing.
- Accepting a pending Appshot should write all three canonical files and copy protocol text within 500 ms at p50 after capture is complete.
- Header history should list filenames without parsing all details; first 10 detail rows should render within 300 ms for normal record sizes.

## Regression checklist

- [ ] Appshot capture does not run in browser, hosted web, or relay web mode.
- [ ] Triggering the global shortcut captures the focused external app, not Atmos.
- [ ] Long or complex target app pages still produce app/window metadata and `snapshot.png` even if Accessibility tree capture times out.
- [ ] Permission-denied results are recoverable UI states with an Open System Settings action, not unhandled exceptions.
- [ ] Secure text is redacted in `context.md`, `metadata.json`, prompts, and logs.
- [ ] Welcome and Automation setup composers still support ordinary text paste, image paste, `@file` chips, and `/skill` chips.
- [ ] Appshot labels are removable and do not leave hidden protocol state behind.
- [ ] Delete removes the whole record directory.

## Acceptance criteria

- [ ] All Must Have PRD items map to passing scenarios above.
- [ ] macOS Desktop happy path shows a right-top preview after global shortcut capture.
- [ ] Accepted records create `snapshot.png`, `context.md`, and `metadata.json` under `~/.atmos/appshots/records/{timestamp}/`.
- [ ] Clipboard text starts with `atmos://appshots/{timestamp}` and includes the fixed instruction pointing at the record directory.
- [ ] Missing permission states identify the exact permission, explain why it is needed, open System Settings or show manual steps, and refresh after authorization.
- [ ] Welcome and Automation setup composers render pasted Appshot protocol text as compact labels and submit the protocol reference/instruction.
- [ ] Header Appshots history can page, copy, and delete records.
- [ ] The agent receives Appshot context through the existing Welcome submit/queue flow, without a new Appshot REST endpoint.
- [ ] Captured content is excluded from logs.
- [ ] The feature is gated off outside supported Desktop runtimes.
- [ ] `bun test` covers protocol parsing, Welcome paste handling, submit-time expansion, Header history UI, and web gating.
- [ ] `cargo test -p atmos-desktop` or the relevant Tauri crate test target covers native normalization helpers where available.

## Manual verification steps

1. On macOS Desktop, revoke one Appshots permission, open the Header Appshots popover, and confirm it shows the missing permission with an Open System Settings action.
2. Click Open System Settings, grant the permission, return to Atmos, and confirm the permission state refreshes without restarting.
3. Grant Screen Recording, Accessibility, and Input Monitoring if required by the chosen trigger listener; focus an Electron or browser window and press the global Appshot gesture.
4. Confirm the right-top preview appears with a screenshot, Copy, Delete, and a live countdown; hover it and confirm the countdown pauses; move the mouse out and confirm the countdown resumes and creates a record directory on timeout.
5. Inspect `~/.atmos/appshots/records/{timestamp}/` and confirm `snapshot.png`, `context.md`, and `metadata.json` exist.
6. Paste the clipboard into a plain text editor and confirm the first line is `atmos://appshots/{timestamp}` and the instruction points at the record directory.
7. Paste the same clipboard into the Welcome composer and confirm it becomes a compact Appshot label.
8. Create a workspace from the Welcome page and confirm the resulting requirement/queued prompt includes the protocol reference and instruction.
9. Paste the same clipboard into Automation setup and confirm saved automation instructions include the protocol reference and instruction.
10. Paste an image into Automation setup and confirm the saved automation instruction points at an attachment under `~/.atmos/automations/definitions/{automation_guid}/attachments/`.
11. Open the Header Appshots popover next to Open in Web and confirm recent records show thumbnails, app/time, truncated context, Copy, Delete, and More pagination.
12. Delete a record from history and confirm its directory is removed.
13. Focus a long Electron/browser page and capture; confirm `metadata.json` does not degrade to `app_name: "Unknown App"` and `snapshot.png` is a real window image even if `quality` is `screenshot_only`.
14. Focus a password field in a target app, capture, and confirm `context.md`, `metadata.json`, submitted prompt, and logs do not contain the password value.
15. Run the web app in a regular browser and confirm Appshot controls are not available.

## Non-coverage

- Windows UI Automation and Linux AT-SPI2 backends are not covered until N4 moves into scope.
- OCR or model-based visual fallback is deferred until N2 moves into scope.
- Automated validation of macOS System Settings dialogs is manual-only because OS dialogs are not reliable in CI.

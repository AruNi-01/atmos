# TEST - APP-023: Local Run Server Manager

> Test Plan - how we verify Project/Workspace-scoped Local Services. References PRD APP-023 and TECH APP-023.

## Test strategy

- **Unit / integration**: scanner parsing, path attribution, classifier filtering, command redaction, and stop guardrails in `crates/core-engine` and `crates/core-service`.
- **API-level**: WebSocket request/response behavior for `local_services_scan` and `local_services_stop`.
- **End-to-end**: Playwright or equivalent browser tests for footer visibility, Preview home Local Services list, manual refresh, and explicit open behavior.
- **Manual-only**: multi-OS process metadata fidelity on real macOS, Linux, and Windows machines because each OS exposes socket/process data differently.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 | S1, S2, S11 |
| M2 | S3 |
| M3 | S2, S4, S5 |
| M4 | S6 |
| M5 | S7 |
| M6 | S8, S9 |
| M7 | S10 |
| M8 | S12, S13 |
| M9 | S11 |

## Scenarios

### S1 - Happy path: workspace dev server is discovered

- **Level**: Integration
- **Given**: an Atmos Workspace with `local_path = /tmp/atmos-demo`, and a same-user HTTP server listening on `127.0.0.1:5173` whose cwd is `/tmp/atmos-demo`.
- **When**: the client sends `local_services_scan` with `scope = "current_context"` and that workspace id.
- **Then**: the response includes one service owned by that Workspace, `can_open = true`, a browser-openable URL, and reasons that include workspace path evidence.
- **Signals**: WS response contains the service row; no unrelated listeners are present.

### S2 - Filtering: unattributed local HTTP listeners are hidden

- **Level**: Integration
- **Given**: an HTTP listener on `127.0.0.1:8000` whose cwd and command line do not point to any known Atmos Project/Workspace.
- **When**: the client scans Local Services with default diagnostics off.
- **Then**: the listener is not returned, even if the HTTP probe succeeds and the port looks like a common dev port.
- **Signals**: `services` excludes the listener; classifier logs, if enabled, mark it as unattributed rather than managed.

### S3 - Monorepo child directory belongs to parent Project/Workspace

- **Level**: Unit / integration
- **Given**: an Atmos Project root `/repo` and a server launched from `/repo/apps/web`.
- **When**: ownership attribution runs.
- **Then**: the service owner is the Project or Workspace rooted at `/repo`; `apps/web` appears only as launch-path detail, not as a group owner.
- **Signals**: service owner id is the parent root; frontend grouping has one Project/Workspace group.

### S4 - Protected Atmos internal services are not normal preview targets

- **Level**: Integration
- **Given**: the Atmos API process is listening on its local runtime port and is detectable by the scanner.
- **When**: Local Services are scanned with default diagnostics off.
- **Then**: the API process is not returned as a normal previewable service and cannot be stopped from Local Services.
- **Signals**: default response excludes it, or diagnostic response marks `kind = "protected_atmos_internal"` and `can_stop = false`.

### S5 - Workspace dependency is classified but not primary preview

- **Level**: Integration
- **Given**: a workspace-attributed Redis/Postgres-like listener that fails HTTP probing or identifies as a non-browser protocol.
- **When**: Local Services are scanned.
- **Then**: it is not shown as a primary openable Preview row. If diagnostics are enabled, it is classified as a workspace dependency with `can_open = false`.
- **Signals**: DTO kind/status and `can_open` values match the classification.

### S6 - Footer setting defaults visible and can hide Local Services

- **Level**: E2E (Playwright)
- **Given**: a fresh settings store with no `layout.footer_show_local_services` key.
- **When**: the app footer renders with WebSocket connected.
- **Then**: the Local Services footer item is visible by default on the left side, immediately after WebSocket status.
- **And When**: the user disables "Local Services" in Footer Settings.
- **Then**: the footer item disappears and the setting persists after reload.
- **Signals**: DOM order, settings WS update, reloaded UI state.

### S7 - Footer popover groups by Project/Workspace

- **Level**: E2E (Playwright)
- **Given**: services attributed to Project A, Workspace A1, and Project B.
- **When**: the user opens the Local Services footer popover.
- **Then**: rows are grouped by Project/Workspace owner, not by launch subdirectory or port.
- **Signals**: group labels match Project/Workspace names; no `apps/web` group heading appears.

### S8 - Preview home lists current context services

- **Level**: E2E (Playwright)
- **Given**: Preview has no active URL and the current Workspace has two local services while another Project has one service.
- **When**: the Preview home renders.
- **Then**: the copy is concise and the Local Services list shows only the current Workspace services.
- **Signals**: Preview home rows match current context; unrelated Project service is absent.

### S9 - Manual refresh updates Preview home

- **Level**: E2E or API-level integration
- **Given**: Preview home is open and initially shows no current-context services.
- **When**: a workspace server starts, and the user clicks the refresh button.
- **Then**: the refresh bypasses cache and the new service appears without navigating Preview automatically.
- **Signals**: `local_services_scan` request has `force = true`; service row appears; `activeUrl` remains blank until the user clicks a row.

### S10 - Run terminal output no longer auto-navigates Preview

- **Level**: Integration / E2E
- **Given**: the Run terminal receives output containing `http://localhost:3000`.
- **When**: the output is processed by `RunScript`.
- **Then**: Preview does not create, select, or navigate a browser tab from that terminal text.
- **Signals**: Preview browser state is unchanged; no terminal URL-detected logs are emitted.

### S11 - Platform metadata unavailable degrades safely

- **Level**: Unit / manual OS validation
- **Given**: the platform collector cannot read cwd or command-line metadata for a listener.
- **When**: classification runs.
- **Then**: the listener is not guessed into an Atmos Project/Workspace based only on port, HTTP response, or process name.
- **Signals**: response excludes the service or marks it unsupported/low-confidence in diagnostics.

### S12 - Stop action revalidates pid, port, and ownership

- **Level**: Integration
- **Given**: a service row was scanned for pid `1234` on port `5173`, but before stop the pid no longer owns that port or no longer attributes to the same Workspace.
- **When**: the client sends `local_services_stop`.
- **Then**: the backend refuses to signal the process.
- **Signals**: WS response is an error with a stale/revalidation message; no process signal is sent.

### S13 - Stop refuses protected or unattributed services

- **Level**: Integration
- **Given**: a protected Atmos runtime listener, a root/system-owned listener, and an unattributed listener.
- **When**: stop is requested for each.
- **Then**: all requests are rejected before signaling.
- **Signals**: `can_stop = false` in DTOs; stop handler returns a safe error; logs do not include sensitive command lines.

### S14 - Explicit Local Service open navigates Preview

- **Level**: E2E (Playwright)
- **Given**: Preview home shows a current Workspace service with `url = http://127.0.0.1:5173`.
- **When**: the user clicks the row or Open action.
- **Then**: Preview navigates to that URL using the existing Preview browser tab behavior.
- **Signals**: active Preview tab URL updates; iframe or desktop preview starts loading; no Run terminal output is involved.

## Performance & load budgets

- Local scan completes within 3 seconds on a developer machine with fewer than 100 TCP listeners.
- HTTP probing uses bounded concurrency and does not exceed the scan timeout.
- Footer visible polling, if enabled, runs no more often than every 30 seconds and pauses when the popover/list is not visible.
- Manual refresh should update loading state immediately and settle within the scan budget.

## Regression checklist

- [ ] No new REST endpoint was added for Local Services.
- [ ] `RunScript.tsx` no longer has `onDetectedUrl`, localhost URL regex matching, or URL-detected console logging.
- [ ] Footer setting `layout.footer_show_local_services` defaults to visible and persists false.
- [ ] Footer left-side order is WebSocket status, Local Services, then AI usage carousel.
- [ ] Monorepo subdirectories are not used as UI group headings.
- [ ] Full raw command lines are not rendered in normal Local Services rows.
- [ ] Protected Atmos runtime services cannot be stopped.
- [ ] Unattributed local app/system listeners do not appear in the default managed list.

## Acceptance criteria

- [ ] Every Must Have PRD item M1-M9 has at least one passing scenario.
- [ ] `local_services_scan` returns only Project/Workspace-attributed services by default.
- [ ] Preview home shows current-context Local Services and manual refresh.
- [ ] Footer Local Services item is default-on and hideable from Footer Settings.
- [ ] Run terminal output cannot auto-navigate Preview.
- [ ] Stop action revalidates process ownership and refuses protected/unattributed targets.
- [ ] `cargo test -p core-engine`, `cargo test -p core-service`, `cargo test -p api`, and relevant `bun` tests pass for changed areas.

## Manual verification steps

1. macOS: start a dev server from a workspace root and from `apps/web`; confirm both group under the owning Project/Workspace.
2. macOS: run unrelated local HTTP services from outside Atmos roots; confirm they are hidden from default Local Services.
3. Linux: repeat discovery and monorepo checks on a machine with readable `/proc`.
4. Windows: verify the collector degrades safely when cwd is unavailable and does not guess ownership from port alone.
5. Footer: toggle Local Services off/on in Settings and reload the app.
6. Preview: open a Local Service row, then start a different server that prints `localhost` in Run terminal and confirm Preview does not auto-switch.

## Non-coverage

- Remote Atmos Computer process inventory over relay is not covered because it is out of scope for v1.
- User attribution correction controls are not covered until PRD N1 is promoted.
- Full container orchestration mapping is not covered until PRD N3 is promoted.

## Coverage Status

> Implementation and real test execution should append status lines here after `atmos-specs-test-run`.

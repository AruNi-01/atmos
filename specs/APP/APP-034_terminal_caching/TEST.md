# TEST: Terminal Workspace Caching

## 1. Test Strategy
The testing strategy involves unit tests for the zustand caching store logic (LRU, TTL, pinned active state) and manual/E2E verification of the UI rendering layer (terminal container preservation, resize handling on visibility restore).

## 2. Execution Map
- **Zustand store logic**: `just test-web` (under `apps/web/src/features/terminal/store/`)
- **UI & DOM assertions**: `just test-e2e` / Manual Verification

## 3. Coverage Map
- **LRU Eviction (max 5 workspaces, max 15 terminals):** Covered by unit tests and manual acceptance criteria (6 consecutive switches).
- **TTL 1 Hour:** Covered by unit tests and manual scenario (1 hour inactivity).
- **Keep-alive rendering:** Covered by manual/E2E DOM checks (nodes not removed).
- **Correct sizing on restore:** Covered by manual resize path scenario.

## 4. Acceptance Criteria (Automated)
- [ ] Zustand store: Verify that adding a 6th context evicts the oldest (LRU).
- [ ] Zustand store: Verify that sweeping after 1 hour evicts expired contexts.
- [ ] Zustand store: Verify that adding terminals beyond `maxTerminalCount=15` evicts contexts correctly.
- [ ] Zustand store: Verify that the active pinned context is NOT evicted during sweep or LRU limits.

## 5. Manual Verification Steps
- [ ] **DOM Preservation:** Given a terminal open in Workspace A, when I switch to Workspace B, Workspace A's terminal should not be destroyed (Signal: DOM nodes for Workspace A still exist with `hidden` class).
- [ ] **Instant Reactivation:** When I switch back to Workspace A, the terminal should be instantly visible and retain its previous content/scroll position (Signal: terminal output buffer contains the exact same lines and `xterm-viewport` scrollTop is preserved).
- [ ] **LRU Eviction:** When I switch across 6 different workspaces consecutively, the very first workspace I opened should be evicted (Signal: DOM nodes for the first workspace are removed from the page).
- [ ] **TTL Eviction:** After 1 hour of inactivity on Workspace A, the TTL should trigger and its terminals should be destroyed (Signal: `evictWorkspaceRuntime` is called and DOM nodes for Workspace A are removed).
- [ ] **Reactivation Resize Path:** Switch from Workspace A to another workspace so Workspace A's terminal is hidden with `display:none`. Then switch back to Workspace A and verify the restored terminal is immediately visible and correctly sized (Signal: A refit/resize happens on visibility restore, xterm fills the available container without a stale layout).

## 6. Non-Coverage
- Testing terminal backend state on the Rust side (PTY lifetime is already tested in `core-engine`).
- Simulating exactly 1 hour of manual waiting in E2E (TTL is unit tested via mock timers).

## 7. Coverage Status
- **Status:** Pending implementation and run.

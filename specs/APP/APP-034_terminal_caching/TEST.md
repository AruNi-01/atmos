# TEST: Terminal Workspace Caching

## 1. Unit/Integration Tests
Tool: `just test-web`
- [ ] Zustand store (`useTerminalCacheStore`): Verify that adding a 6th context evicts the oldest (LRU).
- [ ] Zustand store: Verify that sweeping after 1 hour evicts expired contexts.
- [ ] Zustand store: Verify that adding terminals beyond `maxTerminalCount=15` evicts contexts correctly.

## 2. E2E / Manual Scenarios
Tool: `just test-e2e` / Manual Verification
- [ ] Given I have a terminal open in Workspace A with command output visible, when I switch to Workspace B, Workspace A's terminal should not be destroyed (Signal: DOM nodes for Workspace A still exist with `hidden` class).
- [ ] When I switch back to Workspace A, the terminal should be instantly visible and retain its previous content/scroll position (Signal: terminal output buffer contains the exact same lines and `xterm-viewport` scrollTop is preserved).
- [ ] When I switch across 6 different workspaces consecutively, the very first workspace I opened should be evicted (Signal: DOM nodes for the first workspace are removed from the page).
- [ ] After 1 hour of inactivity on Workspace A, the TTL should trigger and its terminals should be destroyed (Signal: `evictWorkspaceRuntime` is called and DOM nodes for Workspace A are removed).

## 3. PRD Coverage Map
- **LRU Eviction (max 5 workspaces, max 15 terminals):** Covered by Unit Test (Zustand store evictions) and E2E Scenario (6 consecutive workspace switches).
- **TTL 1 Hour:** Covered by Unit Test (sweeping expired contexts) and E2E Scenario (1 hour inactivity).
- **Keep-alive rendering (no re-renders on context switch):** Covered by E2E Scenarios (DOM nodes retained, scroll position/content preserved).

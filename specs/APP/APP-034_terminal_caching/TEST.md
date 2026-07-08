# TEST: Terminal Workspace Caching

## 1. Unit/Integration Tests
- [ ] Zustand store (`useTerminalCacheStore`): Verify that adding a 6th context evicts the oldest (LRU).
- [ ] Zustand store: Verify that sweeping after 1 hour evicts expired contexts.

## 2. E2E / Manual Scenarios
- [ ] Given I have a terminal open in Workspace A, when I switch to Workspace B, Workspace A's terminal should not be destroyed.
- [ ] When I switch back to Workspace A, the terminal should be instantly visible and retain its previous content/scroll position.
- [ ] When I switch across 6 different workspaces consecutively, the very first workspace I opened should be evicted (terminals destroyed) to respect the max 5 cache limit.
- [ ] After 1 hour of inactivity on Workspace A, the TTL should trigger and its terminals should be destroyed.

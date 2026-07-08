# PRD: Terminal Workspace Caching

## 1. Context & Problem Statement
Currently, every time a user switches between workspaces or projects, all terminal tabs in the center stage are destroyed and reloaded from scratch. This causes unnecessary overhead, PTY process restarting, and loses immediate UI continuity for heavily used workspaces.

## 2. Target Audience
Users who frequently switch between multiple workspaces or projects within a single Atmos session.

## 3. Goals & Success Metrics
- **Goal:** Cache up to 5 recently used project/workspace terminal tabs in the background.
- **Goal:** Unused caches expire after 1 hour (TTL) to free up memory and backend PTY resources.
- **Success Metric:** Switching between recently accessed workspaces feels instantaneous and retains terminal scroll/state.

## 4. Scope
### Must Have
- LRU (Least Recently Used) cache strategy for terminal contexts.
- Maximum capacity of 5 cached contexts.
- TTL (Time To Live) of 1 hour for each cached context.
- Keep-alive React rendering (display: none) for cached terminals instead of unmounting.

### Out of Scope
- Persisting this cache across full browser reloads (localStorage/IndexedDB).
- Backend PTY hibernation (this is purely frontend keep-alive for now).

## 5. User Stories
- As a user, when I switch from Workspace A to Workspace B, and back to Workspace A within an hour, my terminals in Workspace A should be exactly as I left them, without a loading delay.
- As a user, if I switch through 6 different workspaces, the oldest one is evicted to conserve my browser's memory.

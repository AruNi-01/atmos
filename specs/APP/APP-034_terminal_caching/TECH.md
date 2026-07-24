# TECH: Terminal Workspace Caching

> **Superseded by [APP-043 Workspace Surface Cache](../APP-043_workspace-surface-cache/TECH.md).**  
> New implementation should follow APP-043 (`useWorkspaceSurfaceCacheStore` + `WorkspaceFrameHost`). This TECH remains for historical reference only.

## 1. Architecture
We use a Zustand store (`useTerminalCacheStore`) to manage the LRU cache and TTL.
Instead of `TanStack Query` (which is for server state), we leverage React's capability to keep DOM elements mounted but visually hidden (`display: none`).

### Store: `useTerminalCacheStore`
- **State:**
  - `cachedContexts`: Array of objects (`{ contextId: string, lastAccessed: number }`) maintaining LRU order.
  - `maxSize`: 5
  - `maxTerminalCount`: 15
  - `ttlMs`: 3,600,000 (1 hour)
- **Actions:**
  - `touch(contextId)`: Updates/inserts the context into the cache, moving it to the most recently used.
  - `evict(contextId)`: Removes the context from the cache and calls `destroyAllTerminals` / `evictWorkspaceRuntime`.
  - `evictExpired()`: Sweeps through the cache and evicts items older than 1 hour.

### Integration in `CenterStage`
Currently, `CenterStage` unmounts previous contexts when `effectiveContextId` changes.
We will:
1. Render a list of all contexts (active + cached).
2. For inactive contexts, apply a CSS style `display: none` to `CenterStagePanels`.

### Integration in `useTerminalTabMountLifecycle`
Instead of immediately calling `evictWorkspaceRuntime(previousContextId)` and destroying terminals, we:
1. `touch(previousContextId)` in the cache store.
2. The destruction logic is moved to the cache store's eviction callback.

## 2. Risk & Mitigations
- **xterm.js Resize Issue:** When returning to a cached workspace (`display: none` -> `display: block`), the canvas may not properly size itself. Mitigation: We commit to relying on the existing `ResizeObserver` inside `TerminalGrid` which automatically triggers `fit()` when the element's dimensions change upon becoming visible. If edge cases appear where `fit()` misses the visibility transition, we will explicitly call `fit()` in an effect tied to the active context state.
- **Memory Pressure:** Keeping terminals alive means keeping WebGL instances alive. Max size of 5 and TTL of 1 hour mitigate infinite growth.

# Brainstorm · APP-035: TanStack Query Data Layer

> Problem-space exploration for improving the web app's server-state experience. Settled product scope graduates to `PRD.md`; committed architecture graduates to `TECH.md`.

## Context

The web app currently has no TanStack Query dependency or provider. Async server data is spread across REST helpers, WebSocket request/response modules, Zustand stores, hook-local `useState` / `useEffect` loaders, module-level caches, polling intervals, and manual refresh methods.

This fragmentation can surface as inconsistent loading states, duplicate requests, stale views after mutations, repeated cache/race-control code, and data from one Atmos Computer surviving a connection-target switch. The original Atmos Core design already named TanStack Query for async data caching and WebSocket-driven invalidation, while the mobile app now provides a working in-repository QueryClient precedent.

The phrase “put every API on TanStack Query” is too broad as a solution boundary:

- TanStack Query can coordinate server state regardless of whether a read travels over HTTP or a WebSocket request/response action.
- Long-lived streams, terminal PTY traffic, agent chat sockets, and local UI state are not queries and should not be forced into its cache.
- Zustand remains appropriate for client state and orchestration that is not a server-state snapshot.

The user-facing goal is therefore not framework coverage by itself. It is predictable freshness, fewer loading flashes, deduplicated reads, coherent mutation feedback, and safe reconnect behavior.

## Goals (draft)

- **Primary:** make server-backed screens feel faster and more consistent by reusing cached data, retaining useful previous data during refresh, and deduplicating concurrent reads.
- Standardize loading, error, retry, refresh, pagination, and mutation-invalidation behavior.
- Make cache ownership explicit across local browser, Desktop, and Relay-connected Atmos Computers.
- Let WebSocket events update or invalidate cached snapshots without replacing event streams with polling.
- Remove bespoke caches and stale-response guards where TanStack Query provides equivalent behavior.
- Preserve transport rules: interactive workflows stay WebSocket-first, and no duplicate REST endpoints are added for migration convenience.
- Establish an incremental path that can be verified feature by feature.

## Experience problems worth validating

- Does navigating away and back cause visible loading flashes for data that was just fetched?
- Do multiple mounted consumers trigger duplicate reads for the same resource?
- Can mutations leave another panel showing stale data until a manual refresh?
- Are retry and error states inconsistent or hidden behind console logging and one-off toasts?
- Can changing the active Atmos Computer expose cached data from the previous connection?
- Do reconnects trigger too much refetching, or fail to refresh data that became stale while disconnected?

These are plausible findings from the current implementation patterns, not measured production incidents. Baselines should be gathered before setting success thresholds.

## Scope candidates

| Data shape | Candidate treatment | Reason to explore |
|------------|---------------------|-------------------|
| REST snapshot reads | Query | Conventional server state with loading, cache, retry, and refetch needs |
| WebSocket request/response reads | Query with connection-aware enablement and keys | Same server-state semantics despite a non-HTTP transport |
| Create/update/delete actions | Mutation plus targeted cache update/invalidation | Standardizes pending/error state and post-write freshness |
| WebSocket notifications | Keep subscriptions; bridge events into cache updates/invalidation | Push signals complement the cache rather than becoming queries |
| Cursor/infinite lists | Infinite query where pagination semantics fit | Replaces per-hook page caches and load-more race handling |
| Settings/bootstrap single-flight caches | Query candidate, subject to startup ordering | Existing bespoke caches overlap with query deduplication |
| Terminal PTY and process output | Exclude | Bidirectional or continuous stream, not a snapshot |
| Agent chat/session socket | Exclude | Long-lived conversational transport and lifecycle |
| Terminal DOM/runtime cache | Exclude | Preserves mounted client resources; APP-034 deliberately uses Zustand |
| Editor/navigation/layout state | Exclude | Client-owned state, not server state |
| Live document editing | Query only for load/save boundary, if useful | Interactive document state needs a local editing model |

## Options

### Option A — REST-first pilot

Add the shared query runtime and migrate only isolated REST-backed reads and their mutations first. Leave WebSocket request/response reads and major Zustand stores unchanged until the pilot proves conventions.

**Possible shapes**

- Begin with system status, session lists, and canvas load/save.
- Replace hook-local loading/refetch state but retain existing API client functions.
- Publish query-key, retry, and invalidation conventions before expanding.

**Pros:** smallest blast radius; quickly tests perceived UX and framework defaults; easy rollback.

**Cons:** two async patterns remain for longer; limited benefit because much of Atmos server state uses WebSocket request/response.

**Unknown:** whether the initial surfaces are frequent enough to produce a measurable UX improvement.

### Option B — Server-state layer across REST and WebSocket requests

Define TanStack Query as the default owner for cacheable server-state snapshots, independent of transport. Existing REST and WebSocket API modules remain transport adapters; feature hooks consume query/mutation hooks.

**Possible shapes**

- Migrate by domain: system/bootstrap, sessions, settings, projects/workspaces, Git/files, automations, usage.
- Key every query by a stable connection target plus domain identifiers.
- Bridge existing WebSocket events to `setQueryData` or invalidation.

**Pros:** one mental model for most server state; removes substantial bespoke caching and refetch logic; aligns web with the original APP-001 direction and mobile precedent.

**Cons:** broad migration touches bootstrap, reconnect, optimistic updates, and many feature stores; temporary dual ownership can cause races or duplicate requests.

**Unknown:** which Zustand stores can become thin client-state stores and which should keep server orchestration.

### Option C — Standard contract without universal migration

Use TanStack Query only where it clearly replaces server-state boilerplate, while standardizing the remaining async surfaces behind a shared result contract and explicit ownership rules.

**Possible shapes**

- Query for snapshots and mutations; Zustand for orchestrated workflows and client state.
- Keep complex project, Git, file-tree, review, and editing stores until each has a specific migration case.
- Add an inventory that labels every API operation as query, mutation, event, stream, or client-only.

**Pros:** matches tools to data shapes; avoids rewriting stable workflow stores solely for consistency; still improves common UX.

**Cons:** requires clear documentation to prevent pattern drift; “not migrated” decisions need periodic review.

**Unknown:** whether contributors will find a hybrid policy easier or harder than a strict default.

### Option D — Big-bang “every API” wrapper

Create query/mutation hooks for every exported API operation in one rollout, including most WebSocket request/response calls.

**Possible shapes**

- One generated or hand-authored hook per operation.
- Replace all feature-level imperative calls before release.
- Keep streams as disabled/manual queries or special adapters.

**Pros:** reaches a superficially consistent API quickly; minimizes a prolonged transition period.

**Cons:** confuses streams with snapshots, encourages low-value wrappers, makes regression isolation difficult, and risks cross-computer cache leakage or reconnect storms.

**Unknown:** whether any practical benefit justifies the migration and review risk.

## Key forks in the road

- **Framework coverage vs. user outcome:** migrate every callable operation vs. migrate cacheable server state — decide in PRD.
- **Incremental vs. big-bang rollout:** domain-by-domain compatibility vs. one coordinated cutover — decide in PRD and TECH.
- **REST-only vs. transport-independent queries:** treat only HTTP as queryable vs. include WebSocket request/response snapshots — decide in TECH.
- **Cache identity:** key by connection epoch vs. stable computer/server identity plus auth revision — decide in TECH.
- **Target switch behavior:** remove old-target queries immediately vs. retain them for fast return while preventing rendering under the new target — decide in PRD and TECH.
- **Push integration:** invalidate and refetch vs. patch query data directly for each event family — decide in TECH.
- **Zustand boundary:** remove server snapshots from stores vs. let stores orchestrate Query data during migration — decide per domain in TECH.
- **Mutation UX:** optimistic updates vs. pending state followed by authoritative refetch — decide per workflow in PRD and TECH.
- **Retry policy:** shared defaults vs. operation-specific retry rules, especially for disconnected WebSocket calls — decide in TECH.

## Risks to investigate

- Cache keys that omit the active computer, relay tenant, repository, workspace, or auth revision can show data in the wrong context.
- Query retry behavior layered on WebSocket reconnect behavior can create retry storms.
- Existing event handlers and new invalidation rules can double-fetch or overwrite newer optimistic state.
- Moving data out of Zustand can break imperative consumers that read stores outside React components.
- Default refetch-on-focus/reconnect behavior may be wrong for Desktop or expensive operations.
- Query persistence to browser storage could leak sensitive or stale data and should not be assumed.
- A generic “API hook generator” could erase useful domain semantics and make invalidation less precise.
- Migrating stable complex stores may increase code and regress UX if custom behavior is not first inventoried.

## Open questions

- [ ] Which concrete user complaints or telemetry triggered this request: loading flashes, stale data, duplicate calls, error handling, or developer maintainability?
- [ ] Is v1 limited to `apps/web`, or should web and mobile share query-key conventions or utilities?
- [ ] Which three high-traffic screens should establish the before/after UX baseline?
- [ ] Should previously visited computer caches survive target switches in memory, or always be removed?
- [ ] Are any server snapshots sensitive enough to require immediate cache removal on logout/token change?
- [ ] Which current Zustand stores are relied on outside React render paths?
- [ ] Which mutations require optimistic feedback to meet existing UX expectations?
- [ ] Should query devtools be development-only, or omitted entirely?
- [ ] What measured signals define success: duplicate request count, back-navigation loading flashes, stale-view bugs, or time to usable data?
- [ ] Which existing manual caches have behavior that must be preserved rather than replaced?

## Suggested discovery before PRD

- Inventory exported REST and WebSocket operations as `query`, `mutation`, `event`, `stream`, or `not server state`.
- Record current request counts and visible loading transitions on representative navigation flows.
- Exercise local browser, Desktop same-origin, and Relay target-switch/reconnect paths.
- Map each WebSocket event to the server snapshots it makes stale.
- Identify store consumers that require imperative access or atomic multi-domain updates.

## References

- Existing web transport and API boundaries: `apps/web/src/api/rest-api.ts`, `apps/web/src/api/ws-api.ts`, `apps/web/src/api/ws/`
- Existing connection lifecycle: `apps/web/src/features/connection/hooks/use-websocket.ts`, `apps/web/src/app-shell/bootstrap/connection-target-lifecycle.ts`
- Existing server-state stores and caches: `apps/web/src/features/project/store/use-project-store.ts`, `apps/web/src/features/git/store/use-git-store.ts`, `apps/web/src/api/ws/settings-bootstrap-cache.ts`
- Web provider boundary: `apps/web/src/app/layout.tsx`, `apps/web/src/providers/`
- Mobile precedent: `apps/mobile/src/providers/query-client.ts`, `apps/mobile/src/providers/AppProviders.tsx`
- Original design intent: [`APP-001 Atmos Core`](../APP-001_atmos-core/TECH.md)
- Explicit non-query terminal cache: [`APP-034 Terminal Workspace Caching`](../APP-034_terminal_caching/TECH.md)
- Connection/Relay context: [`APP-016 Atmos Computer`](../APP-016_atmos-computer/TECH.md)
- Mobile query usage: [`APP-025 Mobile App`](../APP-025_mobile-app/TECH.md)

## Ready to promote

- Promote to PRD: define the outcome as consistent server-state UX, not 100% API wrapper coverage.
- Promote to PRD: explicitly exclude terminal streams, agent chat sockets, retained terminal DOM/runtime state, and client-only UI state.
- Promote to PRD: choose rollout expectations and user-visible success signals.
- Promote to TECH: produce an operation inventory and domain migration matrix before implementation.
- Promote to TECH: define connection-scoped query keys, target-switch cleanup, reconnect behavior, and WebSocket event bridges.
- Promote to TECH: define ownership rules for Query, Zustand, transport clients, and feature hooks.
- Promote to TEST: capture pre/post request counts, stale-data scenarios, target-switch isolation, reconnect behavior, and mutation freshness.

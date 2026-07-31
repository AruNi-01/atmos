# TECH · APP-050: Shared Package Layering

> Technical design · HOW. Role matrix, dependency edges, agent decision tree, AGENTS rewrites, minimal enforcement.

## 1. Summary

Document and lightly enforce a **client shared stack** plus platform packages:

| Layer | Package | May contain | Must not | Channel |
|-------|---------|-------------|----------|---------|
| Wire schema (main WS) | `@atmos/api-types` | Frames, `WsAction`, multi-client DTOs; optional relay REST DTOs | React, reconnect, business rules | Main `/ws` (+ optional relay REST types) |
| Session client | `@atmos/api-client` | WS session, reconnect, request helpers, platform types | UI, Query cache, feature stores | Main `/ws` transport |
| Pure shared | `@atmos/shared` | Utils, hooks, debug, **terminal stream protocol** | Main `/ws` types, WS session kernel | Terminal stream (exception); pure helpers |
| Design system | `@workspace/ui` | UI components | API clients, wire types | UI only |
| i18n helpers | `@atmos/i18n` | next-intl routing/middleware helpers | Mobile UI as sole home; message JSON for apps | Next apps |
| TS tooling | `@atmos/config` | tsconfig bases | Runtime app code | Tooling |
| Edge deployable | `packages/relay` | Worker/DO | Imported as app business library | Relay edge |
| Apps | `apps/web`, `mobile`, `desktop-electron`, … | UI, feature state, platform bootstrap, **desktop IPC** | Long-term dual WS kernels / dual action catalogs | All |

Call the first three “**client shared stack**”; ui/i18n/config/relay/apps are platform/deployable layers.

## 2. Dependency graph (correct edges)

```text
apps/web ─────────────► @workspace/ui
apps/web, landing, docs ─► @atmos/i18n     (Next only; not mobile)
apps/* ───────────────► @atmos/shared
apps/* ───────────────► @atmos/api-client ──► @atmos/api-types
apps/* ───────────────► @atmos/api-types
packages/* tsconfig ──► @atmos/config      (dev/tooling, not runtime import graph for product code)

packages/relay         (deployable; no apps import of src; no client workspace dep for logic)
apps/desktop-electron  (IPC command bus local; not api-types)
```

**Not** `shared → ui`. Apps depend on ui and shared **independently**.

### 2.1 Allow / forbid matrix

| From \ To | api-types | api-client | shared | ui | i18n | relay/src |
|-----------|-----------|------------|--------|----|------|-----------|
| apps | yes | yes | yes | web yes; mobile no | Next yes | **no** |
| api-client | **yes required** | — | pure only | **no** | **no** | **no** |
| api-types | — | **no** | **no** | **no** | **no** | **no** |
| shared | **no** | **no** | — | **no** | **no** | **no** |
| ui | **no** | **no** | no API | — | no | **no** |

### 2.2 Exceptions

| Edge | Rule |
|------|------|
| `api-client → shared` | Allowed for pure helpers (redact, etc.); prefer zero deps |
| `shared/terminal` | Multi-client **terminal stream** types + pure helpers only |
| `shared/debug`, `shared/preview` | Existing special cases; not general wire homes |
| `shared → api-types` | **Forbidden** even as `import type` in v1 |

### 2.3 Ownership when specs disagree

| Concern | Winning spec |
|---------|----------------|
| Dependency **edges** / agent routing | **APP-050** |
| Frame/action/DTO inventory, drift | **APP-048** |
| Session/reconnect/request semantics | **APP-049** |
| Package AGENTS for api-* | Authoring PR of that package **must** include 050 NEVER/ALWAYS + link |

## 3. Terminal ownership (v1)

```text
Terminal stream message types + pure helpers  →  @atmos/shared/terminal
Main-app /ws frames & WsAction              →  @atmos/api-types only
Main-app session kernel                     →  @atmos/api-client only
Terminal *connection* client (future)       →  prefer @atmos/api-client/terminal or app-local;
                                               types still from @atmos/shared/terminal until N2 move PR
Moving terminal types into api-types        →  APP-050 N2 + dedicated PR only — not default for new work
```

**NEVER**: add main-app `/ws` DTOs under shared “because terminal is already protocol.”

Prefer importing `@atmos/shared/terminal` subpath rather than growing root barrel with more protocol surface.

## 4. Decision tree (agents)

When adding TypeScript:

1. **Main `/ws` frame, `WsAction`, or multi-client DTO?** → `@atmos/api-types` (APP-048).  
1b. **Single-app DTO only?** → owning app until a second consumer appears.  
2. **Main `/ws` connection/reconnect/request_id/platform WS adapter?** → `@atmos/api-client` (APP-049).  
3. **Terminal stream protocol or terminal title/theme/snapshot helpers?** → `@atmos/shared/terminal`.  
4. **Pure helper / generic React hook / debug logger?** → `@atmos/shared` (debug under `shared/debug`).  
5. **Design-system chrome?** → `@workspace/ui` (not mobile).  
6. **next-intl routing shared by Next apps?** → `@atmos/i18n` (not mobile, not message JSON).  
7. **tsconfig base?** → `@atmos/config`.  
8. **Cloudflare relay edge routing?** → `packages/relay` only.  
9. **Electron IPC command / preload bridge?** → `apps/desktop-electron` only.  
10. **TanStack Query keys / server-state ownership?** → app (APP-035).  
11. **Else** → owning app.

Relay REST: multi-client **types** → api-types (048 N1); multi-client **HTTP client** → api-client (049 N3); Worker → relay package.

## 5. Documentation touch list (Phase 1 implementation of this spec)

| File | Change |
|------|--------|
| `packages/AGENTS.md` | **Replace** “API clients live in apps” with dual rule; full role table; decision tree; namespaces from real package.json; pending rows for api-types/api-client if packages not yet created |
| `packages/shared/AGENTS.md` | NEVER main `/ws` types or WS session; ALWAYS pure utils; terminal exception; debug subpath unchanged |
| `packages/api-types/AGENTS.md` | Created with 048; link here |
| `packages/api-client/AGENTS.md` | Created with 049; link here |
| `packages/relay/AGENTS.md` | One paragraph: deployable edge, not client SDK; no app src imports |
| Root `Agents.md` | Decision tree rows for wire types / session client / shared utils / package map |

### 5.1 Replacement wording for packages/AGENTS (normative intent)

```text
- Main-app WS wire types → @atmos/api-types (APP-048)
- Main-app WS session kernel → @atmos/api-client (APP-049)
- App feature API modules, platform bindings, UI → apps/*
- Do not reintroduce dual action catalogs or dual pending-map kernels in apps
```

## 6. Review checklist (M7)

- [ ] Multi-client main `/ws` types only in `@atmos/api-types`
- [ ] Reconnect/request kernel only in `@atmos/api-client`
- [ ] No new main `/ws` protocol types under `@atmos/shared` utils/root
- [ ] New terminal **stream** fields → `shared/terminal` only
- [ ] Apps bind UI/state only; no second pending-map + reconnect implementation
- [ ] No import of `packages/relay/src` from apps
- [ ] Desktop IPC stays in `apps/desktop-electron`
- [ ] Dependency direction respects §2
- [ ] Single-app DTOs not force-moved into api-types

## 7. Minimal mechanical check (M11)

**Phase 1.5 / with Phase 1 preferred:**

```bash
# conceptual — implement as bun test or scripts/check-package-boundaries.ts
# Fail if packages/shared/src (excluding terminal/, preview/, debug/) contains:
#   - from '@atmos/api-client' or '@atmos/api-types'
#   - export type WsAction | interface WsRequest | ... main-app frame authorities
```

Allowlist documented in script header. Full dep-cruiser = N1.

If only docs land first without script: success metrics must say “docs published,” not “misplaced files decrease,” until M11 lands.

## 8. Subpath discipline

- Prefer explicit subpath exports (`@atmos/api-types/ws/actions`, `@atmos/api-client/ws`, `@atmos/shared/terminal`).
- Avoid root mega-barrels that pull wire + runtime + UI together.
- Align with APP-048/049 TECH export tables.

## 9. Global sequencing

```text
050 Phase 1 (this TECH’s doc + AGENTS + cheap gate)
 → 048 Phase 1 (frames + actions + enum drift)
 → 049 Phase 1 (kernel)
 → 049 mobile
 → 048 DTOs / mobile types (parallel OK with mobile transport)
 → 049 web + request helper
 → 048 monorepo drift CI
 → optional N*
```

## 10. Migration vs status quo

| Current | Target |
|---------|--------|
| Web `WsAction` in feature hook | api-types |
| Dual WS clients | api-client |
| packages/AGENTS “API clients live in apps” | rewritten dual rule |
| Wrong i18n/config workspace names in docs | `@atmos/*` as package.json |
| Terminal in shared | **unchanged** |
| Desktop IPC in electron | **unchanged** |

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Agents ignore docs | Decision tree + M11 grep |
| Terminal used as junk wire home | Explicit NEVER |
| 048/049 restate edges differently | §2.3 ownership |

## 12. Out of scope

- Implementing 048/049 runtime code
- Renaming `@workspace/ui`
- Rust layers

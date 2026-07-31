# PRD · APP-050: Shared Package Layering

> Product Requirements · WHAT and WHY. Explicit roles and dependency edges for Atmos JS packages so wire types, session client, pure shared utils, and deployables do not collapse into one junk drawer.

## Context

- **Problem**: Maintainers and agents lack a crisp rule for where TypeScript belongs. Wire types and transport sprawl across apps; `@atmos/shared` risks becoming a dump. After APP-048/049 introduce packages, missing governance re-creates the mess under new names. Current `packages/AGENTS.md` still says “API clients live in apps,” which will **contradict** the new packages unless rewritten.
- **Why now**: APP-048/049 define package names and ownership; this spec is the dependency constitution and agent routing map.
- **Related specs**: [APP-048](../APP-048_api-types/PRD.md), [APP-049](../APP-049_api-client/PRD.md), QUALITY-004.

## Goals

1. **Primary**: Anyone can answer shared vs api-types vs api-client vs app-local vs relay deployable vs desktop IPC.
2. **Primary**: NEVER/ALWAYS rules and a rewritten `packages/AGENTS.md` prevent wire types and session kernels from landing in the wrong place.
3. **Secondary**: Dependency direction is explicit and reviewable; cheap mechanical checks catch the worst regressions.
4. **Secondary**: Root Agents navigation points at the three client-shared packages.

## Users & Scenarios

1. New multi-client WS DTO → `@atmos/api-types`, not app-only copy-paste and not shared utils.
2. Reconnect change → `@atmos/api-client`, not a one-off in mobile.
3. Pure time helper → `@atmos/shared`.
4. Durable Object routing → `packages/relay` only; apps never import Worker src.
5. Electron `invoke` command → `apps/desktop-electron` only.

## User Stories

- As a maintainer, I want a package role table so review cites a rule.
- As an agent, I want a decision tree so files land correctly first try.
- As a package owner, I want forbidden edges so shared never imports api-client.

## Functional Requirements

### Must Have

- **M1 — Role table**: Publish roles for at least:
  - `@atmos/shared`
  - `@atmos/api-types`
  - `@atmos/api-client`
  - `@workspace/ui`
  - `@atmos/i18n`
  - `@atmos/config`
  - `packages/relay` (deployable)
  - `apps/*` (incl. desktop-electron IPC)
  Use **actual** `package.json` names (`@atmos/i18n`, `@atmos/config`—not stale `@workspace/i18n` for those packages).
- **M2 — Ownership rules**:
  - **api-types**: main `/ws` frames, `WsAction`, multi-client DTOs; optional relay REST DTOs.
  - **api-client**: non-UI main `/ws` session lifecycle + platform adapter types.
  - **shared**: pure utils, generic hooks, debug tools, **terminal stream protocol helpers** (sole wire exception).
  - **ui**: design system only.
  - **i18n**: next-intl routing helpers (Next apps; not mobile).
  - **config**: tsconfig bases only.
  - **relay**: edge Worker/DO only.
- **M3 — Dependency direction** (readable form):
  - `apps → api-client → api-types` (required when using shared kernel)
  - `apps → api-types` allowed
  - `apps → shared` allowed
  - `apps → ui` allowed (web; **not** mobile)
  - `apps → i18n` allowed (Next only)
  - `api-client → api-types` required
  - `api-client → shared` **allowed** for pure helpers only; prefer zero
  - `shared → api-client` **forbidden**
  - `shared → api-types` **forbidden** (v1; no `import type` carve-out that weakens the graph)
  - `api-types → *runtime packages` **forbidden**
  - `ui → api-client | api-types | apps` **forbidden**
  - `apps ↛ packages/relay/src` and **no** workspace dep on relay for client logic
- **M4 — Agents navigation**: Update root Agents decision rows + **`packages/AGENTS.md` as the single package-boundary map**.
- **M5 — Terminal exception**: `@atmos/shared/terminal` remains terminal **stream protocol** home. Main `/ws` never goes there “because terminal is already wire-ish.”
- **M6 — Relay deployable**: Worker is not a client SDK.
- **M7 — Review checklist**: PR checklist for multi-client TS placement.
- **M8 — Rewrite conflicting docs**: Phase 1 **must** replace “API clients live in apps” with dual rule: shared kernel → api-client; feature API modules / platform bindings stay in apps. Fix wrong package namespaces in the same map.
- **M9 — Channel column**: Role table states main WS vs terminal vs relay vs desktop IPC.
- **M10 — Coordination**: Docs can land before packages exist (stub names). Layering “agent-safe” requires M8 rewrite + decision tree, not only a blog post.
- **M11 — Minimal mechanical check**: At least one cheap CI/script or package test that fails if `packages/shared/src` (except allowlisted `terminal/**`, `preview/**`, `debug/**`) imports api-client/api-types or defines main-app `WsAction`/`WsRequest` authorities. Full dependency-cruiser remains Nice.

### Nice to Have

- **N1 — Full dependency-cruiser / eslint path bans**
- **N2 — Move terminal types into api-types** (dedicated PR only)
- **N3 — Ban `export type WsAction` under apps** via lint
- **N4 — Diagram asset** for onboarding

## Out of Scope

- Implementing 048/049 features (code owned there).
- Redesigning ui/i18n architecture.
- Rust crate layering.
- Forcing mobile onto `@workspace/ui`.

## Success Metrics

- Leading: role table + decision tree + **rewritten packages/AGENTS** merged.
- Leading: minimal shared-boundary check green.
- Lagging: no new main `/ws` wire types under shared utils; 048/049 PRs cite this map.
- Qualitative: “I know where to put this without asking.”

## Risks & Settled

- **Settled**: Package names api-types / api-client; shared ↛ api-types; terminal exception; desktop IPC app-local.
- **Risk**: Docs without any CI rot — mitigated by M11 minimal check.
- **Risk**: Over-strict shared forbid → trivial mappers live in app/api-client — accepted.

## Milestones

| Phase | Content |
|-------|---------|
| **1** | TECH matrix + packages/AGENTS rewrite + root Agents rows + shared AGENTS NEVER + minimal check (or script stub) |
| **2** | When 048/049 packages exist: their AGENTS link here; T-SYNC |
| **3** | N1/N3 if drift returns |

## Global implementation order (with 048/049)

```text
APP-050 Phase 1 (docs + AGENTS rewrite + cheap gate)
    → APP-048 Phase 1 (frames + actions + enum drift)
    → APP-049 Phase 1 (kernel)
    → APP-049 mobile cutover
    → APP-048 DTO/mobile types (can parallel mobile transport)
    → APP-049 web cutover + scope helper
    → APP-048 drift CI hard on monorepo
    → optional N*
```

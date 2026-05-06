---
name: atmos-specs-tech
description: Write or update the technical design document for an Atmos spec at `specs/<ZONE>/<ZONE>-NNN_.../TECH.md`. Use whenever the user wants to turn a PRD into a HOW — architecture, data model, API/WebSocket messages, rollout plan, risks. Trigger on "tech spec", "技术方案", "架构设计", "data model", "WebSocket message", "crate layout", or when the user asks how to build a feature the PRD has already pinned down. Respect Atmos's layered architecture (infra → core-engine → core-service → api → apps) and WebSocket-first transport. Only touch `TECH.md`.
user-invokable: true
args:
  - name: spec_id
    description: Spec identifier, e.g. `APP-006` or `APP-006_project-wiki`. Required.
    required: true
---

# Atmos Specs · TECH

Translate a PRD into an engineering plan concrete enough that another engineer could implement it without a meeting. Output: one `TECH.md` file.

## What this skill owns — and what it does not

- **Owns**: `TECH.md` in one spec directory.
- **Does not own**: BRAINSTORM, PRD, TEST, and — importantly — actual code. If you find yourself wanting to edit `crates/` or `apps/`, stop and hand off to the `atmos-specs-impl` skill.

Why: TECH is a design artifact. It should be reviewable without running the code. Editing code mid-design flow contaminates the spec with premature details.

## Read these before you write

1. `specs/AGENTS.md` — conventions.
2. The spec's own `PRD.md` — this is your contract. Every Must Have (M1, M2, …) should be addressed here.
3. The spec's `BRAINSTORM.md` for context on rejected options.
4. Root `AGENTS.md` — specifically the **Transport Rules** (WebSocket-first) and the **Backend Change Flow** (infra → core-engine → core-service → api).
5. Package-level `AGENTS.md` files for any crate/app you plan to touch:
   - `crates/infra/AGENTS.md` — DB, WebSocket, jobs.
   - `crates/core-engine/AGENTS.md` — PTY, Git, FS.
   - `crates/core-service/AGENTS.md` — business rules.
   - `crates/agent/AGENTS.md` — ACP integration.
   - `apps/api/AGENTS.md` — handlers and DTOs.
   - `apps/web/AGENTS.md` — Next.js app.
   - `packages/ui/AGENTS.md` — shared UI.
6. A comparable existing `TECH.md` for tone and depth:
   - API/WebSocket-style: `specs/APP/APP-012_remote-access/TECH.md`
   - Frontend-heavy: `specs/APP/APP-010_preview-element-select/TECH.md`
   - Protocol/integration: `specs/APP/APP-004_local-agent-integration-acp/TECH.md`

## Workflow

### 1. Anchor to the PRD

Open `PRD.md`. List every Must Have (M1, M2, …) and every resolved fork. The TECH must answer each one. If the PRD has unresolved forks tagged "decide in TECH", resolve them here — explicitly name the decision and why.

If the PRD is empty or obviously stale, pause and suggest running `atmos-specs-prd` first.

### 2. Pick the layer surface

Decide, for each Must Have, which layers need to change. The canonical flow:

```
apps/web or apps/desktop
        ↑
     apps/api (HTTP / WebSocket handlers, DTOs)
        ↑
crates/core-service (business logic)
        ↑
crates/core-engine (tech capability: Git, PTY, FS)
        ↑
crates/infra (DB, WS, Redis, jobs)
```

Rules you should apply unless explicitly overridden by the user:

- **New persistent data** → `crates/infra` (schema + DB access).
- **New capability like "apply a patch", "read a worktree"** → `crates/core-engine`.
- **New business rule like "can user X do Y to workspace Z"** → `crates/core-service`.
- **New endpoint** → `apps/api`, but **only after** asking whether it should be a WebSocket message instead. Atmos is WebSocket-first. Defend any new REST route explicitly in the Risks section.
- **New frontend feature** → start from existing API client in `apps/web/src/api/` and shared primitives in `packages/ui/`.

### 3. Decide data model before protocol

- Sketch types once, canonically. If a type exists in Rust in `crates/*`, reuse it; don't invent a parallel shape.
- Name every new table, column, and enum. Call out migrations explicitly.
- For WebSocket, name every new `WsAction` variant and the payload shape. Link to the existing enum location (`crates/infra/src/websocket/message.rs` or similar) by path.

### 4. Draft rollout steps

Order them so a reviewer can read top to bottom and get smaller, mergeable chunks:

1. Schema / migration.
2. Infra + core-engine plumbing.
3. Core-service logic.
4. Transport (WS message or REST endpoint).
5. Frontend consumption.
6. Feature flag / gradual rollout if any.

Each step should be shippable by itself (or clearly marked as "merge with step N").

### 5. Write TECH.md

Use this structure. Keep it 150–500 lines; go longer only when justified (e.g., APP-001 is a product-wide tech plan).

````markdown
# TECH · <ZONE>-NNN: <Title>

> Technical Design · HOW. Implements PRD <ZONE>-NNN: <Title>.

## Scope summary

One paragraph: what this doc covers, what it explicitly doesn't. Include the PRD Must Have items this doc addresses (e.g., "Addresses M1–M4. N1 and N2 deferred.").

## Architecture overview

High-level diagram (ASCII is fine). Name the layers and the specific crates / apps / packages touched.

```
apps/web  →  apps/api  →  crates/core-service  →  crates/core-engine  →  crates/infra
```

Call out any external dependency (GitHub API, tmux, tunnel provider, LLM provider).

## Module-by-module design

### crates/infra

- **DB schema changes**: …
- **WebSocket message additions**: `WsAction::Foo { … }` in `crates/infra/src/websocket/message.rs`.

### crates/core-engine (or agent / ai-usage / etc.)

- New capability: `fn apply_patch(...) -> Result<…>`.
- Reused capability: existing `X` from `Y`.

### crates/core-service

- New service method / trait: …
- Authorization / validation rules: …

### apps/api

- WebSocket handler: maps `WsAction::Foo` → service call. File path: `apps/api/src/...`.
- REST route **only if justified** — explain here why WS doesn't fit.

### apps/web

- New component(s) and their location under `apps/web/src/components/...`.
- Store changes in `apps/web/src/stores/...`.
- API client wiring in `apps/web/src/api/...`.

### packages/ui (if touched)

- New primitives, new variants on existing primitives.

## Data model

Types, tables, and enums in one place. Use code blocks.

```ts
interface Foo { … }
```

```rust
pub struct Foo { … }
```

```sql
CREATE TABLE foo ( … );
```

## Transport

### WebSocket messages

For each message, define the request/response shape and invariants. Prefer extending `WsAction` over adding REST.

```ts
// request
{ action: "foo_create", payload: { … } }
// response
{ action: "foo_created", payload: { … } }
```

### REST (only if justified)

Endpoint, method, auth, request/response schema. Write a one-line justification for why this isn't a WebSocket message.

## Security & permissions

- Auth requirements.
- Authorization checks (per-project, per-workspace).
- Any sensitive data handled (tokens, file contents). Note how they are stored and logged.

## Rollout plan

Ordered, small, mergeable steps.

1. DB migration `…`.
2. Add `WsAction::Foo` variant (no handler yet).
3. Implement service method + handler behind feature flag.
4. Frontend wiring, hidden behind flag.
5. Enable flag for internal dogfood.
6. Remove flag.

## Risks & tradeoffs

- **Risk**: …
- **Tradeoff**: chose X over Y because …
- **If this breaks in production, the rollback path is**: …

## Dependencies & compatibility

- Depends on spec: …
- Blocks spec: …
- Minimum Atmos version: …
- External services / binaries: `gh`, `tmux`, Tailscale, etc.

## Open questions

- [ ] …
````

## Writing rules

- **English**. Code identifiers stay as-is; comments and prose are English.
- **Use real paths**. `crates/infra/src/websocket/message.rs`, not "somewhere in infra". When you cite a symbol, include enough path that the reader can open the file in one jump.
- **Be decisive**. A TECH doc is where decisions land. When two options both work, pick one and say why in one sentence in Risks & tradeoffs.
- **Defend non-WS REST**. If you're adding a REST endpoint to an otherwise-WS flow, write the one-line reason next to it.
- **Show small before big**. Data model and transport shapes before component trees. It's easier to review a schema than a UI sketch.
- **Skip what's obvious**. Don't rehash the PRD. Don't restate what every Atmos contributor already knows.

## Done criteria

- Every PRD Must Have is visibly addressed somewhere in TECH.md (scan for M1, M2, …).
- Every new type, table, enum, WsAction, endpoint, file path is named.
- A rollout section with at least 3 ordered steps exists.
- At least one risk / tradeoff is named.
- No placeholder comments remain.

## Common mistakes to avoid

- Copying PRD prose into TECH. TECH is bulletier and more concrete.
- Designing in prose without naming file paths. The reader will want to open files.
- Silent REST addition in a WebSocket-first app. Flag it explicitly.
- Skipping the rollout section. A design with no rollout is hard to ship in small PRs.
- Writing implementation code. Pseudocode for clarity is fine; real code belongs in the impl skill.

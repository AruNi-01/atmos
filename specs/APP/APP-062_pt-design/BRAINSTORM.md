# Brainstorm · APP-062: PT Design (Prototype Design)

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

- **Trigger**: Agentic builders often need to sketch product UI (layout, component placement, rough hierarchy) before or while implementing with shadcn/other UI libraries. Natural-language layout is weak for circular/complex arrangements; a drawable prototype is stronger.
- **Who feels it**: Agentic Builders using Atmos agents; product/design-minded engineers who want a shared visual language between human and Agent.
- **Current workarounds**: Figma (heavy, not agent-native), Excalidraw/tldraw alone (no component semantics), verbal prompts only, screenshots without structure, commercial wireframe packs that are design-only and not Agent-first.
- **Why hard**: Canvas engines speak geometry; agents need stable component semantics. Live React/shadcn on canvas is a different product than wireframe prototypes. We need isolation so a new surface does not pollute Atmos core packages.

## Goals (draft)

1. **Primary**: Ship **PT Design** — Prototype Design — an Agent-first wireframe/prototype surface with a full basic-component library (shadcn-aligned visuals + stable machine IDs).
2. **Primary**: Humans and Agents share one scene truth: Agents can **read** designs and **draw/edit** them; humans can hand a selection/frame to an Agent for implementation.
3. **Secondary**: Package lives as an isolated monorepo package (`pt-design`), runnable standalone and embeddable in Atmos without coupling into `@workspace/ui`, `@atmos/shared`, or main `/ws` packages.
4. **Non-goal (draft)**: Live interactive shadcn on canvas; codegen to production React as MVP.

## Options

### Option A — Excalidraw embed + semantic library + Design IR (favored)

Embed `@excalidraw/excalidraw` as the canvas. Ship a first-party **shadcn-style wireframe library** (grouped native elements + `customData`). Export a **Design IR** for Agents; expose a programmatic **scene API** so Agents place/update components.

**Pros**: MIT; proven embed; library + scene JSON already agent-friendly; commercial packs validate the wireframe path; no tldraw production license tax.
**Cons**: Not live UI; toolbar/properties customization limited; complex controls are visual approximations.
**Unknown**: Best UX for external Agent drag-insert vs API-only insert; how deep variant switching should go in v1.

### Option B — tldraw canvas + custom shapes as “components”

Use tldraw (already in Atmos Canvas for terminals) with custom shapes that mirror shadcn primitives.

**Pros**: Stronger custom shape model; team already has canvas muscle memory from APP-014.
**Cons**: Production needs license key / commercial terms; couples product licensing to PT Design; pollutes mental model of existing Canvas (ops desk vs UI prototype).
**Unknown**: Whether dual-canvas products confuse users if both live in Atmos shell.

### Option C — Live React/shadcn canvas (true UI builder)

Render real components on a freeform board (Framer-like / custom).

**Pros**: Highest fidelity for “click the button.”
**Cons**: Huge scope; not “prototype sketch”; harder for Agents to edit safely; conflicts with “no real code / components are for later implementation.”
**Unknown**: Performance and selection model for nested live trees.

### Option D — Fork Excalidraw monorepo for deep chrome control

Fork upstream to restyle toolbars, force palette UX, etc.

**Pros**: Unlimited chrome customization.
**Cons**: Permanent merge tax; not needed for Agent-first IR + library; violates isolation/simplicity for v1.
**Unknown**: Maintenance cost vs embed package only.

## Key forks in the road

- **Fork 1: Canvas engine** — Excalidraw (MIT embed) vs tldraw (license) vs live React. **Settled for PRD: Option A (Excalidraw).**
- **Fork 2: Package boundary** — new package vs feature under `apps/web` only. **Settled: standalone `packages/pt-design` (name: PT Design / pt-design), no pollution of other packages; optional thin host embed later.**
- **Fork 3: Component model** — static wireframe groups + metadata vs live React. **Settled: static wireframes + semantic metadata; not live shadcn.**
- **Fork 4: Agent surface** — chat-only export vs first-class Agent read/write API. **Settled: Agent-first — Agents can read IR and mutate scene; human one-click handoff.**
- **Fork 4b: Agent entry packaging** — MCP only vs CLI only vs both; Atmos Rust CLI vs package CLI. **Settled: both MCP and CLI+Skill are required; CLI is package-owned TypeScript/Ink; do not reuse Atmos Rust CLI.**
- **Fork 5: Code export** — wireframe-only vs codegen. **Settled for v1: design export only (IR + scene + optional image); no production code generation.**
- **Fork 6: Library scope** — basics only vs basics + many blocks. **Settled: all basic shadcn-aligned components; few optional common Block frames later.**
- **Fork 7: Circular reference UI** — product chrome vs user-drawn composition. **Settled: ignore reference “composed circular block” as product chrome; users draw any layout including circular; provide basics + optional blocks.**

## Open questions

- [ ] **Decide in TECH**: Package npm name (`@atmos/pt-design` vs `@atmos/prototype-design`) and public export surface (embed React root + headless API).
- [ ] **Decide in TECH**: Design IR schema versioning and stability guarantees for Agents.
- [ ] **Decide in TECH**: Standalone runner location (`packages/pt-design` Vite playground vs thin `apps/pt-design` demo). Prefer package-local playground if isolation is the priority.
- [ ] **Decide in PRD/TECH**: v1 storage — local-only (IndexedDB / file) vs Atmos workspace persistence. Default lean: package-local persistence; Atmos host supplies optional adapter later.
- [x] **Decide in TECH/PRD**: Agents connect via **MCP (stdio)** and **Ink CLI + Skill**; shared tool-defs; not Atmos Rust CLI.
- [ ] **Decide later**: Full 1:1 visual parity with every shadcn variant/state, or “default + key variants” first then expand.
- [ ] **Decide later**: Whether Atmos center-stage embedding is Phase 1 or Phase 2 (package + standalone first is safer isolation).

## References

- External: [Excalidraw integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration), libraries, element skeleton, MIT LICENSE.
- External: [shadcn/ui components](https://ui.shadcn.com/docs/components) (catalog to mirror visually, not run as React on canvas).
- External: commercial precedent for shadcn-style Excalidraw wireframe packs (design libraries, not code libraries).
- Related Atmos: [APP-014 Canvas](../APP-014_canvas/PRD.md) (ops canvas / tldraw — **different product**); [APP-050 package layering](../APP-050_shared-package-layering/PRD.md) (isolation rules).
- Research session: Agent-first Excalidraw wireframe product exploration (this conversation).

## Ready to promote

- Promote to PRD:
  - Product name **PT Design** (Prototype Design); package **pt-design** / `@atmos/pt-design`.
  - Agent-first prototype wireframe tool; tiered catalog M5a/M5b; bare `componentType` ids.
  - Export for Agents (read); Agent can draw/edit (write); handoff UI + headless scopes.
  - **Two Agent entry points**: MCP server + CLI/Skill; CLI uses Ink; not Atmos Rust CLI.
  - MVP = package-only (embed API yes; Atmos host route N4); offline M16; error contract M17.
  - No live components, no codegen MVP; optional few Block frames later.
- Promote to TECH:
  - Dual exports browser/headless; owned template factories; scene SoT + IR projection.
  - Shared `tool-defs` + full CLI bijection; file revision/single-writer; path jail.
  - `pt-design-mcp` stdio; `pt-design` Ink CLI; Skill required sections; fixed handoff instructions.
- **Post multi-agent review (applied)**: type-id freeze, headless/MCP/CLI contracts, failure tests, normalizeIR parity.
- **Full product decision (user)**: ship complete package (full basic catalog + blocks + variants + Agent surfaces) **and** Atmos embed — **left sidebar → center stage** (M18). Package-only MVP rejected.

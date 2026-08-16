# TEST · APP-062: PT Design (Prototype Design)

> Test Plan · full product: package (catalog, IR, MCP, CLI+Skill) **and** Atmos left sidebar → center stage embed. References PRD APP-062 and TECH APP-062.

## Test strategy

- **Package**: Bun unit/integration in `packages/pt-design` (IR, commands, catalog, tool-defs, file, CLI, MCP, parity, failures).
- **Boundary**: package isolation; headless must not import browser Excalidraw; apps only public embed API.
- **Atmos host**: Bun structural/unit tests for tab registration + open helper; **agent-browser** / manual for left sidebar → center open; optional Playwright when wired into e2e harness.
- **No** Atmos Rust CLI. No requirement that package playground needs API process.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 Isolated package | S1, S2, S37 |
| M2 UI standalone | S3 |
| M3 Embed API | S4 |
| M4 Prototype surface | S5, S5b |
| M5 Full basic catalog | S6, S7 |
| M6 Self-built | S6 |
| M7 Metadata | S8, S9 |
| M8 Design export | S10, S11, S35, S38 |
| M9 Agent write path | S12, S13, S14, S33 |
| M10 Handoff | S15, S15b, S16, S27, S34 |
| M11 Persistence | S17, S23, S30, S34, S40 |
| M12 Host boundary | S4, S19, S39 |
| M13 Docs | S20 |
| M14 MCP | S24, S25, S28, S30, S33, S34 |
| M15 CLI + Skill | S26, S27, S28, S29, S31, S32 |
| M16 Offline package | S3, S25, S26 |
| M17 Error contract | S30, S31, S32 |
| M18 Atmos left→center | S22, S39, S40, S41 |
| M19 Blocks | S21 |
| M20 Variants | S42 |
| N* deferred | not required for ship |

## Execution map

| Scenario | Level | Tool | Target | Fixture | Signals | Status |
|----------|-------|------|--------|---------|---------|--------|
| S1 | Bun/script | boundary | package deps | src + package.json | no forbidden deps | planned |
| S2 | Bun | `bun test` | public exports | package | headless + embed resolve | planned |
| S3 | agent-browser | playground | playground URL | no API | board mounts | planned |
| S4 | Bun | `bun test` | exports | types | PtDesignApp + session | planned |
| S5 | Bun | `bun test` | session | empty | scene + subscribe | planned |
| S5b | agent-browser | playground | board | empty | pan/zoom/select/undo | planned |
| S6 | Bun | `bun test` | catalog | shadcn-list | **every** basic id has factory | planned |
| S7 | Bun | `bun test` | place all | session | IR types match | planned |
| S8 | Bun | `bun test` | customData | button | `componentType === "button"` | planned |
| S9 | Bun | `bun test` | update | button | label + stable instanceId | planned |
| S10–S17 | Bun | `bun test` | IR/commands/persist | fixtures | as before | planned |
| S19 | Bun | `bun test` | HandoffSink | mock | accept once | planned |
| S20 | Manual | review | AGENTS.md | docs | edges + binaries | planned |
| S21 | Bun | `bun test` | place blocks | block.* | IR componentType block id | planned |
| S22 | agent-browser / E2E | web app | left sidebar | workspace context | center tab `pt-design` | planned |
| S23–S28 | Bun | as TECH | file/MCP/CLI/parity | temp files | normalizeIR / auto-save | planned |
| S29 | Manual | Skill checklist | SKILL.md | sections | planned |
| S30–S35 | Bun | failures/image | CLI/MCP | bad paths | structured errors | planned |
| S37 | Bun | import graph | headless entry | no browser Excalidraw | planned |
| S38 | Bun | freehand IR | stroke+button | encode ok | planned |
| S39 | Bun | structural | center-tool-tabs + open helper | source | `"pt-design"` registered | planned |
| S40 | Bun | host persist | PersistenceAdapter mock | contextId | reload restores scene | planned |
| S41 | agent-browser | Atmos web | open → close → reopen | same context | design restored | planned |
| S42 | Bun | variant update | button variants | template swap | instanceId stable | planned |

## Scenarios

### S1 — Package boundary
Forbidden imports/deps including `apps/cli`; no reverse deep imports required for core flows.

### S2 — Public API
`@atmos/pt-design` and `@atmos/pt-design/headless` export documented symbols.

### S3 — Playground without Atmos
Playground mounts without API/Hub.

### S4 — Embed exports
`PtDesignApp`, session, IR, tool-defs available.

### S5 / S5b — Session vs chrome
S5 headless scene; S5b pan/zoom/select/undo in UI.

### S6 — Full basic catalog ship gate
Every id in pinned `shadcn-list.ts` has a template factory (empty allowlist not allowed for ship).

### S7 — Place every basic type
Each place succeeds; IR bare `componentType` matches.

### S8 — Bare componentType
`button` not `pt.button`.

### S9 — Update + stable instanceId

### S10 — Design IR shape `pt-design-ir/1`

### S11 — Scene round-trip semantics

### S12 — Command sequence place/update/delete

### S13 — Frame membership

### S14 — applyIR merge vs replace

### S15 / S15b / S16 — Handoff instanceIds / document / frame

### S17 — PersistenceAdapter mock

### S19 — Host handoff sink mock

### S20 — Package + host docs

### S21 — Blocks (M19)
Place each required block id (`block.auth-form`, `block.settings-shell`, `block.empty-state`, `block.nav-content`); IR types match; multi-element group moves as unit when encoded.

### S22 — Atmos left sidebar opens center (M18)
- **Level**: agent-browser (and Playwright when harness includes app shell)
- **Given**: authenticated/local Atmos web with a workspace context
- **When**: user activates left sidebar **PT Design** control
- **Then**: center stage shows PT Design surface; URL/tab value is `pt-design` (or documented equivalent); board interactive
- **Signals**: center panel visible; tab active; not only a modal/right-rail

### S23 — File init/open/save

### S24 — MCP tool list = tool-defs

### S25 — MCP place + auto-save

### S26 — CLI place `--json`

### S27 — CLI handoff

### S28 — Adapter parity with `normalizeIR`

### S29 — Skill required sections

### S30 — File open failures

### S31 — Mutation validation failures

### S32 — CLI `--json` stdout hygiene

### S33 — All tool-defs handler smoke

### S34 — MCP handoff + save

### S35 — Image optional headless

### S37 — Headless import graph

### S38 — Freehand IR encode

### S39 — Center tool tab registration (M18)
- **Level**: Bun structural
- **Given**: `center-tool-tabs.ts` (or successor)
- **Then**: `pt-design` is a valid center tool tab value; open helper accepts it
- **Signals**: type/const includes value; unit test for `isCenterToolTabValue("pt-design")`

### S40 — Host persistence per context (M18)
- **Level**: Bun
- **Given**: host PersistenceAdapter with context A
- **When**: place component, save, new session load for A
- **Then**: design restored; context B empty or independent
- **Signals**: IR type for A; B not polluted

### S41 — Reopen restores design (M18)
- **Level**: agent-browser
- **Given**: design with at least one component in Atmos center PT Design
- **When**: close center tab, reopen from left sidebar (same context)
- **Then**: component still present (or empty state only if user cleared)
- **Signals**: IR/UI shows prior component

### S42 — Variant switch (M20)
- **Level**: Bun
- **Given**: placed button default
- **When**: update variant to `outline` (or catalog-declared variant)
- **Then**: instanceId unchanged; metadata variant updated; geometry comes from outline template
- **Signals**: customData.variant; instanceId equality

## Performance & load budgets

Informational: small headless ops soft &lt; 50ms; IR encode ≤200 nodes soft &lt; 100ms. Not merge gate.

## Regression checklist

- [ ] No package deps on api-*/shared/ui/`apps/cli`
- [ ] Full basic catalog green (S6/S7)
- [ ] Blocks + variants ship (S21/S42)
- [ ] MCP ↔ CLI tool-defs parity
- [ ] `--json` hygiene
- [ ] Left sidebar → center open; not branded Canvas
- [ ] Host does not reimplement catalog
- [ ] instanceId stable on prop/variant update
- [ ] Freehand does not crash IR encode
- [ ] Desktop web shell inherits same entry if Electron hosts web

## Exploratory agent-browser checks

1. Playground cold open + place + export IR.  
2. Atmos: left sidebar PT Design → center board → place → handoff.  
3. Close/reopen tab same context.  
4. Switch workspace context: designs do not cross-contaminate.  
5. Narrow viewport: no hard crash.  
6. Copy says PT Design / Prototype, not Canvas.  
7. Console clean of Excalidraw load failures.

## Acceptance criteria

- [ ] M1–M20 each covered; N* not required for ship.  
- [ ] Automated package suite: S1–S2, S4–S17, S19, S21, S23–S28, S30–S35, S37–S38, S42.  
- [ ] M18: S39 automated; S22 + S41 agent-browser (or Playwright) recorded in Coverage Status.  
- [ ] S40 host persistence automated.  
- [ ] S28 parity with normalizeIR (no waiver).  
- [ ] M5 full catalog: S6+S7 green with **empty** missing list.  
- [ ] No main `/ws` IR ownership; no `apps/cli` coupling.  
- [ ] Package + host docs present.  
- [ ] `bun test` package + relevant web shell tests pass; typecheck includes package and host wiring.  
- [ ] Coverage Status filled with exact commands.

## Manual verification steps

1. Full basic catalog spot-check recognizable wireframes.  
2. Blocks: place all four required starters.  
3. Atmos left sidebar → center open → persist across reopen.  
4. CLI + MCP offline smokes.  
5. README/Skill: dual entry + Atmos embed described.

## Non-coverage

- Pixel-perfect shadcn visual regression.  
- Live component interactivity.  
- Multiplayer; remote MCP SSE; multi design tabs (N6).  
- Codegen quality.  
- Atmos Rust CLI.  
- Mobile-first layout.

## Coverage Status

> Post-implementation: commands, M5 list pin date, agent-browser notes for S22/S41.

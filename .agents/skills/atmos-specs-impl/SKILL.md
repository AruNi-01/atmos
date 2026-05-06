---
name: atmos-specs-impl
description: Implement an Atmos spec — turn the four spec docs (BRAINSTORM / PRD / TECH / TEST) at `specs/<ZONE>/<ZONE>-NNN_.../` into real production code changes in `crates/`, `apps/`, `packages/`. Use whenever the user says "implement APP-NNN", "ship this spec", "按照 spec 实现", "start coding the PRD", or otherwise transitions from spec authoring to actual engineering. Read all four files first, plan along TECH's rollout, respect Atmos's layered architecture (infra → core-engine → core-service → api → apps) and WebSocket-first transport. Keep existing tests green (regression gate) and run lint+compile on every chunk; delegate authoring new scenario-level tests to the `atmos-specs-test-run` skill. Writes production code (not specs, not new scenario tests); updates specs only when reality forces TECH to change.
user-invokable: true
args:
  - name: spec_id
    description: Spec identifier, e.g. `APP-005` or `APP-005_github-integration`. Required.
    required: true
  - name: phase
    description: Optional rollout phase from TECH.md (e.g. `1`, `schema`, `frontend`). If omitted, implement the next incomplete phase in order.
    required: false
---

# Atmos Specs · Implementation

This skill is the bridge from specs to shipped production code. You execute what TECH.md designed, you keep the regression gate green, and you do it in the layer order Atmos expects. Comprehensive test authoring for the spec (turning TEST.md scenarios into runnable tests) belongs to the sibling skill `atmos-specs-test-run`.

## What this skill owns — and what it does not

- **Owns**: real production code in `crates/`, `apps/`, `packages/`, plus schema/migration/feature-flag files TECH.md names.
- **Owns**: compile + lint + existing-test regression gate on every chunk (`cargo check`, `cargo clippy`, `bun run typecheck`, `just lint`, targeted `cargo test` / `bun test` for pre-existing suites near the change).
- **May touch `TECH.md`**: only when implementation reveals a decision in TECH that is wrong or ambiguous. When that happens, update TECH alongside the code and call it out.
- **Does not own** authoring the scenario-level test suite described in TEST.md. Hand that off to `atmos-specs-test-run`. In-line "smoke" tests that are *the cheapest way to prove the code you just wrote compiles and runs* are fine (and encouraged), but the systematic TEST.md coverage pass is not this skill's job.
- **Does not touch `PRD.md` / `BRAINSTORM.md`** — if PRD is wrong, stop and tell the user.

Why: separating production code from scenario-test authoring forces honesty. When the same skill writes both, it's tempting to weaken assertions to make green; having `atmos-specs-test-run` write the suite afterward, against the plan, makes regressions land as real failures. The regression gate (lint + existing tests) stays here because it's non-negotiable for every code chunk.

## Read these before you code

Read them in order. Do not skim.

1. The spec's **`PRD.md`** — to understand the Must Have acceptance criteria (M1, M2, …).
2. The spec's **`TECH.md`** — your primary input. List every rollout step; list every new type/table/WS message/endpoint.
3. The spec's **`TEST.md`** — your definition of done. You will run these scenarios before finishing.
4. The spec's **`BRAINSTORM.md`** — only for context on rejected directions, so you don't accidentally re-introduce them.
5. Root **`AGENTS.md`** — Transport Rules, Backend Change Flow, Debug Logging.
6. Package-level **`AGENTS.md`** for every crate / app you will touch:
   - `crates/infra/AGENTS.md`, `crates/core-engine/AGENTS.md`, `crates/core-service/AGENTS.md`, `crates/agent/AGENTS.md`
   - `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `apps/desktop/AGENTS.md`, `apps/cli/AGENTS.md`
   - `packages/ui/AGENTS.md`
7. **Existing similar code** cited in TECH.md. Match its style, naming, error handling.

If any of PRD / TECH / TEST is still a template placeholder, stop. Implementing against a skeleton is a trap. Tell the user to run the corresponding specs skill first.

## Workflow

### 1. Build a plan from TECH's rollout section

Open TECH.md's "Rollout plan". Each numbered step becomes a work chunk. For the target `phase` (or the next incomplete one), produce a concrete plan listing:

- Files to create or edit, full paths.
- New types / enums / WsAction variants / endpoints / tables.
- The single verification command you'll run after the chunk (usually a `just` target or targeted `cargo test` / `bun run`).
- Which TEST.md scenarios will later need coverage via `atmos-specs-test-run`, as a forward-looking checklist (so nothing is forgotten at hand-off time).

Show this plan before you start editing. The user should be able to stop you cheaply.

### 2. Respect the layer order

Implement from the bottom of the stack up. This keeps each chunk compilable and reviewable.

```
1. crates/infra            # schema, WS message variants, DB access
2. crates/core-engine      # tech capabilities (Git, PTY, FS)
3. crates/core-service     # business rules, authorization
4. crates/agent | ai-usage | token-usage | llm  # domain crates as needed
5. apps/api                # WS handlers / DTOs; REST only if TECH justifies
6. apps/web or apps/desktop  # UI + store wiring
7. packages/ui             # only if extracting a reusable primitive
```

Rules you apply unless the user explicitly overrides:

- **WebSocket-first.** If TECH introduces a new REST endpoint without a defense clause, stop and confirm with the user before adding it. Extending an existing `WsAction` is the default.
- **Reuse existing types across layers.** If a Rust struct in `crates/core-service` already models the domain, don't invent a parallel DTO in `apps/api` — reuse and, if needed, add serialization.
- **Each app owns its own `api/client.ts` + `types/api.ts`.** Don't cross-wire `apps/web`'s API client into `apps/desktop` — duplicate and keep it local.
- **Frontend features live under `apps/<app>/src/components/<feature>/...`.** Generic primitives go to `packages/ui`.
- **No new crates** unless TECH explicitly requires one.

### 3. Implement one chunk at a time

For each chunk:

1. Apply edits, small and coherent.
2. Run the chunk's **regression gate**: compile, lint, and any pre-existing tests that touch this surface. If you can't run it (missing deps, environment constraint), say so explicitly instead of pretending.
3. Add in-line smoke tests only if they are the cheapest way to prove the code path you just wrote runs correctly (e.g., a small `#[test]` next to a pure function). The *systematic* scenario coverage from TEST.md is not built here — that's `atmos-specs-test-run`.
4. Only then move to the next chunk.

When adding debug instrumentation (WS protocol work, PTY flows, agent streams), use the project's structured debug logs (see root `AGENTS.md` "Debug Logging"). Don't sprinkle `println!` / `console.log`.

### 4. Keep TECH.md honest

If implementation reveals:

- An API name in TECH that's already taken → rename in TECH and code together.
- A performance budget that TEST set but TECH didn't plan for → update TECH's Risks section, and either meet the budget or escalate.
- A layer assumption that doesn't hold (e.g. this should live in `core-engine`, not `core-service`) → update the module-by-module section in TECH.

Do this in the same change as the code. Never ship code that silently disagrees with TECH.

### 5. Verify regression, then hand off to test-run

Before you tell the user "done":

- Run the project-level regression gates:
  - `just lint` (or the specific crate/app variant).
  - The **existing** test suites that touch your change: `cargo test -p <crate>`, `bun test` on touched TS sources. The goal here is "no regression", not "new scenarios are green" — those are owned by `atmos-specs-test-run`.
  - For UI work, a browser smoke check against `just dev-web` at minimum.
- Produce a **Test hand-off** note: the list of TEST.md scenarios this phase is meant to unlock, in the shape `atmos-specs-test-run` expects. Example:
  ```
  Ready for atmos-specs-test-run:
    - S1 (happy path PR create) — surface: WS action `github_pr_create`, crate `core-service/src/github/mod.rs`.
    - S2 (empty state) — surface: `apps/api/src/ws/github.rs::empty_state`.
  ```
- Flag anything you could not verify (missing deps, external-service-dependent, etc.) so the reviewer knows what to exercise manually and `atmos-specs-test-run` knows what to cover.

Do **not** mark the phase complete until the regression gate is green.

### 6. Commit scope & style

- Use small, focused commits along the rollout steps. One chunk ≈ one commit is a good default.
- Commit messages: `<type>(<scope>): <summary>` where `scope` points to the spec and layer — e.g. `feat(APP-005/api): add github_pr_list WS action`.
- **Do not commit unless the user has explicitly asked.** Atmos's git safety rules apply; when unsure, stage and show diff.
- Never push to `main` without explicit permission. Use a feature branch like `impl/APP-005-github-integration` when appropriate.

## Deliverable (what you hand the user at the end)

A short report containing:

1. **Phase**: which rollout step(s) landed.
2. **Files changed**: grouped by layer.
3. **New types / endpoints / WS messages**: exact names.
4. **Regression gate**: exact commands run and their outcome.
5. **Test hand-off**: scenarios from TEST.md now ready to be covered, keyed by the surfaces introduced in this phase — input to `atmos-specs-test-run`.
6. **TECH.md changes** (if any), with a one-line reason each.
7. **Next up**: the next incomplete rollout step, ready to pick up.

Keep it tight — the goal is that the user can review the change in minutes, not rediscover the plan.

## Writing rules for any doc you do edit

When you do touch TECH.md:

- Keep the structure from the atmos-specs-tech skill.
- Mark changed sections with a short `<!-- updated YYYY-MM-DD: reason -->` comment so reviewers can spot drift from the original spec.

## Common mistakes to avoid

- **Implementing top-down** (start at the component, wire up to an imagined API, hope the backend catches up). You end up with a frontend that can't compile or a backend that doesn't match. Go bottom-up.
- **Adding a REST endpoint "for now"** in a WebSocket flow. You will not come back and fix it.
- **Skipping the lint/compile step** between chunks. Bugs compound faster than you think and you lose the signal about which chunk introduced them.
- **Writing the full TEST.md scenario suite here.** That's `atmos-specs-test-run`'s job. Limit yourself to small smoke tests that prove the chunk you just wrote runs; leave systematic coverage to the dedicated skill.
- **Editing PRD to match what you built.** If reality diverges from PRD, escalate to the user; don't quietly rewrite intent.
- **Reading only TECH.md.** TEST.md still defines the target surfaces; without it you'll hand off a phase that can't actually be tested.
- **Creating a new crate** just because a file grew a bit. Extend an existing layer first.
- **Marking the phase complete before running the regression gate.** "It compiles" is necessary but not sufficient — pre-existing tests must still pass.

## Done criteria

- All files in the declared phase are implemented, compile, and lint clean.
- Pre-existing tests in touched areas still pass.
- Every PRD Must Have that this phase is meant to unlock is reachable through the new surfaces (TECH matches reality).
- A Test hand-off note is produced so `atmos-specs-test-run` can pick up without re-reading everything.
- TECH.md is still accurate; any drift is reflected.
- Debug logs / structured events are in place where TECH called them out.
- Hand-off report is produced.

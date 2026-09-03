# Slice kanban (`PROGRESS.md`)

The lead agent is the **sole writer** of the board. Impl and review subagents do not edit `PROGRESS.md`.

If the spec has no `PROGRESS.md` yet, create it from `specs/references/progress-template.md`, then add the two sections below. Do not put the slice table in PRD/TECH/TEST.

## Slice Kanban

```markdown
## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID | Wave | Owns | Forbids | Depends | Status | Impl | Review | Verify |
|----|------|------|---------|---------|--------|------|--------|--------|
| S0 | 0 | `packages/api-types/src/ws/dto/foo.ts` | hot files except owns | — | done | ok | pass | `bun run typecheck` |
| S1 | 1 | `crates/agent/src/foo/**` | `apps/web/**` | S0 | in_review | ok | — | `cargo test -p atmos-agent foo` |
| S2 | 1 | `apps/web/src/features/foo/**` | `packages/api-types/**` | S0 | in_progress | running | — | `bun test apps/web/src/features/foo` |
| S3 | 2 | `apps/web/messages/*.json` | — | S1,S2 | planned | — | — | locale key grep |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

**Impl**: `—` · `running` · `ok` · `blocked`
**Review**: `—` · `running` · `pass` · `fail`
```

State machine: `planned → ready → in_progress → in_review → done`; failures go `rework → in_progress`; gaps go `blocked` and stop dispatch.

Only HUMAN or the lead agent may mark `done` after review **pass** and architecture check. Impl agents must not declare pass themselves.

## Slice cards (lead agent internal checklist)

Complete every field before dispatch. Attach under `## Slice Cards` in `PROGRESS.md` so briefs are not chat-only.

```markdown
### S1 — <short title>

- **Wave**: 1
- **Goal**: …
- **Out of scope**: …
- **Owns**: explicit file paths or tight globs (not a whole app)
- **Forbids**: overlapping areas + hot files not in Owns
- **Reads (read-only)**: neighboring files allowed to read, not edit
- **Depends**: S0 (contract already on disk)
- **Invariants** (copied from TECH, not "see TECH"): …
- **Verify**: one command
- **Review checklist** (lead agent; at least 3 concrete logic items): …
- **HUMAN open questions**: none | blocked until …
```

## Hot files

By default **do not** appear in two parallel slices' `Owns`. Assign to Wave 0, the final integration slice, or exactly one slice.

| Kind | Typical paths |
|------|----------------|
| i18n | `apps/web/messages/en.json`, `apps/web/messages/zh.json` |
| WS wire | `packages/api-types/src/ws/actions.ts`, `contract/**`, `dto/**` |
| Barrels | `index.ts` / `mod.rs` that re-export many modules |
| Shared stores | `use-*-store.ts` when multiple features write them |
| Spec board | `PROGRESS.md` — lead agent only |
| Agent guides | `**/AGENTS.md` |

Same-wave collision check (required before dispatch):

1. For slices that will run in parallel, compute intersection of `Owns` path sets.
2. Non-empty intersection → no parallel: merge slices, or move shared files to an earlier serial wave.
3. Glob overlap (`features/foo/**` vs `features/foo/lib/x.ts`) counts as collision.
4. Two slices both “may create the same new path” is also a collision.

## Wave rules

- **Wave 0 (serial):** Compile contracts. WS DTOs, Rust types, shared enums, modules both sides import. No parallel UI and API while the contract exists only on paper in TECH.
- **Wave N (parallel):** Disjoint `Owns` **and** depended contracts landed in a prior wave.
- **Final wave (serial):** Hot files, glue, cross-slice wiring. Still impl subagents — not lead-agent handwritten code.

Default at most **3** impl subagents per wave. Use 4 only when `Owns` are clearly disjoint, briefs are self-contained, and HUMAN has not objected.

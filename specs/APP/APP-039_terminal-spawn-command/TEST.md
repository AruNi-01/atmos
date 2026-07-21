# TEST · APP-039: Terminal `/spawn` Command

> Verification contract for the `/spawn` terminal AI Input command.

## Test strategy

- **Unit (Bun)** for the pure protocol + title helpers, which encode the M2/M6/M7 rules.
- **Component / integration** coverage for the overlay submit routing and pane creation is
  currently exercised through typecheck + lint + manual/agent-browser smoke, because the
  terminal overlay + mosaic grid lack an isolated harness. Recorded as a gap below.

## Coverage map

| PRD item | Scenario ids |
|----------|--------------|
| M1 slash menu entry | S1 |
| M2 chip + protocol token | S2 |
| M3 same capture rules as `/side` | S5 |
| M4 spawns a new pane, no modal/reuse | S3 |
| M5 agent selection parity | S4 |
| M6 title = first 24 chars + ` · By Spawn` | S6 |
| M7 raw `/spawn` text is inert | S7 |

## Execution map

| Scenario | Level | Expected tool | Target | Status |
|----------|-------|---------------|--------|--------|
| S6 title builder | unit | `bun test` | `buildSpawnTerminalTitle` | not_run (no test file yet) |
| S2/S7 spawn token detect/strip | unit | `bun test` | `hasKnownSpawnCommand`, `extractSpawnContextIds`, `stripResolvedTerminalAiProtocolTokens` | not_run |
| S1 slash menu | manual / agent-browser | manual | terminal AI Input | not_run |
| S3 new pane, no reuse | manual / agent-browser | manual | terminal grid | not_run |
| S4 agent picker parity | manual / agent-browser | manual | terminal AI Input | not_run |
| S5 capture parity | manual | manual | spawned pane prompt | not_run |
| Regression: static gates | ci | `bun run typecheck`, `bunx eslint` | apps/web | pass |

## Scenarios

- **S1** — Given a terminal with an agent, When the user opens AI Input and types `/`, Then
  both `Side` and `Spawn` appear in the slash menu. *Signals*: `Spawn` item visible.
- **S2** — Given `/spawn` selected, Then a "Spawn" chip is inserted backed by
  `atmos://spawn/<id>`. *Signals*: chip label "Spawn"; serialized text contains the token.
- **S3** — Given a spawn prompt submitted, Then a new pane is added to the grid (pane count
  +1) running the agent; no modal appears. *Signals*: new mosaic pane, focused.
- **S4** — Given no detected source agent, When submitting `/spawn`, Then the agent picker
  shows; after selecting, the pane spawns. *Signals*: picker visible then pane created.
- **S5** — Given a spawn, Then the launched prompt contains the bounded captured terminal
  transcript using the same budget as `/side`. *Signals*: prompt includes "Captured terminal context".
- **S6** — Given prompt "investigate the failing migration", Then the pane title is
  `investigate the failing mig · By Spawn`. *Signals*: `buildSpawnTerminalTitle` output; pane title text.
- **S7** — Given the user pastes text containing the literal `/spawn`, When submitting, Then
  no spawn occurs and the text is sent normally. *Signals*: no new pane; no spawn token in prompt contexts.

## Regression checklist

- [x] `bun run typecheck` (apps/web) — passes.
- [x] `bunx eslint` on touched files — 0 errors (3 pre-existing warnings).
- [ ] `/side` still works unchanged (shared overlay state).

## Acceptance criteria

- All Must Haves M1–M7 observable via the scenarios above.
- `/side` behavior is unchanged.

## Non-coverage

- Automated component/E2E for overlay submit routing and pane spawning (no isolated harness).
- Project-wiki / code-review scoped grids and canvas terminal cards (out of scope).

## Coverage Status

- 2026-07-21: Static gates green (`bun run typecheck` exit 0; eslint 0 errors). Unit tests for
  `buildSpawnTerminalTitle` and spawn token helpers are **not yet written** (gap). Behavioral
  scenarios S1–S7 verified only by code review so far; manual/agent-browser smoke pending.

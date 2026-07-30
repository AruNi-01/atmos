# TEST · APP-048: Orchestrator (Loop / Graph Agent Orchestration)

> Test Plan · verification contract for Orchestrator after post-review PRD/TECH hardening. References [PRD](./PRD.md) and [TECH](./TECH.md).

## Test strategy

- **Rust unit/service**: Runtime gates (complete, unverified, weaken Spec, budgets mid-flight, join completeness, compile, demote Loop, role_invoke atomic I/O, integrity)—primary merge bar.
- **Rust integration / WS**: run lifecycle with **fixture Terminal Agents** (scripts writing JSON artifacts), not `crates/llm`.
- **Bun**: chrome composition, layout intent helpers, i18n keys.
- **E2E / agent-browser**: entry isolation, multi-role headers, HITL strip, running graph lock.
- **Manual**: real Codex/Claude Loop + Graph dogfood.

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1–M3c | S1, S2, S2b, S3, S4, S59–S64 |
| M4–M6b | S5–S9, S48 |
| M7 | S10, S11 |
| M8–M8b | S12–S14, S20, S41–S44 |
| M9 | S15 |
| M10–M15, M11b, M14b | S16–S22, S21b–c, S19c, S25b–c, S18b |
| M16–M16b | S18, S23–S25, S14b, S39–S40 |
| M17–M19b | S26, S28, S49 |
| M18b | S27, S27b–g |
| M20–M25, M22b | S29–S33, S30b, S50 |
| M26 | S34–S35, S51–S58, S59–S64 |
| Forbidden / races | S36–S38, S45–S47 |
| N* | S-deferred |

## Execution map

| Scenario | Level | Tool | Target / method | Fixture | Signals | Status |
|----------|-------|------|-----------------|---------|---------|--------|
| S1 | E2E/bun | Playwright/bun | nav Orchestrator | app shell | entry visible | planned |
| S2 | E2E | Playwright | open without Canvas | — | no default canvas required | planned |
| S2b | E2E/agent-browser | — | empty state | — | copy distinguishes Canvas | planned |
| S3 | Service | cargo | board paths | temp home | orchestrator/boards only | planned |
| S4 | Service | cargo | target validation | guids | reject invalid | planned |
| S5 | Service | cargo | modes | — | auto/loop/graph stored | planned |
| S6 | Service | cargo | shared contracts | — | Spec/verdict parity | planned |
| S7 | Service | cargo | override | fixture planner→graph | effective loop | planned |
| S8 | Service | cargo | propose_mode | mode_proposal.json | reason set | planned |
| S9 | Service | cargo | no agent / bad JSON | — | no keyword auto | planned |
| S10 | Service | cargo | Loop pass | sensors OK | completed/spec_met | planned |
| S11 | Service | cargo | Loop budget | fail sensors | budget_iterations | planned |
| S12 | Service | cargo | Graph sequence | 2 nodes | ordered complete | planned |
| S13 | Service | cargo | join failed branch | fan-out | not completed | planned |
| S14 | Service | cargo | verify fresh pane | panes | pane B ≠ A | planned |
| S14b | Service | cargo | Tier B agent pick | 2 agents | verify ≠ maker | planned |
| S15 | Service | cargo | mode while running | — | rejected | planned |
| S16 | Service | cargo | draft Spec | fixture criteria | v1 file | planned |
| S17 | Unit | cargo | empty acceptance | — | reject | planned |
| S18 | Service | cargo | complete no Spec | — | reject | planned |
| S18b | Service | cargo | human open + sensors pass | — | not completed | planned |
| S19 | Unit | cargo | human confirm | — | required | planned |
| S19b | Unit | cargo | sensor auto-confirm | low risk | confirmed_by=auto | planned |
| S19c | Unit | cargo | trivial sensor + llm_judge | — | requires confirm | planned |
| S20 | Service | cargo | graph not stub | — | node transitions | planned |
| S21 | Service | cargo | maker update Spec | locked | denied | planned |
| S21b | Service | cargo | weaken Spec | gap | blocked until confirm | planned |
| S21c | Service | cargo | maker edits sensor file | integrity | fail closed | planned |
| S22 | Service | cargo | verdict bind | — | version+criteria | planned |
| S23 | Service | cargo | no_progress | same key×3 | failed+no_progress | planned |
| S24 | Service | cargo | wall pre-check | max_wall=0 | budget_wall | planned |
| S25 | Service | cargo | confidence ban | — | not completed | planned |
| S25b | Service | cargo | sensor timeout | — | unverified / not completed | planned |
| S25c | Service | cargo | rejection fires | — | not completed | planned |
| S26 | Integration | cargo/manual | spawn | tmux | role env+meta | planned |
| S27 | Unit | cargo/bun | events | — | roles distinct | planned |
| S27b | Bun | bun | chrome compose | same brand | titles differ | planned |
| S27c | E2E/browser | — | multi-role UI | fixtures | badges visible | planned |
| S27d | Bun | bun | multi-maker instance | 2 makers | instance labels | planned |
| S27e | Bun/E2E | — | activity chip | — | waiting_user visible | planned |
| S27f | Bun | bun | truncation | long goal | role in a11y name | planned |
| S27g | Bun | bun | grayscale a11y | — | glyph present | planned |
| S28 | Static | cargo/rg | no ACP/llm brain | — | gate pass | planned |
| S29 | Service | cargo | cancel | running | cancelled | planned |
| S30 | E2E | — | board highlight | — | node/iter | planned |
| S30b | E2E | — | running graph lock | — | no free-draw | planned |
| S31 | Service | cargo | evidence file | — | path OK | planned |
| S32 | Service | cargo | run list | 3 runs | fields | planned |
| S33 | Service | cargo | mode_reason | — | persisted | planned |
| S34 | CLI | cli | skill-dir | skill synced | path + prompt lines | planned |
| S35 | CLI | cli | create/get | API | id | planned |
| S51 | CLI | cli | spec draft/get/confirm | fixture API | Spec version | planned |
| S52 | CLI | cli | run start without Spec | — | ORCH_SPEC_REQUIRED exit≠0 | planned |
| S53 | CLI | cli | evidence attach | file | evidence listed | planned |
| S54 | CLI | cli | graph compile bad | bad edges | ORCH_GRAPH_COMPILE_FAILED | planned |
| S55 | CLI | cli | context get | running/draft | pack has goal/spec/artifacts | planned |
| S56 | CLI | cli | run cancel | running | cancelled | planned |
| S57 | CLI | cli | forced mode no planner | --mode loop | start without mode_proposal | planned |
| S58 | Bun/E2E | — | Copy agent instructions | UI | clipboard skill dir | planned |
| S36 | Service | cargo | role timeout | hang agent | worker_failed/artifact_invalid | planned |
| S37 | Service | cargo | partial JSON | half write | not accepted | planned |
| S38 | Service | cargo | atomic rename | — | accept final only | planned |
| S39 | Service | cargo | wall mid-flight | long maker | budget_wall kill | planned |
| S40 | Service | cargo | max makers fan-out | — | budget_makers | planned |
| S41 | Service | cargo | join hang branch | timeout | join_incomplete / failed | planned |
| S42 | Service | cargo | join 1 of 2 | missing | fail | planned |
| S43 | Service | cargo | compile cycle | no max_cycles | fail | planned |
| S44 | Service | cargo | max_cycles | — | stop reason | planned |
| S45 | Service | cargo | gap parks makers | running makers | refining_spec | planned |
| S46 | Service | cargo | restart reclaim | running row | interrupted | planned |
| S47 | Service | cargo | cancel 2 makers | — | both killed ≤5s | planned |
| S48 | Service | cargo | auto graph demote | bad graph | effective loop + reason | planned |
| S49 | Service | cargo | forced mode skip planner | loop | no mode_proposal call | planned |
| S50 | Bun/E2E | — | HITL strip | blocked_human | primary action | planned |
| S59 | Service | cargo | role cwd = home | workspace-bound run | maker cwd == home path | planned |
| S60 | Service/CLI | cargo/cli | workspace create | project-bound run | child linked + create_source orchestrator | planned |
| S61 | Service/CLI | cargo/cli | workspace use | child exists | maker cwd = child | planned |
| S62 | Service/CLI | cargo/cli | workspace merge | child with change | merge result + status merged | planned |
| S63 | Service/CLI | cargo/cli | workspace abandon | child | abandoned | planned |
| S64 | Service | cargo | multi-writer home | 2 makers no isolation | compile fail | planned |
| S-deferred | — | — | N1–N9 | — | — | planned |

## Scenarios

### Identity & isolation

**S1** — Management Center opens Orchestrator.  
**S2** — Orchestrator usable without ordinary Canvas open.  
**S2b** — Empty state copy: runs/Spec/Loop-Graph; not free-form board; optional Canvas link.  
**S3** — Board only under `orchestrator/boards/`; canvas dir unchanged.  
**S4** — Invalid workspace binding rejected.

### Modes

**S5** — Create with auto/loop/graph persists `requested_mode`.  
**S6** — Loop and Graph share Spec/verdict contracts.  
**S7** — User `loop` wins over planner proposing graph.  
**S8** — Fixture planner writes `mode_proposal.json` with non-empty reason.  
**S9** — Missing agent / invalid JSON → actionable error; no keyword auto; no `crates/llm` fallback.  
**S48** — Auto mode=graph with uncompilable graph → demote Loop + visible reason.  
**S49** — `requested_mode=loop` never invokes planner role.

### Loop / Graph execution

**S10** — Loop sensor pass → `completed`/`spec_met`.  
**S11** — Loop fails until `budget_iterations`.  
**S12** — Graph sequence maker→sensor completes.  
**S13** — Required branch failed → join fails; not completed.  
**S14** — Verify pane ≠ maker pane; role=verify.  
**S14b** — Two agents installed → verify prefers non-maker (Tier B).  
**S15** — set_mode while running rejected; carry_from creates new draft.  
**S20** — Graph mode produces real node transitions (not stub).  
**S41** — One branch never finishes past timeout → join fail / `join_incomplete`.  
**S42** — Expected 2, observed 1 → fail.  
**S43** — Cycle without max_cycles → compile fail.  
**S44** — max_cycles exceeded → explainable stop.  
**S40** — Fan-out exhausts `max_maker_invocations`.

### Spec & integrity

**S16** — Criteria fixture writes valid Spec v1.  
**S17** — Empty acceptance rejected.  
**S18** — Complete without Spec rejected.  
**S18b** — Sensors pass + open human → not completed (`blocked_human`).  
**S19 / S19b / S19c** — Confirm policies (human; sensor-only auto; llm_judge+sensor requires confirm).  
**S21** — Maker cannot update locked Spec.  
**S21b** — Weakening Spec after gap requires user confirm.  
**S21c** — Maker edits Spec sensor file → fail closed (not green).  
**S22** — Verdict binds spec version + criterion ids + evidence.  
**S25** — Confidence-only path cannot complete.  
**S25b** — Sensor crash/timeout → `unverified`; not completed.  
**S25c** — Rejection criterion true → not completed even if acceptance true.  
**S45** — criteria_gap sets `refining_spec` and parks makers.

### Runtime budgets / I/O / races

**S23** — Identical progress_key ×3 → `failed` + `no_progress`.  
**S24** — Wall already elapsed at tick → `budget_wall`.  
**S39** — Long fake maker mid-flight wall kill → `budget_wall`.  
**S36** — role_invoke timeout → `worker_failed` or `artifact_invalid`.  
**S37** — Partial JSON never accepted.  
**S38** — Only post-rename final artifact accepted.  
**S46** — Simulated restart: running→interrupted; no double runner.  
**S47** — Cancel with two makers; both interrupted within 5s.

### Chrome / UX

**S26** — Env + pane meta `orchRole`.  
**S27** — Events distinguish planner/criteria/maker/verify.  
**S27b** — Same agent brand, different roles → composed headers differ.  
**S27c** — Live multi-role UI badges; ordinary panes clean.  
**S27d** — Two makers → distinct instance labels.  
**S27e** — Activity chip shows waiting_user without scrollback.  
**S27f** — Truncated tab accessible name keeps role.  
**S27g** — Role glyph present under grayscale.  
**S30** — Board/run strip highlights active node/iter.  
**S30b** — Running: graph free-draw/widgets unavailable.  
**S50** — HITL strip primary on `blocked_human`.

### Ops / CLI

**S28** — Static gate: no ACP worker path; no llm feature brain for propose/draft.  
**S29** — Cancel → cancelled + user_cancel.  
**S31–S33** — Evidence, history, mode_reason.  
**S34–S35** — skill-dir; CLI create/get.  
**S51** — CLI `spec draft` → `get` → `confirm` succeeds with fixture Criteria.  
**S52** — CLI `run start` without Spec → non-zero exit + `ORCH_SPEC_REQUIRED`.  
**S53** — CLI `evidence attach` + `list` shows file.  
**S54** — CLI `graph compile` on illegal multi-writer graph → compile error code.  
**S55** — CLI `context get` returns goal, Spec path, artifact root, roles, **home.cwd**, workspaces list.  
**S56** — CLI `run cancel` on running run.  
**S57** — CLI create `--mode loop` then start never requires planner artifact.  
**S58** — UI Copy agent instructions places skill directory on clipboard (not full SKILL body).  
**S59** — Role spawn cwd equals run home workspace path (not random).  
**S60** — CLI/service `workspace create` makes child linked to run with orchestrator source.  
**S61** — After `workspace use --role maker`, maker launch cwd is child path; `context get` shows binding.  
**S62** — `workspace merge` produces user-visible success/fail; child status `merged`.  
**S63** — `workspace abandon` marks abandoned without writing home.  
**S64** — Graph two writing makers on home without isolation → compile fails.  
**S4** — Invalid binding still rejected; create run without project/workspace when standalone only if explicit.

---

## Performance & load budgets

- Planner/criteria role_invoke soft p95 dogfood &lt; 60s (CI uses fixtures).  
- Sensor default 120s; cancel interrupts process group ≤5s best-effort.  
- Wall watchdog resolution ≤5s.  
- WS fan-out must not stall PTY streams.

## Regression checklist

- [ ] Ordinary Canvas list/save untouched.  
- [ ] APP-015 canvas CLI / APP-017 automations unaffected.  
- [ ] Cancel leaves Spec history immutable.  
- [ ] Restart does not leave orphan orch panes forever.  
- [ ] i18n en+zh for roles, activity, empty state.  
- [ ] Forbidden list behaviors all blocked by tests above.  
- [ ] Forced mode does not spawn planner.

## Exploratory agent-browser checks

Load Agent Browser skill / `agent-browser skills get core --full`.

1. Empty state vs ordinary Canvas differentiation.  
2. Auto mode reason + override.  
3. Spec with human criterion blocks Start until confirm.  
4. Two same-brand agents: role+instance+activity scannable.  
5. Graph run strip vs minimap; running cannot free-draw.  
6. HITL strip steals focus.  
7. Cancel + stop reason one-liner.  
8. Narrow viewport: role short forms usable.  
9. Console/network clean on happy path.

## Acceptance criteria (merge-blocking)

- [ ] All PRD Musts (including M6b, M8b, M11b, M14b, M16b, M18b) have scenarios.  
- [ ] Runtime pure tests: Spec complete gate, unverified, weaken confirm, mid-flight wall, join hang/partial, compile, demote Loop, atomic artifact I/O, maker Spec deny, sensor integrity.  
- [ ] Graph Phase-1 bar: sequence + verify fresh + join fail-closed green in service tests.  
- [ ] Board isolation: no writes to ordinary canvas dir.  
- [ ] Chrome unit tests: role+instance+activity; multi-maker labels.  
- [ ] No ACP / crates/llm brain path (static gate).  
- [ ] CLI skill-dir + full M26 verb coverage including **workspace** (S34–S35, S51–S64) or documented deferrals with reason.
- [ ] Default role cwd = run home; child create/use/merge/abandon covered.  
- [ ] `just lint` + scoped cargo/bun tests pass post-impl.  
- [ ] Coverage Status updated by test-run skill.  
- [ ] agent-browser notes recorded or `not_run` with reason.

## Manual verification

1. Real agents: Loop in a bound workspace; confirm pane cwd is that workspace.  
2. Create child workspace mid-run, work there, merge back (or abandon) with visible outcome.  
3. Graph two-branch + hang one branch → does not complete.  
4. Same agent for maker+verify shows Tier badge; prefer second agent if installed.  
5. Kill API mid-run → interrupted after restart.  
6. Forced loop never opens Planner pane.

## Non-coverage

- Multi-Computer runs; mobile; N1–N9 productization; full agent matrix; token FinOps; nested Loop-in-Graph; auto-resume; Spec prose quality (schema only).

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`.

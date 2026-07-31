# TEST · APP-050: Shared Package Layering

> Verification for package role docs, AGENTS rewrites, and minimal boundary checks.

## Test strategy

Governance spec: static doc review + optional/required cheap import gate. No Playwright.

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1, M9 | T-DOC-01 |
| M2, M5, M6 | T-DOC-02, T-DOC-04, T-DOC-05 |
| M3 | T-DEP-01 |
| M4, M8 | T-DOC-03, T-DOC-06, T-DOC-07 |
| M7 | T-DOC-08 |
| M10, sequencing | T-SEQ-01 |
| M11 | T-CI-01 |
| Decision tree | T-DOC-09, T-DOC-10 |

## Execution map

| ID | Method | Signals | Status |
|----|--------|---------|--------|
| T-DOC-01 | Review packages/AGENTS role table | all M1 packages + channel column | pending |
| T-DOC-02 | Decision tree walk | multi-client DTO → api-types | pending |
| T-DOC-03 | Root Agents rows | wire / client / shared linked | pending |
| T-DOC-04 | shared AGENTS | terminal exception + NEVER main ws | pending |
| T-DOC-05 | relay AGENTS | deployable not SDK | pending |
| T-DOC-06 | packages/AGENTS | “API clients live in apps” **gone or rewritten** | pending |
| T-DOC-07 | package.json names | @atmos/i18n, @atmos/config correct | pending |
| T-DOC-08 | checklist present | multi-client PR bullets | pending |
| T-DOC-09 | tree | single-client DTO → app | pending |
| T-DOC-10 | tree | desktop IPC → electron | pending |
| T-DEP-01 | matrix vs PRD M3 | edges match TECH §2 | pending |
| T-SEQ-01 | review | global order matches 048/049 gates | pending |
| T-CI-01 | script/test | illegal shared import fails | pending |
| T-SYNC-01 | after 048/049 packages | package AGENTS link 050 | pending |

## Scenarios

### T-DOC-06 — Conflicting guidance removed

- **Given** Phase 1 PR
- **When** reading `packages/AGENTS.md`
- **Then** it does not claim all API clients live only in apps without mentioning api-client/api-types dual rule
- **Signals**: text search

### T-DOC-09 — Single-client DTO

- **Given** decision tree
- **When** classifying a web-only automation DTO
- **Then** landing is app-local, not api-types by default

### T-DOC-10 — Desktop IPC

- **Given** decision tree
- **When** classifying Electron invoke command types
- **Then** landing is `apps/desktop-electron`, not api-types

### T-CI-01 — Shared boundary

- **Given** a temporary illegal import of `@atmos/api-client` from `packages/shared/src/utils`
- **When** boundary check runs
- **Then** non-zero exit
- **Allowlist**: terminal/, preview/, debug/ as documented

### T-SEQ-01 — Sequencing

- **Given** APP-050 TECH §9 and APP-048/049 handoff language
- **When** compared
- **Then** 048 Phase 1 precedes 049 Phase 1; 050 docs can precede both

## Regression checklist

- [ ] packages/AGENTS rewritten
- [ ] shared AGENTS NEVER list extended
- [ ] root Agents navigation updated
- [ ] minimal boundary check exists or metrics demoted honestly
- [ ] no product behavior change required for Phase 1 docs

## Acceptance criteria

1. M1 role table complete with correct namespaces and channels.
2. Dependency matrix readable and non-misleading (no shared→ui).
3. Conflicting “API clients live in apps” guidance fixed.
4. Terminal and relay exceptions explicit; desktop IPC routed correctly.
5. Decision tree includes single-client DTO, i18n, config, IPC, Query.
6. M11 cheap check present (or success metrics explicitly docs-only until it is).
7. Global order documented for 048/049 implementers.

## Manual steps

1. Walk decision tree for: multi-client DTO, reconnect, formatRelativeTime, Electron cmd, terminal message field.
2. Confirm packages/AGENTS no longer misroutes agents.
3. After 048/049 packages land, re-check package AGENTS links (T-SYNC-01).

## Non-coverage

- Runtime WS behavior (049)
- Enum drift correctness (048)
- UI design rules

## Coverage Status

_Not run — pre-implementation (docs not yet applied to packages/*)._

# PROGRESS · APP-081: Mobile Agent Chat Web Parity

> Implementation Progress. Not a requirements source. Requirements stay in PRD/TECH/TEST.

## Status

- **State**: in_progress
- **Branch**: `feat/mobile-chat-web-parity` (base `docs/mobile-chat-web-parity`)
- **Last updated**: 2026-10-15
- **Current owner**: lead agent
- **Current phase**: S3 inline tool tree

## Snapshot

- Spec review committed (`704483158`).
- S0 done and reviewed: pure rules live in `@atmos/agent-transcript`; web paths re-export; `assistant-process.ts` is deleted. One web source-text assertion now reads the package file.
- S1 done and reviewed: synthetic F1–F13, `projectParityTree`, `scripts/agent-chat-parity/compare.ts` (13 match), preview route gated by `EXPO_PUBLIC_PARITY_PREVIEW`.
- S2 done and reviewed: user bubbles, answer caret, thinking titles, session chrome, errors, historic permissions, and the assistant footer. Tool-group sheets remain until S3. File-change rows use `presentAgentTool` and count only edit, delete, and move.
- `bun --filter @atmos/mobile typecheck` still reports errors only in files S0 did not touch (`fold-transcript.test.ts`, `use-agent-chat-thread.test.ts`, `expo-drawer.web.tsx`). Treat as pre-existing until a later slice proves otherwise.
- Blocked: nothing. 图一 pixel metrics stay unverified. Do not install Cursor agent CLI or mobai-dev.
- Do not change web behavior. Do not add a web route. Do not add `WsAction`s.

## Slice Kanban

> Orchestration board for `atmos-long-task-impl`. Not a requirements source.

| ID  | Wave | Owns                                                      | Forbids                              | Depends | Status  | Impl | Review | Verify                                         |
| --- | ---- | --------------------------------------------------------- | ------------------------------------ | ------- | ------- | ---- | ------ | ---------------------------------------------- |
| S0  | 0    | shared pure modules + web re-exports + mobile import swap | transcript UI rewrite, `PROGRESS.md` | specs   | done    | ok   | pass   | package tests, web unit tests, mobile bun test |
| S1  | 1    | fixtures, `scripts/agent-chat-parity`, preview route      | web routes, CLI/mobai install        | S0      | done    | ok   | pass   | compare.ts 13 fixtures, package + mobile tests |
| S2  | 2    | message views, expand store, session chrome               | tool tree, list engine               | S0, S1  | done    | ok   | pass   | mobile bun test 278; package tests; compare 13 |
| S3  | 3    | inline tool tree + bodies                                 | motion folder, card lane             | S2      | planned | —    | —      | mobile typecheck + bun test                    |
| S4  | 4    | `motion/`, shimmer, stream buffer, activity row           | card lane                            | S3      | planned | —    | —      | mobile typecheck + bun test                    |
| S5  | 5    | list stick, scroll pill shell, edge fades, own-send       | card pills                           | S2      | planned | —    | —      | mobile typecheck + bun test                    |
| S6  | 6    | card lane + card bodies                                   | composer option sheets               | S2, S5  | planned | —    | —      | `card-lane` bun test                           |
| S7  | 7    | composer parity                                           | new protocol                         | S6      | planned | —    | —      | mobile typecheck + bun test                    |
| S8  | 8    | `ci-mobile-ios-parity.yml`, coverage notes                | installing CLI/mobai                 | S1–S7   | planned | —    | —      | workflow file + bun tests                      |

**Status**: `planned` · `ready` · `in_progress` · `blocked` · `in_review` · `rework` · `done`

S5 waits until S3/S4 finish even though TECH allows S5 after S2, because `AgentChatTranscript.tsx` is a hot file. One writer at a time.

## Slice Cards

### S0 — Shared pure logic

- **Wave**: 0
- **Goal**: One copy of segmentation, settle, density, timing, motion constants, below-count, commit buffer, and the grok-chrome hide predicate, in `@atmos/agent-transcript`. Web paths re-export. Mobile stops shipping `assistant-process.ts`.
- **Out of scope**: New transcript UI, fixtures, preview route, card lane, shimmer component.
- **Owns**: listed in the S0 impl brief (package, the named web lib files, mobile assistant-process + its test, import adaptation in `AgentChatTranscript.tsx`, copy/token map tests, `packages/AGENTS.md` role sentence).
- **Forbids**: `PROGRESS.md`, `apps/web/src/features/agent/components/**`, new routes.
- **Depends**: spec review commit.
- **Invariants**: package stays UI-free and depends only on `@atmos/api-types`. DOM scroll helpers stay in web. No behavior change for web tests that import the old paths.
- **Verify**: package tests + typecheck, the named web unit tests, `cd apps/mobile && bun test`, `bun --filter @atmos/mobile typecheck`.
- **Review checklist**: re-exports cover previous public names; DOM functions not moved; mobile no longer defines `segmentAssistantParts`; web tests still import old paths.
- **HUMAN open questions**: none.

Later slice cards are filled in when that slice is dispatched. Owns stay disjoint from the hot transcript file across waves.

## Decisions Since TECH

| ID     | Decision                            | Why                                                        | Source update                                   |
| ------ | ----------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| R1–R11 | See TECH "Spec review (2026-10-15)" | Contradictions vs web copy, DOM lib, and AruNi's decisions | TECH/PRD/TEST/BRAINSTORM updated in `704483158` |

## Verification Status

| Area            | Command / Method                                       | Last result | Notes                                    |
| --------------- | ------------------------------------------------------ | ----------- | ---------------------------------------- |
| Spec review     | read specs + web/mobile sources + runner-images readme | done        | pins still match image `20260907.0351.1` |
| S2 mobile tests | `cd apps/mobile && bun test`                           | pass        | 278 tests                                |
| S2 package      | `bun --filter @atmos/agent-transcript test`            | pass        | helpers moved verbatim                   |
| Structural      | `bun scripts/agent-chat-parity/compare.ts`             | pass        | 13 fixtures match                        |
| S27 Cursor CLI  | —                                                      | not_run     | do not install                           |
| S28 mobai-dev   | —                                                      | not_run     | do not install                           |
| iOS simulator   | workflow not added yet                                 | not_run     |                                          |
| 图一 pixels     | image missing                                          | not_run     | pill height 36 is provisional            |

## Known Blockers

- [ ] 图一 is not in the repo. Pixel pill metrics stay unverified.
- [ ] S27 and S28 need a separate AruNi approval to install external tools.

## Handoff Notes

### Task goal

Phone Agent Chat matches web message/part/tool/motion/scroll/composer behavior, with the mobile pill-row exception in PRD M6.

### Current progress

S0 and S1 are committed. S2 is implemented and reviewed. Next code change is S3 (inline tool tree).

### Completed work

- Reviewed APP-081 against web libs, `en.json` card titles, wire events, mobile fold, and the macOS 26 runner image.

### Key decisions

- D2(a) via re-exports, not D2(b).
- Card pills are title-only and use the web card's real title.
- Real shimmer uses `expo-linear-gradient` and `@react-native-masked-view/masked-view`.
- iOS workflow is path-filtered, not label-gated.

### Constraints

- No new `WsAction`, no web route, no unrelated web behavior edits.
- Do not install Cursor agent CLI or mobai-dev.
- Branch `feat/mobile-chat-web-parity`, PR base `docs/mobile-chat-web-parity`. Do not merge.

### Open issues

- 图一 pixel check.
- S31 web PNGs only if an out-of-tree harness can import web components.

### Next steps

1. Finish S0 and review it.
2. S1 fixtures and comparer.
3. S2–S7 UI slices, serial on `AgentChatTranscript.tsx`.
4. S8 workflow, then CI.

### Relevant files/symbols

- `packages/agent-transcript`
- `apps/web/src/features/agent/lib/tool-group.ts`
- `apps/mobile/src/features/agent-chat/assistant-process.ts`
- `reduceLane` (not written yet)

## Changed Areas

- `specs/APP/APP-081_mobile-agent-chat-web-parity`: review amendments.
- Code: none yet.

## Progress Log

### 2026-10-15

- Completed spec review and commit `704483158`.
- S0 implemented and reviewed (pass, no P0/P1). Web `agent-tree-branch.test.ts` reads the package source for `return TREE_STEP_MS` because the web file is now a re-export.
- Mobile `bun test` passed (261). Package tests and the named web unit tests passed after that path fix.
- S1 implemented and reviewed (pass). `compare.ts` prints `13 fixtures match`.
- S2 implemented and reviewed (pass after a file-change rework). Mobile `bun test` 278. Package typecheck passed. Mobile typecheck still fails only in `fold-transcript.test.ts`, `use-agent-chat-thread.test.ts`, and `expo-drawer.web.tsx`.
- Next is S3.

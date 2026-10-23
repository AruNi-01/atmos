# TECH · QUALITY-030: Friday i18n / parity audit fixes

> Technical Design · HOW. One quality spec covering eight Friday-audit findings (P1/P2). No BRAINSTORM or PRD.

## Spec id

`QUALITY-030` is the next free id.

- `origin/main` already has QUALITY-001…027 and QUALITY-029.
- Open PR #354 holds QUALITY-028 (mobile list nav pagination).
- Search for `QUALITY-030` on open pull requests returned nothing at selection time.
- Baseline at audit: `a189cc0`. Implement against latest `origin/main` at start time.

## Scope summary

Eight audit items in **one PR**. Do not split. Do not migrate Highlights/pele. Do not expand into unrelated refactors. Item 7 is documentation-only (known non-goal).

| #   | Severity | Topic                                         | Outcome                                                                                                                     |
| --- | -------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | P1       | Mobile terminal combo-mode Chinese hardcode   | English string aligned with web ("Combo mode"); no full i18n stack                                                          |
| 2   | P1       | Agent Chat Mermaid error not i18n             | MermaidDiagram gets errorLabel/t (or main chat uses shared i18n path); zh must not show `Failed to render mermaid diagram`  |
| 3   | P1       | ApprovalCard Show less / more / Download plan | Inject showLessLabel / showMoreLabel / downloadPlanLabel from web `t(...)`                                                  |
| 4   | P1       | Web TerminalChrome status/search English      | `useTranslations`; add Terminal.chrome en+zh keys                                                                           |
| 5   | P2       | zh.json appshot promptBody still English      | Natural Chinese; keep path identifiers                                                                                      |
| 6   | P2       | DeleteProjectDialog hardcoded English         | Reuse/extend project.* / deleteProject keys                                                                                 |
| 7   | P2       | Mobile Agent Chat Mermaid / highlight ≠ web   | Document as known non-goal under APP-079 TECH (and checklist if any); do **not** implement RN mermaid→SVG or full highlight |
| 8   | P2       | Token-usage model-icon maps duplicated        | Extract to shared package with explicit platform adapters (same spirit as QUALITY-029)                                      |

## Item details

### 1 — Mobile terminal combo-mode copy

- File: `apps/mobile/src/features/terminal/TerminalBuiltinKeyboard.tsx` (~L206)
- Phone UI is English per product rule. Replace Chinese hardcodes (e.g. `组合键模式`) with English matching web (e.g. `"Combo mode"`).
- Out of scope: wiring a full mobile i18n framework for this string.

### 2 — Mermaid error in Agent Chat main path

- Shared: `packages/ui/.../mermaid-diagram.tsx` (~L71). Main chat path: `message.tsx` → `AgentPartView`.
- There is already an i18n'd `apps/web/.../MermaidBlock.tsx` that is **not** used on the main chat path.
- Fix: inject `errorLabel` (or equivalent) into `MermaidDiagram`, with web passing `t(...)`; **or** route main chat through the existing i18n shared layer. Pick the smaller, consistent option after reading both call sites.
- Acceptance: with locale `zh`, the UI must not show the English string `Failed to render mermaid diagram`.

### 3 — ApprovalCard expand / download labels

- File: `packages/ui/.../approval-card.tsx` (~L786): `Show less` / `{n} more` / Download plan aria.
- Approve/Skip already receive `t(...)` from web. Add `showLessLabel`, `showMoreLabel`, `downloadPlanLabel` (names may match existing message keys) and have web pass them.
- Keys must exist in both `en` and `zh` message files.

### 4 — Web TerminalChrome

- File: `apps/web/.../TerminalChrome.tsx` (~L140): Connecting / Reconnecting / Disconnected / Search terminal, etc.
- Use `useTranslations`. Add `Terminal.chrome.*` (or the project's existing Terminal namespace) keys in en+zh. Reuse phrasing from existing keys such as 重连中 / 已断开 where they already exist elsewhere.

### 5 — appshot zh promptBody

- File: `apps/web/messages/zh.json` → `appshot.lib.protocol.promptBody` (~L9538)
- Translate the whole body into natural Chinese. Keep path-like identifiers and protocol tokens untranslated when they are code identifiers.

### 6 — DeleteProjectDialog

- File: `apps/web/.../DeleteProjectDialog.tsx` (~L56)
- Stop hardcoding `Delete {projectName}`. Reuse or extend `project.*` / `deleteProject` keys in en+zh.

### 7 — Mobile Mermaid / highlight parity (document only)

- Files: `apps/mobile/.../AgentChatMarkdown.tsx`; APP-079 TECH already allows keeping fences.
- **Do not** implement React Native mermaid→SVG or a full syntax-highlighter stack.
- Update APP-079 TECH (and any mobile↔web parity checklist that lists Mermaid/highlight) to mark these as **known non-goals / deferred**. Cite APP-079 in the PR description. Do not claim parity is achieved.

### 8 — Token-usage model icon map

- Mobile: `apps/mobile/.../token-usage/model-icon.ts`
- Web: `apps/web/.../token-usage/token-usage-dialog-utils.ts`
- Extract the shared mapping into an appropriate shared package (follow existing package layout; QUALITY-029 is the precedent for stopping client drift).
- Platform-specific differences go through an **explicit adapter** (do not silently fork copies again).
- Add/adjust unit tests so both clients consume the shared map.

## Out of scope

- Multiple PRs
- Highlights / pele migration
- Unrelated refactors, dependency bumps, oxlint cap changes (cap stays 455)
- Implementing RN mermaid rendering or full mobile highlight for item 7
- Force-push, amend of pushed commits, editing git config

## Quality target

| Item | Before                                         | After                                                          |
| ---- | ---------------------------------------------- | -------------------------------------------------------------- |
| 1    | Chinese "组合键模式" (etc.) on mobile keyboard | English "Combo mode" (aligned with web)                        |
| 2    | zh Agent Chat shows English Mermaid failure    | Localized failure string via injected label / shared i18n path |
| 3    | ApprovalCard expand/download English only      | Labels from web `t(...)` props                                 |
| 4    | TerminalChrome hardcoded English status/search | `useTranslations` + en/zh keys                                 |
| 5    | zh appshot promptBody is English copy          | Natural Chinese, identifiers kept                              |
| 6    | Delete dialog title hardcoded English          | Message keys                                                   |
| 7    | Implied / silent gap vs web                    | Documented known non-goal under APP-079                        |
| 8    | Two divergent icon maps                        | One shared map + adapters                                      |

## Commit / PR conventions

- Author/committer via env only: `AruNi Lu` / `lrr.0x3f4@gmail.com`. Never change git config.
- One PR, Ready (not Draft) as soon as opened.
- Title should mention QUALITY / i18n (e.g. `fix(i18n): Friday audit QUALITY-030`).
- PR body: checklist of all 8 items with files touched + how verified (grep, key presence, doc anchors).
- List every new/changed message key.
- Do not merge; wait for Eng Manager.

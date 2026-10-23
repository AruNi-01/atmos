# TEST · QUALITY-030: Friday i18n / parity audit fixes

> Test Plan · verify the eight QUALITY-030 audit fixes. References TECH QUALITY-030.

## Test strategy

Mix of unit/component tests, message-key presence checks, and source scans. No new E2E required unless an existing suite already covers a surface. Manual locale spot-checks are listed where automation is thin.

- Unit / component: bun tests in the packages touched (ui, web, mobile, shared).
- Source scan: `rg` proving hardcoded English/Chinese strings are gone from the named call sites.
- Messages: every new key exists in both `apps/web/messages/en.json` and `zh.json` (and mobile message files if any keys are added there — item 1 is English-only hardcode, not keys).
- Lint: root `oxlint --max-warnings=455` unchanged.
- Item 7: documentation assertion only (TECH/checklist wording), not a runtime test.

## Coverage map

| Requirement               | Scenario |
| ------------------------- | -------- |
| 1 Combo mode English      | S1       |
| 2 Mermaid error i18n      | S2       |
| 3 ApprovalCard labels     | S3       |
| 4 TerminalChrome i18n     | S4       |
| 5 zh appshot promptBody   | S5       |
| 6 DeleteProjectDialog     | S6       |
| 7 Document known non-goal | S7       |
| 8 Shared model-icon map   | S8       |
| Lint cap 455              | S9       |

## Scenarios

### S1 — Mobile combo mode is English

- **Given** `TerminalBuiltinKeyboard.tsx`
- **When** source is scanned
- **Then** no `组合键模式` (or other Chinese combo-mode UI strings from the audit); visible label is English (e.g. `Combo mode`)
- **Signals**: `rg` + existing / new unit assertion if the component is already under test

### S2 — Mermaid failure localizes

- **Given** locale `zh` on the Agent Chat path that renders `MermaidDiagram`
- **When** a Mermaid render fails (unit with injected label, or render test)
- **Then** UI does not contain `Failed to render mermaid diagram`; uses the injected / translated label
- **Signals**: unit/component test; `rg` on mermaid-diagram defaults

### S3 — ApprovalCard labels from props

- **Given** ApprovalCard with `showLessLabel` / `showMoreLabel` / `downloadPlanLabel`
- **When** rendered
- **Then** those strings appear; web call site passes `t(...)` for each; keys exist in en+zh
- **Signals**: component test + message key grep

### S4 — TerminalChrome uses translations

- **Given** TerminalChrome
- **When** source is scanned
- **Then** Connecting / Reconnecting / Disconnected / Search terminal (audit set) are not hardcoded; keys under Terminal.chrome (or project convention) exist in en+zh
- **Signals**: `rg` + message files

### S5 — zh appshot promptBody translated

- **Given** `zh.json` `appshot.lib.protocol.promptBody`
- **When** read
- **Then** body is natural Chinese; path/protocol identifiers preserved; not an English verbatim dump
- **Signals**: manual read + diff vs en

### S6 — Delete project dialog i18n

- **Given** DeleteProjectDialog
- **When** source is scanned
- **Then** no hardcoded `Delete ${...}` / `Delete {projectName}` title; uses message keys present in en+zh
- **Signals**: `rg` + key presence

### S7 — Mobile Mermaid/highlight known non-goal

- **Given** APP-079 TECH (and parity checklist if present)
- **When** docs are read
- **Then** Mermaid SVG / full highlight on mobile are explicitly marked known non-goal / deferred; PR description cites APP-079
- **Signals**: doc anchors; no new RN mermaid renderer files

### S8 — Shared model icon map

- **Given** former mobile `model-icon.ts` and web `token-usage-dialog-utils` icon map
- **When** both clients resolve an icon
- **Then** they import the shared map; adapters only for platform differences; unit tests cover the shared module
- **Signals**: import graph + bun tests

### S9 — oxlint cap

- **Given** root package.json lint script
- **Then** still `oxlint --max-warnings=455`

## Coverage Status

> Filled 2026-10-23 on `aarynlu/quality-030-friday-i18n-audit-3e87` after the commands below. Head `1a0bf5069`.

| Scenario | Result | Evidence                                                                                                                                                                                                                    |
| -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1       | pass   | `bun test apps/mobile/src/features/terminal/TerminalBuiltinKeyboard.test.ts`. Source has `Combo mode`; `rg` finds no `组合键模式`.                                                                                          |
| S2       | pass   | mermaid-diagram + agent-part-view tests. Chat path injects `t("shared.markdownRenderer.mermaid.errors.renderFailed")` via `MermaidDiagramLabelsProvider`. zh is `Mermaid 渲染失败`, not `Failed to render mermaid diagram`. |
| S3       | pass   | approval-card.actions + agent-permission-card tests. Web passes `planShowLess` / `planShowMore` / `downloadPlan`. Keys exist in en+zh.                                                                                      |
| S4       | pass   | `terminal-chrome-i18n.test.ts`. `rg` on `TerminalChrome.tsx` finds no hardcoded Connecting/Reconnecting/Disconnected/Search terminal.                                                                                       |
| S5       | pass   | quality-030-friday-i18n.test.ts. zh `appshot.lib.protocol.promptBody` is Chinese and keeps `{timestamp}`, `~/.atmos/appshots/records/{timestamp}/`, `metadata.json`, `context.md`, `snapshot.png`.                          |
| S6       | pass   | `delete-project-dialog-i18n.test.ts`. Title is `t("title", { projectName })` under `project.deleteProjectDialog`.                                                                                                           |
| S7       | pass   | APP-079 TECH `## Known non-goals (QUALITY-030)`; APP-079 TEST non-coverage; APP-081 TECH/TEST cite QUALITY-030. No RN mermaid renderer files.                                                                               |
| S8       | pass   | shared + web + mobile `token-usage-model-icon` bun tests. Both adapters import `resolveTokenUsageModelIconRef` from `@atmos/shared`.                                                                                        |
| S9       | pass   | `package.json` lint script still `oxlint --max-warnings=455`. Full run exit 0 with 431 warnings.                                                                                                                            |

Commands:

```bash
bun test \
  apps/mobile/src/features/token-usage/model-icon.test.ts \
  apps/mobile/src/features/terminal/TerminalBuiltinKeyboard.test.ts \
  apps/web/src/features/agent/components/__tests__/agent-permission-card.test.ts \
  apps/web/src/app-shell/__tests__/token-usage-model-icon.test.ts \
  apps/web/src/features/terminal/components/__tests__/terminal-chrome-i18n.test.ts \
  apps/web/src/features/project/components/__tests__/delete-project-dialog-i18n.test.ts \
  packages/ui/src/components/ai-elements/mermaid-diagram.test.ts \
  packages/ui/src/components/ui/approval-card.actions.test.ts \
  apps/web/src/features/agent/components/__tests__/agent-part-view.test.ts \
  packages/shared/src/utils/token-usage-model-icon.test.ts \
  apps/web/src/shared/__tests__/quality-030-friday-i18n.test.ts
# 56 pass, 0 fail, 313 expect()

bun run --filter @atmos/shared typecheck
bun run --filter @workspace/ui typecheck
bun run --filter web typecheck
bun run --filter @atmos/mobile typecheck
bunx oxlint --max-warnings=455
```

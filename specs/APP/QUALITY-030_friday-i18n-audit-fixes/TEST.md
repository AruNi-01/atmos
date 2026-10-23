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

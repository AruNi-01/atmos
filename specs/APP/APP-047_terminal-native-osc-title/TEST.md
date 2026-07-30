# APP-047 · Terminal Native OSC Title — TEST

> Verification contract for native OSC 0/2 pane title suffixes.

---

## Test strategy

| Level | Why |
|-------|-----|
| **Unit (shared)** | Pure composition / sanitize / agent-invariance rules — fast, deterministic |
| **Unit (web)** | Existing terminal-title tests extended; toolbar composition with customLabel |
| **Manual / agent-browser** | Real CLI OSC emission through xterm (Codex/Claude) |

No new E2E required for v1; composition is pure and capture is a thin xterm subscription.

## Coverage map

| PRD | Scenarios |
|-----|-----------|
| M1 Capture | S1 |
| M2 Append | S2, S3 |
| M3 Agent unchanged | S4 |
| M4 Custom suppresses | S5 |
| M5 Clear rules | S6, S7 |
| M6 Display-only | S8 (code inspection / no layout field) |
| M7 Sanitize | S9 |
| S1 Cap | S10 |

## Execution map

| Id | Level | Tool | Target | Status |
|----|-------|------|--------|--------|
| S1–S10 | unit | bun test | `apps/web/src/features/terminal/components/__tests__/terminal-title.test.ts` | pass |
| M-smoke | manual | run agent in pane | web terminal | pending |

## Scenarios

### S1 · Sanitize empty / controls
- **Given** raw OSC payloads with BEL/esc/whitespace
- **When** `sanitizeNativeOscTitle` runs
- **Then** controls stripped; empty → `""`
- **Signals**: unit assert

### S2 · Append with separator
- **Given** auto title `Claude Code`, osc `debugging auth`
- **When** `getTerminalDisplayMeta({..., oscTitle})`
- **Then** `displayTitle === "Claude Code | debugging auth"`
- **Signals**: unit assert

### S3 · OSC-only when auto empty
- **Given** empty base/dynamic, osc `session topic`
- **Then** `displayTitle === "session topic"`

### S4 · Agent not derived from OSC
- **Given** base `1`, dynamic `codex`, agent codex; osc text looks like another agent label e.g. `Hermes Agent`
- **Then** `toolbarAgent` still codex (or matched from dynamic), **not** hermes
- **Signals**: unit assert

### S5 · Custom label suppresses OSC
- **Given** `suppressOscTitle: true` or custom composition path
- **Then** display does not contain ` | ${osc}`

### S6 · Empty OSC clears suffix
- **Given** prior osc title, then empty OSC
- **Then** display returns to auto only

### S7 · CMD_END clears (integration contract)
- **Given** Terminal CMD_END handler
- **Then** calls `onOscTitleChange(undefined)` (code review / unit of handler if extracted)

### S8 · Not persisted
- **Given** layout save helpers
- **Then** `oscTitle` never written into persisted tab/pane document

### S9 · Control injection safe
- **Given** osc containing `\x1b]0;evil`
- **Then** controls stripped; no multi-line title

### S10 · Length cap
- **Given** very long osc string
- **Then** sanitized length ≤ 64 chars

## Acceptance criteria

- [x] Unit tests for S2–S5, S9–S10 green
- [x] Web Terminal wires `onTitleChange` (shim) and `onOscTitleChange` (native) separately
- [x] Custom pane rename hides OSC suffix (composition `suppressOscTitle`)
- [ ] Manual: agent OSC appears as `|` suffix; agent icon stable

## Non-coverage

- Backend reattach replaying last OSC (agents re-assert)
- Tab bar customTitle interaction beyond pane toolbar
- Playwright multi-agent live sessions

## Coverage Status

- **2026-07-30**: Unit suite green — `bun test apps/web/src/features/terminal/components/__tests__/terminal-title.test.ts` (23 pass), covering sanitize/cap, append `|`, agent-invariance, suppress-on-custom, clear-on-empty.
- **Remaining**: Manual smoke with Codex/Claude in a web pane (OSC suffix visible, icon stable, custom rename hides suffix, CMD_END clears).
- **Layout**: `oscTitle` is not part of persisted layout document types (display-only, same class as `dynamicTitle`).

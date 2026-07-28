# TEST · APP-046: Terminal TUI Mouse Tracking

> Verification contract for [PRD.md](./PRD.md) / [TECH.md](./TECH.md).

---

## 1. Test strategy

| Level | Target | Why |
|-------|--------|-----|
| Rust unit | `MouseModeState` parse / persist / resolve | Deterministic CSI + policy — core risk |
| Bun unit | shared snapshot restore payload + sequence preference | Client contract for web/mobile |
| Manual / dogfood | Claude / Grok hover after reattach | End-to-end in real TUI; hard to automate without agent harness |
| agent-browser | optional smoke only | Cannot drive in-TUI hover protocol easily |

## 2. Coverage map (PRD → scenarios)

| PRD | Scenario |
|-----|----------|
| M1 Hover + click alt-screen | S-PARSE-1, S-DEFAULT-1, S-MANUAL-1 |
| M2 Exact restore when observed | S-PARSE-2, S-RESOLVE-1, S-SNAP-1 |
| M3 Unobserved fallback + 1003 | S-RESOLVE-2, S-DEFAULT-1 |
| M4 Grok inline | S-RESOLVE-3, S-MANUAL-2 |
| M5 No false enable | S-RESOLVE-4, S-SNAP-2 |
| M6 Observed disable | S-RESOLVE-5 |
| M7 Shell-agnostic | (design; no shell-specific code path) |
| M8 Shared restore contract | S-SNAP-1, S-SNAP-3 |

## 3. Execution map

| ID | Level | Tool | Target | Signals | Status |
|----|-------|------|--------|---------|--------|
| S-PARSE-1 | Rust | `cargo test -p core-engine` | `parses_sgr_any_event_chain` | event=Any, format=Sgr, sequence has 1003 | covered |
| S-PARSE-2 | Rust | `cargo test -p core-engine` | `button_only_without_hover` | restore has no 1003 | covered |
| S-PARSE-3 | Rust | `cargo test -p core-engine` | `disable_clears_event`, `later_1002_downgrades_from_any` | none / Button after 1002 | covered |
| S-RESOLVE-1 | Rust | `cargo test -p core-engine` | `resolve_prefers_observed_exact_sequence` | exact button+sgr sequence | covered |
| S-RESOLVE-2 | Rust | `cargo test -p core-engine` | `resolve_unobserved_uses_heuristic_with_hover` | default contains 1003 | covered |
| S-RESOLVE-3 | Rust | `cargo test -p core-engine` | same + `grok-*` cmd | restore true without alternate | covered |
| S-RESOLVE-4 | Rust | `cargo test -p core-engine` | unobserved + zsh / non-alt | restore false | covered |
| S-RESOLVE-5 | Rust | `cargo test -p core-engine` | `resolve_observed_none_skips_even_on_alternate` | restore false | covered |
| S-DEFAULT-1 | Bun | `bun test packages/shared/src/terminal/snapshot.test.ts` | ENABLE includes 1003 order | 1002 then 1003 then 1006 | covered |
| S-SNAP-1 | Bun | same | prefers `mouse_tracking_sequence` | exact suffix, no forced 1003 | covered |
| S-SNAP-2 | Bun | same | idle shell skip | no ENABLE in payload | covered |
| S-SNAP-3 | Bun | same | flag-only fallback | full ENABLE with 1003 | covered |
| S-MANUAL-1 | Manual | dogfood | Claude in web terminal | hover + click after refresh | planned (dogfood) |
| S-MANUAL-2 | Manual | dogfood | Grok Build TUI | hover + click after reattach | planned (dogfood) |

## 4. Scenarios

### S-PARSE-1 — any + sgr chain
- **Given** bytes `\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h`
- **When** `observe_bytes`
- **Then** event=Any, format=Sgr; `restore_sequence` ends with 1003 then 1006

### S-PARSE-2 — button without hover
- **Given** 1000+1002+1006 only
- **Then** event=Button; restore sequence does **not** include 1003

### S-RESOLVE-1 — observed exact
- **Given** observed Button+Sgr, alternate=true
- **Then** restore=true and sequence matches button restore (no 1003)

### S-RESOLVE-2 — unobserved alternate
- **Given** observed=None, alternate=true
- **Then** default sequence including 1003

### S-RESOLVE-5 — observed none on alt-screen
- **Given** observed inactive, alternate=true
- **Then** restore=false

### S-SNAP-1 — client prefers exact sequence
- **Given** snapshot with `mouse_tracking_sequence` = button-only
- **When** `buildTerminalSnapshotRestorePayload`
- **Then** payload ends with that exact sequence

### S-MANUAL-1 — Claude reattach
- **Given** Claude running in Atmos web terminal
- **When** hover rows/menus, then hard refresh, hover again
- **Then** highlight/popover works before and after refresh

## 5. Exploratory agent-browser checks

Limited value for in-TUI protocol. Optional:

- Confirm terminal still focuses and accepts keyboard after reattach.
- Confirm no console errors on `terminal_attached` with new snapshot fields.

Prefer S-MANUAL-1/2 for mouse product signal.

## 6. Regression checklist

- [ ] Idle shell: wheel scrollback still works
- [ ] `npm run dev` / non-mouse process: wheel not stolen without observed mouse modes
- [ ] Grok CMD_START path does not reintroduce DRAG-only ENABLE (must include 1003)
- [ ] Mobile restore helper still builds from shared snapshot (no separate incomplete sequence)

## 7. Acceptance criteria

- All S-PARSE / S-RESOLVE / S-DEFAULT / S-SNAP rows in the execution map are green via the listed commands.
- Manual dogfood S-MANUAL-1 (or S-MANUAL-2) confirms hover after reattach at least once before calling the feature done for a release.

## 8. Non-coverage

- Automated Playwright driving Claude’s internal hover UI.
- Stress test of mouse-move WS bandwidth under 1003.
- N3 product toggle.

## 9. Coverage Status

| Date | Result |
|------|--------|
| 2026-07-28 | **partial** — unit coverage complete; manual dogfood pending |

**Commands run**

```bash
cargo test -p core-engine mouse_modes
# 10 passed

bun test packages/shared/src/terminal/snapshot.test.ts
# 10 passed

cargo check -p core-service -p api
# ok
```

**Remaining gaps**

- S-MANUAL-1 / S-MANUAL-2 dogfood (Claude / Grok hover after browser refresh).

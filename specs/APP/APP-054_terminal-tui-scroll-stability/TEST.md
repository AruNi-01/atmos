# TEST · APP-054: Terminal TUI Scroll Stability

> Verification contract for [PRD.md](./PRD.md) / [TECH.md](./TECH.md).

---

## 1. Test strategy

| Level | Target | Why |
|-------|--------|-----|
| Rust unit | Cross-chunk observe, restore resolve | Deterministic CSI + policy |
| Bun unit | Shared snapshot restore | Client contract |
| Bun unit | Wheel distance → report count | Pure mapping, no DOM flakiness |
| Structural | Terminal.tsx CMD_END gating | Disable not unconditional |
| Manual dogfood | Reattach mid-TUI | Optional when environment available |

## 2. Coverage map (PRD → scenarios)

| PRD | Scenario |
|-----|----------|
| M1 Cross-chunk | S-CHUNK-1, S-CHUNK-2 |
| M2 Inactive does not suppress alt/inline | S-RESOLVE-STALE-1, S-RESOLVE-STALE-2 |
| M3 No false enable | S-RESOLVE-IDLE-1 |
| M4 CMD_END gate | S-STRUCT-CMDEND-1 |
| M5 Hydrate restore | S-SNAP-1 (shared) |
| M6 Wheel multi-report | S-WHEEL-1, S-WHEEL-2 |
| M7 Mouse off path | S-WHEEL-3 |
| M8 Tests green | Execution map |

## 3. Execution map

| ID | Level | Tool | Target | Signals | Status |
|----|-------|------|--------|---------|--------|
| S-CHUNK-1 | Rust | `cargo test -p core-engine` | multi-chunk enable | event=Any after split CSI | covered |
| S-CHUNK-2 | Rust | same | multi-chunk disable | inactive after split disable | covered |
| S-RESOLVE-STALE-1 | Rust | same | inactive + alternate | restore true + default seq | covered |
| S-RESOLVE-STALE-2 | Rust | same | inactive + grok-* | restore true | covered |
| S-RESOLVE-IDLE-1 | Rust | same | inactive + zsh non-alt | restore false | covered |
| S-SNAP-1 | Bun | `bun test packages/shared/src/terminal/snapshot.test.ts` | restore payload | existing + green | covered |
| S-WHEEL-1 | Bun | `bun test` wheel module | pixel distance | reports ≥ 1 and scale with delta | covered |
| S-WHEEL-2 | Bun | same | fractional accumulate | second event can emit carried rows | covered |
| S-WHEEL-3 | Bun | same | inactive mapping not used | handler path leaves local scroll (unit: report helpers only when active) | covered |
| S-STRUCT-CMDEND-1 | Static | read Terminal.tsx | CMD_END | disable gated on non-alternate | covered |

## 4. Scenarios

### S-CHUNK-1 — enable split across chunks
- **Given** empty observer
- **When** chunk1 = `ESC[?1000;1002` and chunk2 = `;1003;1006h`
- **Then** event=Any, format=Sgr
- **Signals:** unit assert on state

### S-CHUNK-2 — disable split across chunks
- **Given** active Any+Sgr
- **When** disable params split across two chunks ending in `l`
- **Then** not active
- **Signals:** unit assert

### S-RESOLVE-STALE-1 — inactive observation + alternate
- **Given** observed inactive, alternate=true, cmd=`vim`
- **When** resolve
- **Then** restore true with default sequence containing `1003`
- **Signals:** unit assert

### S-RESOLVE-IDLE-1 — inactive + idle shell
- **Given** observed inactive, alternate=false, cmd=`zsh`
- **When** resolve
- **Then** restore false
- **Signals:** unit assert

### S-WHEEL-1 — distance maps to reports
- **Given** cellHeight=16, deltaY=48 (pixel mode)
- **When** resolve report count
- **Then** reports == 3 (or ≥2 after compression policy if documented)
- **Signals:** unit assert against shipped helper

### S-STRUCT-CMDEND-1
- **Given** Terminal OSC 9999 handler source
- **When** inspect CMD_END branch
- **Then** DISABLE is not written unconditionally; alternate check present
- **Signals:** static read / optional structural test

## 5. Regression checklist

- [ ] Idle shell wheel scrollback works
- [ ] Non-mouse process without observed modes keeps scrollback
- [ ] Alt-screen TUI after reattach receives wheel as app input (dogfood or structural restore)
- [ ] Inline mouse TUI whitelist still restores without alt
- [ ] Shared ENABLE sequence still ends with 1003 before 1006

## 6. Acceptance criteria

- All S-CHUNK / S-RESOLVE / S-SNAP / S-WHEEL rows green via listed commands.
- S-STRUCT-CMDEND-1 satisfied by code review / static check.
- No third-party product names introduced in this spec tree or new terminal mouse/scroll comments for this work.

## 7. Coverage Status

| Date | Commands | Result |
|------|----------|--------|
| 2026-08-05 | `cargo test -p core-engine mouse` | 17 passed (cross-chunk observe, stale-none restore, idle shell skip) |
| 2026-08-05 | `cargo test -p core-service mouse_mode` | 3 passed (watch key/session/registry) |
| 2026-08-05 | `bun test` snapshot + tui-mouse-wheel + terminal-input-coalesce | 23 passed |
| 2026-08-05 | Structural: CMD_END gated; wheel multi-report; `atmos-tui-mouse-active` CSS; input coalesce; detached watch on close | ok |
| 2026-08-05 | Reattach race root fix: inject uses OSC **9998** (title-only disable path); shell keeps 9999; `title-osc` unit tests | covered |

Execution map status: S-CHUNK-1/2, S-RESOLVE-*, S-SNAP-1, S-WHEEL-*, S-STRUCT-CMDEND-1 → **covered**.

Manual dogfood (reattach mid-TUI wheel): **not_run** in this environment (no interactive agent TUI harness); unit + structural gates accepted per TECH.

Shipped beyond A-tier:
- Detached pane mouse-mode watch (N1)
- Scrollbar hide while mouse tracking active (N2)
- Input coalesce + interactive output fast path (N4)

Remaining out of scope:
- Desktop local hop / UDS (N3) — known architecture debt: [docs/architecture/known-debt-client-transport.md](../../../docs/architecture/known-debt-client-transport.md)

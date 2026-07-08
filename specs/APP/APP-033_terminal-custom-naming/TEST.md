# APP-033 · Terminal Custom Naming — TEST

> Verification contract for [PRD.md](./PRD.md) / [TECH.md](./TECH.md). Persistence rides the existing terminal layout document, so most logic is deterministic and unit-testable; refresh restore + menu UX are covered by agent-browser / manual smoke until an E2E harness exists.

---

## 1. Test strategy

| Level | Target | Why |
|-------|--------|-----|
| Bun unit | `use-terminal-toolbar-title` display composition, store normalization, layout serialize/hydrate round-trip | Deterministic precedence + persistence logic — the core risk. |
| Bun unit | `terminal-layout-document` migrate/normalize keeps `customTitle` / pane custom fields | Guards the serialization choke point (TECH §4, §9). |
| agent-browser (exploratory) | Rename menus, empty-clear, toggles, refresh restore in the running web app | UX + cross-refresh wiring not yet covered by scripted E2E. |
| Manual | Split/scoped pane rename, fixed `Term` tab rename | Twin-component + fixed-tab edge cases. |

## 2. Coverage map (PRD Must Haves → scenarios)

| PRD | Scenario |
|-----|----------|
| M1 Tab rename entry | S-TAB-1 |
| M2 Pane rename entry | S-PANE-1 |
| M3 Custom name priority | S-TAB-2, S-PANE-2 |
| M4 Empty clears | S-CLEAR-1 |
| M5 Pane toggles | S-TOGGLE-1, S-TOGGLE-2, S-TOGGLE-3 |
| M6 Persistence across refresh | S-PERSIST-1 |
| M7 Display-only (tmux untouched) | S-IDENTITY-1 |
| S1 Normalization | S-NORM-1 |

## 3. Execution map

| ID | Level | Tool | Target | Signals | Status |
|----|-------|------|--------|---------|--------|
| S-PANE-2 | Bun unit | `bun test` | `use-terminal-toolbar-title` composition | `displayTitle` starts with custom name; `toolbarAgent` undefined when `keepAgentName` off | planned |
| S-TOGGLE-1 | Bun unit | `bun test` | hook with `keepAgentName` default (undefined) + detected agent | displayTitle = `custom + agent.label`; `toolbarAgent` defined (icon shows); CWD absent even if `keepCwd` on | planned |
| S-TOGGLE-2 | Bun unit | `bun test` | hook with `keepCwd` default + path-like dynamicTitle + **no** agent | displayTitle appends `shortenPath(cwd)`; no agent suffix | planned |
| S-TOGGLE-3 | Bun unit | `bun test` | hook with `keepAgentName=false` + detected agent + `keepCwd` on | agent hidden; CWD suffix shown instead (fallback) | planned |
| S-CLEAR-1 | Bun unit | `bun test` | hook with `customLabel=""` | falls back to `getTerminalDisplayMeta` output | planned |
| S-NORM-1 | Bun unit | `bun test` | `setPaneCustomLabel` / `setTabCustomTitle` normalize | trims, collapses whitespace, caps 40, `""`→undefined | planned |
| S-PERSIST-1 | Bun unit | `bun test` | `buildPersistedTerminalWorkspaceLayout` → `parseTerminalLayoutDocument` → `hydratePersistedTab` | `customLabel`/`keepAgentName`/`keepCwd`/`customTitle` survive round-trip | planned |
| S-IDENTITY-1 | Bun unit | `bun test` | serialize a pane with `customLabel` set | persisted `label` + `tmuxWindowName` unchanged by rename | planned |
| S-TAB-1 / S-TAB-2 | agent-browser + manual | `just dev-web` + agent-browser | tab context menu | Rename Tab visible; tab shows custom name; fixed `Term` tab renamable | planned |
| S-PANE-1 | agent-browser + manual | `just dev-web` + agent-browser | pane grid menu | Rename Title visible; pane toolbar shows custom name | planned |
| S-REFRESH (UI) | agent-browser | reload page | custom names + toggles restored after refresh | planned |

## 4. Scenarios

### S-PANE-2 — custom name replaces auto label when toggles off
- Given a pane with detected agent `claude` and dynamicTitle `.../src/api`, `keepAgentName=false`, `keepCwd=false`.
- When `customLabel = "Backend"`.
- Then `displayTitle === "Backend"` and `toolbarAgent === undefined`.
- Signals: returned `displayTitle`, `toolbarAgent`.

### S-TOGGLE-1 — default keeps agent, suppresses CWD
- Given the S-PANE-2 pane with `keepAgentName` and `keepCwd` at their defaults (undefined = on) and a detected agent.
- Then `displayTitle` begins with `"Backend"` and contains the agent label; `toolbarAgent` is defined (icon renders); the CWD is NOT appended (agent wins).

### S-TOGGLE-2 — CWD shown when no agent
- Given `customLabel="Backend"`, defaults on, dynamicTitle `/Users/x/proj/src/api`, **no** detected agent.
- Then `displayTitle` begins with `"Backend"` and ends with `.../src/api`; no agent suffix.

### S-TOGGLE-3 — opt out of agent falls back to CWD
- Given `customLabel="Backend"`, `keepAgentName=false`, `keepCwd=true`, a detected agent, and dynamicTitle `/Users/x/proj/src/api`.
- Then the agent suffix is hidden and `displayTitle` ends with `.../src/api`.

### S-CLEAR-1 — empty clears override
- Given a pane with `customLabel="Backend"`.
- When saved with `""`.
- Then `customLabel` becomes undefined and `displayTitle` equals the pure `getTerminalDisplayMeta` result.

### S-PERSIST-1 — round-trip persistence
- Given a workspace with a renamed tab (`customTitle`) and a renamed pane (`customLabel` + `keepAgentName=true`).
- When the layout is serialized then parsed + hydrated.
- Then all four custom fields are equal to their pre-serialize values.
- Signals: hydrated tab/pane objects.

### S-IDENTITY-1 — display only
- Given a pane with `tmuxWindowName="2"`, `label="2"`.
- When `customLabel="Deploy"` is set and serialized.
- Then persisted `label==="2"` and `tmuxWindowName==="2"` (custom name only in `customLabel`).

### S-NORM-1 — normalization
- `"  My   Pane  "` → `"My Pane"`; a 60-char string → capped at 40; `"   "` → cleared.

## 5. Exploratory agent-browser checks

Run against `just dev-web`. Load the Agent Browser skill / `agent-browser skills get core --full` first.

- Right-click a terminal tab → **Rename Tab** → type → Enter; confirm the tab label updates and the fixed `Term` tab is also renamable.
- Right-click a pane → **Rename Title** → type → confirm toolbar shows the custom name first, and (defaults on) the agent icon+label appears after it, or the CWD when no agent is present.
- Confirm **Keep Agent Name** and **Keep CWD** are checked by default in the rename input; toggle **Keep Agent Name** off → confirm agent hides and CWD (if any) appears; confirm agent and CWD are never shown together.
- Clear a name (save empty) → confirm revert to auto name.
- Reload the page → confirm tab name, pane name, and toggle states are restored.
- Watch for console/network errors during rename + save.

## 6. Regression checklist

- Auto tab/pane titles unchanged when no custom name is set.
- tmux attach/reconnect still works after rename (window name preserved).
- Pane split/close and tab dedup (`getUniqueTerminalTabTitle`) unaffected.
- Existing (pre-feature) persisted layouts load without error (fields undefined).

## 7. Acceptance criteria

- All planned Bun unit scenarios pass via `bun test`.
- agent-browser refresh-restore check passes: names + toggles persist across reload.
- No regression in the checklist above.

## 8. Non-coverage

- Project Wiki / Code Review scoped panes (out of scope, PRD §3 Won't have).
- Playwright E2E: deferred until the terminal-grid E2E harness exists; tracked as a gap here.

## 9. Coverage Status

_To be appended after implementation and `atmos-specs-test-run` (exact test files, `bun test` command, agent-browser results, remaining gaps)._

# APP-047 · Terminal Native OSC Title — TECH

> **HOW.** Capture xterm native titles (OSC 0/2), store per-pane `oscTitle`, compose with `|` after the existing auto title; never use OSC for agent detection; suppress when `customLabel` is set.

Related: [PRD](./PRD.md), [APP-003](../APP-003_web-terminal-dynamic-title/TECH.md), [APP-033](../APP-033_terminal-custom-naming/TECH.md).

---

## 1. Architecture

```
Agent / CLI  ──OSC 0/2──►  PTY stream  ──►  xterm.js
                                              │
                                              ├─ onTitleChange(title)  →  setOscTitle / clear
                                              │
Atmos shim   ──OSC 9999──►  registerOscHandler(9999)
                                              │
                                              ├─ CMD_START → setDynamicTitle (+ agent resolve)
                                              └─ CMD_END   → setDynamicTitle(cwd) + clear oscTitle

getTerminalDisplayMeta({ dynamicTitle, agent, oscTitle, suppressOscTitle })
        │
        ├─ toolbarAgent  ← only dynamicTitle / agent / baseTitle
        └─ displayTitle  ← auto  [ | oscTitle ]  unless suppress / custom
```

No backend changes. No new WebSocket messages.

## 2. Shared helpers (`packages/shared/src/terminal/title.ts`)

### 2.1 Sanitize + cap

```ts
const MAX_NATIVE_OSC_TITLE_CHARS = 64;

export function sanitizeNativeOscTitle(title: string | undefined): string {
  // strip controls, collapse whitespace, truncate to MAX_NATIVE_OSC_TITLE_CHARS
  // empty → ""
}
```

### 2.2 Display filter

Before appending, `resolveDisplayOscTitle(osc, { autoDisplayTitle, dynamicTitle, toolbarAgent })` drops:

| Filter | Example | Reason |
|--------|---------|--------|
| Shell host/cwd | `user@Host:~/…`, pure paths | Redundant with shim path; causes prompt flicker |
| Agent CLI / brand | `claude`, `Claude Code`, `codex` | Toolbar already shows agent icon + label |
| Equals dynamic title | OSC == `CMD_START` command | Same signal twice |

Helpers: `isNoisyShellOscTitle`, `isRedundantAgentOscTitle`.

### 2.2b Display filter (post-ship refinement)

Before appending, `resolveDisplayOscTitle(osc, { autoDisplayTitle, dynamicTitle, toolbarAgent })` drops:

| Filter | Example | Reason |
|--------|---------|--------|
| Shell host/cwd | `user@Host:~/…`, pure paths | Redundant with shim path; causes prompt flicker |
| Agent CLI / brand | `claude`, `Claude Code`, `codex` | Toolbar already shows agent icon + label |
| Equals dynamic title | OSC == `CMD_START` command | Same signal twice |

Helpers: `isNoisyShellOscTitle`, `isRedundantAgentOscTitle`.

### 2.3 Compose

Extend `getTerminalDisplayMeta`:

```ts
export function getTerminalDisplayMeta(options: {
  baseTitle: string | undefined;
  dynamicTitle: string | undefined;
  configuredAgents?: TAgent[];
  agent?: TAgent;
  contestedOwners?: ContestedOwnersMap;
  /** Native OSC 0/2 title (already sanitized or raw; helper re-sanitizes). */
  oscTitle?: string;
  /** User customLabel set — never append OSC. */
  suppressOscTitle?: boolean;
}): { displayTitle: string; toolbarAgent: TAgent | undefined }
```

Algorithm:

1. Compute existing `autoDisplay` + `toolbarAgent` exactly as today (ignore `oscTitle`).
2. `const osc = suppressOscTitle ? "" : sanitizeNativeOscTitle(oscTitle)`.
3. If `osc` empty → return auto.
4. Else `displayTitle = autoDisplay ? `${autoDisplay} | ${osc}` : osc`.
5. `toolbarAgent` unchanged.

Export `appendNativeOscTitle(autoDisplay, oscTitle, suppress?)` for call sites that already have a pre-composed custom string (APP-033 custom path will pass `suppress: true` and never call with osc).

## 3. Capture (`Terminal.tsx` + mobile DOM view)

### 3.1 New prop

```ts
/** Native OSC 0/2 title from the process (Codex/Claude/…). Undefined clears. */
onOscTitleChange?: (title: string | undefined) => void;
```

Keep `onTitleChange` for **shim-only** dynamic titles (OSC 9999).

### 3.2 xterm wiring

After creating the terminal:

```ts
terminal.onTitleChange((raw) => {
  const next = sanitizeNativeOscTitle(raw);
  onOscTitleChangeRef.current?.(next || undefined);
});
```

On OSC 9999 `CMD_END` (after updating dynamic title):

```ts
onOscTitleChangeRef.current?.(undefined);
```

Do **not** clear on `CMD_START` (agent may set OSC after start; clearing would flash).

## 4. Store

### 4.1 Pane field

```ts
// TerminalPaneProps
/** Transient native OSC title; not persisted. */
oscTitle?: string;
```

### 4.2 Actions

```ts
setOscTitle(workspaceId, paneId, oscTitle: string | undefined, terminalTabId?)
// Optional scoped mirrors if wiki/code-review already mirror setDynamicTitle
```

- Compare sanitized equality before `set`.
- Never call `saveToBackend`.
- Layout document mapping already omits `dynamicTitle`; keep `oscTitle` out of persistence the same way (do not add to `Persisted*` types).

### 4.3 Lookups

`getWorkspacePaneFieldsByPaneId` / `getWorkspacePaneLiveFieldsByTmuxWindow` also return `oscTitle`.

## 5. Toolbar merge (`use-terminal-toolbar-title.ts`)

- Subscribe to `storeLive.oscTitle`.
- Local state `localOscTitle` for canvas/`none` write targets (same pattern as dynamic).
- `onOscTitleChange` writes store `setOscTitle` when `storeWrite` is mosaic/tmux; never calls `setPaneAgent`.
- `getTerminalDisplayMeta({ ..., oscTitle: mergedOsc, suppressOscTitle: !!customLabel?.trim() })`.
- Custom label branch: keep existing ` · ` agent/cwd composition; **do not** append OSC.

## 6. Other call sites

| Site | Change |
|------|--------|
| `terminal-mosaic-scoped-pane-window` | Wire `onOscTitleChange` + pass `oscTitle` into meta |
| `use-terminal-grid-canvas-pins` | Pass `pane.oscTitle` into meta when labeling pin |
| `terminal-close-confirm-name` | Optional: omit OSC (confirm dialogs stay short) — **no OSC** |
| Mobile `TerminalDomView` / store | Same capture + field if low cost |

## 7. Rollout

1. Shared sanitize + meta compose + unit tests.
2. Web Terminal capture + store + toolbar hook.
3. Scoped panes + canvas pin labels.
4. Mobile parity if the same xterm path exists.
5. Manual smoke with Codex/Claude: suffix appears, agent icon stable, custom name hides suffix, exit clears.

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Noisy OSC (version-only titles, spinners) | Cap length; user can set customLabel to suppress; accept spinner chars as agent intent |
| OSC fights with document title | Only consume via xterm event; do not write `document.title` |
| Stale OSC after agent crash without CMD_END | Empty OSC clear; next CMD_END; pane remount resets state |
| Agent detection false positives from OSC text | Hard rule: never pass `oscTitle` into `resolveAgentForTitle` |

## 9. Out of scope (tech)

- tmux window rename from OSC
- Persisted layout schema
- Backend inject of OSC (reattach recovery of agent titles relies on agent re-asserting after attach)

# Document scripts & exec (on-demand)

Load this file only when the user wants **durable interaction**, games, animation,
run-on-open behavior, or one-shot **exec** — not for ordinary diagrams.

Durable interaction lives on the open document’s `script` field (`main.js` and optional siblings). One-shot probes use `exec`.

| Concern | How |
|---------|-----|
| Durable `main.js` | `atmos canvas script-put` → open document `script` field |
| Status | `atmos canvas script-status` |
| One-shot JS | `atmos canvas exec --code` / `--file` |
| Survives reopen | Yes, **after user Save** (or `doc-put` of full file) |
| Custom ShapeUtil / `config.js` | **Not shipped** — approximate with shapes + `main.js` |

---

## When to use which

| Need | Command | Survives reopen? |
|------|---------|------------------|
| Click / keyboard / game loop / “works after reopen” | `script-put` | Yes (after Save) |
| One probe or one-off mutation | `exec` | No (listeners die) |
| Static boxes and arrows | structured `create-*` only | Shapes after Save |

**Never** use only `exec` for behavior the user expects after closing Canvas.

---

## Prerequisites

1. Canvas open, bridge **enabled**, `status` shows accepting client.  
2. **Capabilities check** — required:

```bash
atmos canvas status
# bridge.clients[].capabilities must include "document-scripts.1" (and "exec.1" for exec).
# If you only see ["canvas.v1"], the open tab is a STALE frontend: script/exec will fail
# with UNSUPPORTED_COMMAND or the agent should refuse. User must run this branch's web
# (just dev-web / rebuild desktop sidecar), open Canvas, re-enable bridge.
```

3. `script-get` first if a script may already exist — **extend, do not clobber**.  
4. After `script-put`, remind user to **Save** if the board is dirty / Untitled.

```bash
atmos canvas status
atmos canvas script-get
```

---

## Script contract

```js
/**
 * @param {{ editor: object, helpers: object, signal: AbortSignal }} ctx
 */
export default function ({ editor, helpers, signal }) {
  // mount
  signal.addEventListener('abort', () => {
    // clear intervals, editor.off(...)
  })
}
```

Async default export is allowed. On `script-put` or document switch the host **aborts** the previous run — always honor `signal`.

### `helpers`

| Helper | Role |
|--------|------|
| `createShapeId` / `toRichText` | Ids + rich text labels |
| `createShapeIfMissing(partial)` | Stable furniture; returns `{ id, created }` |
| `createShapesIfMissing(partials)` | Batch furniture |
| `translateShapes(ids, dx, dy)` | Move without undo spam |
| `onShapeTranslate(id, ({dx,dy}) => …, { signal })` | Follow user-dragged anchor |
| `createArrowBetweenShapes(fromId, toId, opts?)` | Bound arrow |
| `getLints()` | `{ lints }` |
| `richTextToPlainText(rt)` | Button label hit-tests |
| `isAtmosChromeShape(shape)` | Skip terminal/widget |
| **`claimInputScope(opts)`** | **Focus a play surface: capture keys, lock shapes, avoid tldraw nudge** |
| `hasActiveInputScope()` | Whether keyboard is currently claimed |

### Input scope (games / keyboard) — required for snake-like boards

**Problem without scope:** Space/arrows go to tldraw (nudge selection, tools). Clicking Start selects the button; arrow keys then move the button, not the snake.

**Why a bare `window` keydown is not enough:** SelectTool nudges only after the
editor **container** hears `keydown` (`useDocumentEvents`) and
`editor.dispatch({ type: 'keyboard', name: 'key_down' })`. A bubble-phase
listener with only `preventDefault` runs **after** that path — the game and
the nudge both fire. Capture on `window` + `stopPropagation` for game keys
stops the event before the container.

**Fix:** use `helpers.claimInputScope` (platform helper). It installs capture-phase
handlers, calls `editor.markEventAsHandled(e)`, clears selection, switches to
hand tool, and can lock furniture shapes.

**Pattern:** claim keys for the interactive surface (prefer on script mount for
game boards so idle arrows also don't nudge furniture), lock furniture, handle
keys in `onKeyDown`:

```js
export default function ({ editor, helpers, signal }) {
  let scope = null
  const boardId = /* shape:snake-board frame id */

  function claimKeys() {
    scope?.release()
    scope = helpers.claimInputScope({
      surfaceId: boardId,
      lockShapeIds: [boardId, /* start button, walls, labels… */],
      signal,
      // optional: releaseOnOutsidePointer: false for always-on game keys
      onKeyDown(e) {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { /* turn up */ }
        // …
      },
    })
  }

  claimKeys() // claim on mount, not only after Start
  // Click Start label → startGame() still works; keys already isolated
  // Escape (default) releases scope so normal canvas tools work again
  signal.addEventListener('abort', () => scope?.release())
}
```

| Scope behavior | Effect |
|----------------|--------|
| Claim | Clears selection, switches to **hand** tool, locks listed shapes, **window capture-phase** keydown |
| Capture keys (default) | Arrows, WASD, Space, Enter, Escape |
| Blocks editor tools | `preventDefault` + `stopPropagation` + `stopImmediatePropagation` + `editor.markEventAsHandled` + drops leaked `key_down` via `dispatch` guard |
| Escape / click outside frame | Release scope — no global permanent hijack (disable with `releaseOnOutsidePointer: false`) |
| Only one active scope | New claim releases the previous (multiple frames don't fight) |

**Do not** listen only on `window` without capture / without `claimInputScope` — you will fight selection nudge.
**Do not** leave a permanent bare global keydown — use scope + `signal` abort.

Prefer helpers + `editor.*`. Do not assume `import('tldraw')` works inside the script host.

**Do not** delete `canvas-terminal` / `canvas-widget` shapes from scripts.

---

## Minimal toggle example

```bash
atmos canvas apply --commands '[
  {"command":"create_geo","args":{"kind":"rectangle","w":160,"h":48,"text":"Toggle","x":100,"y":100,"color":"light-blue","fill":"semi"}},
  {"command":"create_geo","args":{"kind":"rectangle","w":240,"h":48,"text":"State: off","x":100,"y":180,"color":"grey","fill":"semi"}}
]'

cat > /tmp/canvas-toggle.js <<'EOF'
export default function ({ editor, helpers, signal }) {
  let on = false
  function plain(shape) {
    return helpers.richTextToPlainText(shape.props?.richText)
  }
  function bounds(shape) {
    return { x: shape.x, y: shape.y, w: shape.props.w ?? 0, h: shape.props.h ?? 0 }
  }
  function contains(box, p) {
    return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h
  }
  function handle(info) {
    if (info?.name !== 'pointer_down') return
    const point = editor.inputs?.currentPagePoint
    if (!point) return
    const shapes = editor.getCurrentPageShapes()
    const btn = shapes.find((s) => plain(s) === 'Toggle' && contains(bounds(s), point))
    if (!btn) return
    on = !on
    const label = shapes.find((s) => String(plain(s)).startsWith('State:'))
    if (!label) return
    editor.run(() => {
      editor.updateShape({
        id: label.id,
        type: label.type,
        props: { ...label.props, richText: helpers.toRichText(on ? 'State: on' : 'State: off') },
      })
    }, { history: 'ignore' })
  }
  editor.on('event', handle)
  signal.addEventListener('abort', () => editor.off('event', handle))
}
EOF

atmos canvas script-put --file /tmp/canvas-toggle.js
atmos canvas script-status
# Tell user to Save the Canvas document so script persists in .atmos.tldr
```

---

## Persistence reminder

`script-put` updates the **open editor session** and runs the host immediately.  
The `.atmos.tldr` on disk updates when the user **Saves** (or you rewrite via `doc-put` with a full envelope including `script`).

---

## Not available

- `script/config.js` custom `ShapeUtil` / `OverlayUtil` / tools  
- Disk `script-workspace` directory watcher (use CLI + document field)  

Approximate new “shape types” with geo/note + script behavior.

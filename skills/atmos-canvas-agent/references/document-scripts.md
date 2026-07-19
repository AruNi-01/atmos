# Document scripts & exec (on-demand)

Load this file only when the user wants **durable interaction** on the canvas
(clickable UI, keyboard-driven boards, animation, run-on-open behavior) or
one-shot **exec** — not for ordinary static diagrams.

Durable interaction lives on the open document’s `script` field (`main.js` and
optional siblings). One-shot probes use `exec`.

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
| Click / keyboard / loop / “works after reopen” | `script-put` | Yes (after Save) |
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
    // clear intervals, editor.off(...), release input scope if any
  })
}
```

Async default export is allowed. On `script-put` or document switch the host
**aborts** the previous run — always honor `signal`.

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
| `richTextToPlainText(rt)` | Label hit-tests |
| `isAtmosChromeShape(shape)` | Skip product chrome (terminal / widget) |
| **`claimInputScope(opts)`** | **Platform keyboard ownership for a surface** |
| `hasActiveInputScope()` | Whether keyboard is currently claimed |

Prefer helpers + `editor.*`. Do not assume `import('tldraw')` works inside the
script host.

---

## Interactive systems — general rules

Treat any durable scripted UI as an **interactive system**: a bounded region of
shapes plus optional input and timers. Applies to dashboards, controls, demos,
simulations, tools, and similar — not only entertainment.

### 1. Own a surface (frame)

**Rule:** Scripted interactive content lives inside a **tldraw `frame`** (stable
id). Child shapes use `parentId: surfaceId`.

| Why | Effect |
|-----|--------|
| Bounds | Click-outside and hit-tests have a clear region |
| Grouping | Move / lock / lint / screenshots treat the system as one unit |
| Input scope | `claimInputScope({ surfaceId })` needs a surface to attach to |
| Separation | System is not mixed with free page clutter or product chrome |

**Do not** leave interactive furniture as free-floating page shapes when the
system is meant to be one product (controls + content + labels that belong
together).

Stable ids via `helpers.createShapeId('…')` + `createShapeIfMissing` so reruns
do not duplicate furniture.

Place the surface in **agent-view** page space. Keep it **off** existing
`canvas-terminal` / `canvas-widget` chrome (especially the terminal running the
Agent).

### 2. Own input correctly

| Input kind | Rule |
|------------|------|
| **Pointer only** (buttons, toggles, hit-tests) | `editor.on('event', …)` + page-space hit-test is enough |
| **Keyboard** (arrows, WASD, Space, hotkeys, shortcuts) | **Must** use `helpers.claimInputScope` — no bare `window` / container listeners |
| **Both** | Frame surface + `claimInputScope` for keys + pointer handlers for clicks |

#### Keyboard ownership (`claimInputScope`)

Bare `window.addEventListener('keydown')` is **too late** for tldraw: SelectTool
already nudges selection. It also **steals** keys from Agent chat and terminals.

**Platform API only** for script keyboard:

```js
const scope = helpers.claimInputScope({
  surfaceId,                    // frame id, used for outside-click release
  signal,
  captureKeys: [/* optional; defaults cover arrows/WASD/Space/Enter/Escape */],
  onKeyDown(e) { /* handle e.code / e.key */ },
  onKeyUp(e) { /* optional */ },
})
// claim when the system should own keys (often on mount, or when user activates it)
// scope.release() on deactivate / signal abort
```

Platform behavior:

- Capture-phase handling, `markEventAsHandled`, blocks editor nudge tools  
- Does not change tldraw's selected shapes, active tool, locks, or pointer behavior
- **Does not** steal keys while focus is in xterm, Agent chat, or form fields  
- Escape / click outside surface can release (configurable)  
- One active scope per editor  

**Forbidden** for keyboard:

- `window` / `document` / editor-container keydown **without** `claimInputScope`  
- `focus()` / `tabindex` / “steal focus from terminal” hacks  
- Treating `canvas-terminal` or Agent chat as the script’s input target  
- Leaving a permanent global keydown after the system should be idle  

### 3. Respect product chrome

- **Never** delete or repurpose `canvas-terminal` / `canvas-widget`.  
- Use `helpers.isAtmosChromeShape(shape)` to skip chrome in hit-tests and layout.  
- Scripts run on the **document canvas**, not inside the Agent’s terminal process.
  Terminal keystrokes are for the shell/agent; canvas input scope is for the surface.

### 4. Lifecycle

- Honor `signal` abort: clear timers, `editor.off`, `scope.release()`.  
- Script-owned motion / per-frame updates: `editor.run(fn, { history: 'ignore' })`
  or `helpers.translateShapes`.  
- Prefer mount-time setup + event/tick loops over rewriting all shapes every save.

### 5. Capability matrix (quick)

| System needs | Layout | Input |
|--------------|--------|--------|
| Static diagram | No script | CLI `create-*` only |
| Click controls only | Prefer frame + children | `editor.on('event')` |
| Keyboard shortcuts / continuous control | **Frame required** | **`claimInputScope` required** |
| Animation / simulation | Frame or anchored furniture | tick / interval + `history: 'ignore'` |
| Follow user-dragged piece | Stable anchor id | `onShapeTranslate` |

---

## Skeleton (generic interactive surface)

```js
export default function ({ editor, helpers, signal }) {
  const surfaceId = helpers.createShapeId('ui-surface')
  const panelId = helpers.createShapeId('ui-panel')
  const actionId = helpers.createShapeId('ui-action')

  helpers.createShapeIfMissing({
    id: surfaceId,
    type: 'frame',
    x: 80,
    y: 80,
    props: { w: 480, h: 360, name: 'Interactive' },
  })

  helpers.createShapesIfMissing([
    {
      id: panelId,
      type: 'geo',
      parentId: surfaceId,
      x: 16,
      y: 40,
      props: {
        geo: 'rectangle',
        w: 440,
        h: 240,
        color: 'grey',
        fill: 'semi',
        richText: helpers.toRichText(''),
      },
    },
    {
      id: actionId,
      type: 'geo',
      parentId: surfaceId,
      x: 16,
      y: 300,
      props: {
        geo: 'rectangle',
        w: 140,
        h: 40,
        color: 'light-blue',
        fill: 'solid',
        richText: helpers.toRichText('Action'),
      },
    },
  ])

  let scope = null

  function activateInput() {
    // Only if this system uses keyboard. Click-only UIs can skip claimInputScope.
    scope?.release?.()
    scope = helpers.claimInputScope({
      surfaceId,
      signal,
      onKeyDown(e) {
        // handle shortcuts for this surface only
      },
    })
  }

  function onPointer(info) {
    if (info?.name !== 'pointer_down') return
    const point = editor.inputs?.currentPagePoint
    if (!point) return
    // hit-test children; on primary action, activateInput() if keyboard is needed
  }

  activateInput() // or only after user engages the surface
  editor.on('event', onPointer)
  signal.addEventListener('abort', () => {
    scope?.release?.()
    editor.off('event', onPointer)
  })
}
```

Optional CLI: `atmos canvas create-frame --w … --h … --title … --x … --y …` then
script uses the same stable ids via `createShapeIfMissing`.

---

## Minimal pointer-only example

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
# Tell user to Save so script persists in .atmos.tldr
```

If this UI later needs keyboard, **add a frame surface and `claimInputScope`** —
do not bolt on a global keydown.

---

## Persistence reminder

`script-put` updates the **open editor session** and runs the host immediately.  
The `.atmos.tldr` on disk updates when the user **Saves** (or you rewrite via
`doc-put` with a full envelope including `script`).

---

## Not available

- `script/config.js` custom `ShapeUtil` / `OverlayUtil` / tools  
- Disk `script-workspace` directory watcher (use CLI + document field)  

Approximate new “shape types” with geo/note + script behavior.

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
    // clear intervals, editor.off(...), scope.release()
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
| **`claimInputScope(opts)`** | **Only allowed keyboard API for games** |
| `hasActiveInputScope()` | Whether keyboard is currently claimed |

---

## Games / keyboard boards — **mandatory layout**

Interactive games (snake, tetris, d-pad, arrow keys, Space to start) are **not** free-floating geoms on the page.

### Must

1. **Create one tldraw `frame` as the play surface** (stable id, e.g. `shape:snake-surface`).
2. **Put all interactive furniture inside that frame** (`parentId: surfaceId` on board, HUD, Start button, segments, food, walls).
3. **Call `helpers.claimInputScope` on mount** with `surfaceId` = that frame id (and lock furniture ids).
4. **Handle keys only in `claimInputScope({ onKeyDown })`** — never invent a second global key system.
5. Place the frame in **agent-view** space, **away from canvas-terminals** (do not cover the terminal that is running the Agent).

### Must not

| Anti-pattern | Why it fails |
|--------------|--------------|
| Loose geoms only, “no frames / page-space only” | No surface boundary; scope cannot isolate; user thinks keys are “for the terminal” |
| `window.addEventListener('keydown', …)` without `claimInputScope` | Fights SelectTool nudge **and** steals keys from Agent chat / xterm |
| `focusCanvas()` / `container.focus()` / `tabindex` hacks | Does not own keyboard vs terminal; re-focuses wrong surface |
| Binding keys to `canvas-terminal` or assuming terminal has focus | Terminal is chrome (`isAtmosChromeShape`); games must not own it |
| Claiming keys only after Start click and never on mount | Pre-start arrows still nudge shapes |
| Deleting `canvas-terminal` / `canvas-widget` | Chrome shapes are product UI |

### Why a frame

- **Surface bounds** for `claimInputScope({ surfaceId })` (click outside → release keys).
- **Parenting** groups the game so move/lock/lint treat it as one unit.
- **Clear ownership**: keys are for the frame’s game, not the terminal where the Agent runs.

### Canonical game skeleton

```js
export default function ({ editor, helpers, signal }) {
  const surfaceId = helpers.createShapeId('game-surface')
  const boardId = helpers.createShapeId('game-board')
  const startId = helpers.createShapeId('game-start')
  // … more stable ids

  // 1) Frame first
  helpers.createShapeIfMissing({
    id: surfaceId,
    type: 'frame',
    x: 80,
    y: 80,
    props: { w: 520, h: 420, name: 'Snake' },
  })

  // 2) All interactive shapes parented under the frame (local coords inside frame)
  helpers.createShapesIfMissing([
    {
      id: boardId,
      type: 'geo',
      parentId: surfaceId,
      x: 16,
      y: 40,
      props: {
        geo: 'rectangle',
        w: 480,
        h: 320,
        color: 'grey',
        fill: 'solid',
        richText: helpers.toRichText(''),
      },
    },
    {
      id: startId,
      type: 'geo',
      parentId: surfaceId,
      x: 16,
      y: 370,
      props: {
        geo: 'rectangle',
        w: 120,
        h: 36,
        color: 'green',
        fill: 'solid',
        richText: helpers.toRichText('▶ Start'),
      },
    },
  ])

  let scope = null
  function claimKeys() {
    scope?.release?.()
    scope = helpers.claimInputScope({
      surfaceId,
      lockShapeIds: [surfaceId, boardId, startId /* + HUD labels */],
      signal,
      // keep keys while playing; Escape still releases by default
      releaseOnOutsidePointer: true,
      onKeyDown(e) {
        // ONLY place that reads Arrow*/WASD/Space for the game
        if (e.code === 'ArrowUp' || e.code === 'KeyW') { /* turn */ }
        // …
      },
    })
  }

  claimKeys() // on mount — do not wait for Start

  // pointer: Start button hit-test in page space; then start game loop
  // segments/food: create with parentId: surfaceId, history: 'ignore'

  signal.addEventListener('abort', () => {
    scope?.release?.()
    // clear intervals, editor.off(...)
  })
}
```

Optional CLI bootstrap before `script-put`:

```bash
# Draw the frame shell in the agent view (script will createShapeIfMissing the same stable ids)
atmos canvas create-frame --w 520 --h 420 --title Snake --x 80 --y 80
atmos canvas set-agent-view --x 40 --y 40 --w 640 --h 520
```

Prefer **stable ids in the script** via `helpers.createShapeId('…')` so reruns do not duplicate furniture.

### Input scope behavior (platform)

| Scope behavior | Effect |
|----------------|--------|
| Claim | Clears selection, **hand** tool, locks listed shapes, **window capture-phase** keydown |
| Capture keys (default) | Arrows, WASD, Space, Enter, Escape |
| Blocks editor tools | `preventDefault` + stopPropagation + `markEventAsHandled` + dispatch guard |
| Skips terminal / inputs | Does **not** steal keys while focus is in xterm, Agent chat, or form fields |
| Escape / click outside frame | Releases scope |
| Only one active scope | New claim releases the previous |

**Do not** listen only on `window` without `claimInputScope`.  
**Do not** reimplement focus stealing.

Prefer helpers + `editor.*`. Do not assume `import('tldraw')` works inside the script host.

**Do not** delete `canvas-terminal` / `canvas-widget` shapes from scripts.

---

## Minimal toggle example (non-game click UI)

Click-only boards (no arrows) may use loose geoms + `editor.on('event')`.  
**If the board needs keyboard, upgrade to the frame + `claimInputScope` pattern above.**

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

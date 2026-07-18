# Document scripts & exec (on-demand)

Load this file only when the user wants **durable interaction**, games, animation,
run-on-open behavior, or one-shot **exec** — not for ordinary diagrams.

Atmos equivalent of tldraw offline **script-workspace** + **`/exec`**.

---

## Offline ↔ Atmos map

| tldraw offline | Atmos |
|----------------|--------|
| `script/main.js` + watcher | `atmos canvas script-put` → open document `script` field |
| `script-status` | `atmos canvas script-status` |
| `/api/doc/:id/exec` | `atmos canvas exec --code` / `--file` |
| Durable after reopen | Yes, **after user Save** (or `doc-put` of full file) |
| `config.js` ShapeUtil | **Not shipped** — approximate with shapes + `main.js` |

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

Prefer helpers + `editor.*`. Do not assume `import('tldraw')` works inside the script host.

**Do not** delete `canvas-terminal` / `canvas-widget` shapes from scripts.

---

## CLI

| Verb | Args | Notes |
|------|------|-------|
| `script-get` | — | Script + status |
| `script-status` | — | `idle` \| `running` \| `error` \| `stopped` |
| `script-put` | `--file main.js` or `--code '…'` `[--entry main.js]` | Install + run now |
| `script-clear` | — | Remove script + stop |
| `exec` | `--code` or `--file` | One-shot; `editor` + `helpers` in scope |

```bash
atmos canvas script-put --file /tmp/canvas-main.js
atmos canvas script-status
# expect state: "running" (or read error)

atmos canvas exec --code 'return editor.getCurrentPageShapes().length'
```

Multi-file: current CLI uploads one entry file. Prefer a **single `main.js`** unless you build a full `files` map via lower-level invoke JSON.

---

## Patterns (offline recipes)

### Clickable button UI

1. Furniture geo with stable text labels (`create-geo` or `createShapeIfMissing`).  
2. `editor.on('event', …)` on `pointer_down`.  
3. Hit-test `editor.inputs.currentPagePoint` vs shape bounds.  
4. Keep state in props/meta so `get-state` can verify.  
5. Cleanup on `signal` abort.

### Animation / simulation

1. Physics state in **script locals**.  
2. Render with `helpers.translateShapes` or `editor.run(fn, { history: 'ignore' })`.  
3. `editor.on('tick')` or `setInterval` — clear on abort.  
4. Do not store every substep only in shape props if it fights undo/perf.

### Editable furniture + anchored pieces

1. `createShapeIfMissing` for user-movable board.  
2. `onShapeTranslate(boardId, ({ dx, dy }) => helpers.translateShapes(pieces, dx, dy), { signal })`.  
3. Never delete+recreate furniture on every rerun.

### Connection-dependent logic

Use real arrow bindings (`createArrowBetweenShapes` or CLI `--from-id/--to-id`).  
Do not treat “near” as connected.

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

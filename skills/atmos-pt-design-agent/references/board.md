# Board operations (on-demand)

Coordinates, frames, layout, lint, screenshot, batch. Default page workflow stays in the parent `SKILL.md`.

---

## Coordinates

| Value | Space |
|-------|--------|
| `pt_place.at` **with** `frameId` | Relative to that frame's origin |
| `below` / `rightOf` | Scene position of the anchor; inherits the anchor's frame if `frameId` is omitted |
| IR `bbox`, `pt_update.bbox` | Scene-absolute (copy from `pt_ir_get`) |

Inset content 24–64px from the frame edge. Do not add `frame.x` yourself when `frameId` is set.

---

## Frames

```json
{ "tool": "pt_frame_create", "args": { "name": "Desktop", "preset": "desktop" } }
```

| Preset | Size |
|--------|------|
| `desktop` | 1440×1024 |
| `tablet` | 768×1024 |
| `mobile` | 390×844 |

Override `w` / `h` after a preset for a taller landing. `x` / `y` default to 0.

| Tool | Notes |
|------|--------|
| `pt_frame_update` | Move/resize; children move with the origin |
| `pt_frame_delete` | Deletes instances too; `orphan: true` leaves them free |
| `pt_frames_list` | id, name, bbox |

Empty scratch frames should be deleted, not left as `_scratch_*`.

---

## Place

```json
{
  "tool": "pt_place",
  "args": {
    "componentType": "card",
    "frameId": "<id>",
    "at": { "x": 64, "y": 24 },
    "props": { "title": "Feature" }
  }
}
```

Relative:

```json
{ "tool": "pt_place", "args": { "componentType": "button", "below": { "instanceId": "<id>", "gap": 16 } } }
{ "tool": "pt_place", "args": { "componentType": "badge", "rightOf": "<id>" } }
```

`below` and `rightOf` cannot both be set. Default gap 16.

Place returns `{ instanceId, instanceIds, bbox, warnings[] }`.

Warnings: `OUTSIDE_FRAME`, `OVERLAP`, `PROP_IGNORED`, `TEXT_CLIP`.

---

## Layout

Operate on existing instances. Order is the `instanceIds` array.

| Tool | Args |
|------|------|
| `pt_layout_row` | `instanceIds`, `gap?` (16), `align?` start\|center\|end |
| `pt_layout_column` | same |
| `pt_layout_grid` | `instanceIds`, `columns` ≥ 1, `gap?` (24), `rowGap?` |

Then `pt_lint`.

---

## Lint

`pt_lint` / `{ "frameId" }` returns `{ issues, count }`.

| Code | Meaning |
|------|---------|
| `OVERLAP` | Two instances intersect |
| `OUTSIDE_FRAME` | Node not contained in its frame |
| `FREE_NODE` | Not in a frame |
| `EMPTY_FRAME` | Frame has no instances |
| `TEXT_CLIP` | Title/label likely wider than the box |

Fix with `pt_update.bbox` (scene coords) or layout tools.

---

## Screenshot

Live tab only.

```json
{ "tool": "pt_screenshot", "args": { "frameId": "<id>", "maxEdge": 1024 } }
```

Also `instanceIds` to crop to those instances. Returns `dataUrl` (`image/png`), `width`, `height`, `bbox`. Prefer IR for structure; screenshot for spacing/overlap you cannot see in IR.

---

## Batch

```json
{
  "tool": "pt_batch",
  "args": {
    "atomic": true,
    "ops": [
      { "tool": "pt_place", "args": { "componentType": "button", "frameId": "<id>", "at": { "x": 64, "y": 24 } } }
    ]
  }
}
```

Default `atomic: true` rolls the scene back if any op fails. Max 200 ops. Do not nest `pt_batch`. Do not put `pt_screenshot` or `pt_doc_*` inside a batch.

---

## Update / delete

`pt_update`: `instanceId` plus any of `props`, `variant`, `size`, `bbox` `{x,y,w,h}`, `frameId` (reparent).

`pt_delete`: `instanceId` or `instanceIds`.

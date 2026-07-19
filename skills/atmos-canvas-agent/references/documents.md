# Local canvas documents (on-demand)

Load when the user cares about **named boards**, listing files, rename/delete/duplicate,
or backup — not required for a single “draw this diagram” turn on the open board.

---

## Location

| | |
|--|--|
| Directory | `~/.atmos/canvas/` |
| Extension | `.atmos.tldr` |
| Truth | File contents (not DB) |
| Multi-page | Many tldraw **pages** inside **one** file |

Envelope (simplified):

```json
{
  "schema": "atmos-canvas-file.1",
  "title": "Ops Desk",
  "tldrawDocument": { },
  "session": { },
  "script": { "entry": "main.js", "files": { "main.js": "…" } }
}
```

`script` is optional. See [`document-scripts.md`](document-scripts.md) for interactive boards.

---

## CLI (REST — bridge not required)

| Verb | Args |
|------|------|
| `docs` | — list + `dir` |
| `doc-get` | `--file` |
| `doc-put` | `--file` `--from <json path>` |
| `doc-delete` | `--file` `--confirm` |
| `doc-rename` | `--file` `--name` |
| `doc-duplicate` | `--file` `[--name]` |
| `doc-sanitize` | `--name` → preview `.atmos.tldr` name |

```bash
atmos canvas docs
atmos canvas status   # also includes documents.dir / items / active_document
```

`active_document` is set when a bridge-registered tab has a saved open file.

---

## Rules

- **Do not** edit `~/.atmos/canvas/*.atmos.tldr` while that board is open in Canvas (race with live editor).  
- Prefer live draw/script verbs on the open board; use `doc-*` for library management and closed-file rewrite.  
- UI: Documents control (top-right) for open / Save / Save As / rename / delete / duplicate / copy path.

---

## Minimal new file via API

Prefer UI Save As for the first named board. For agents writing a closed file:

```bash
atmos canvas doc-sanitize --name "Ops Desk"
# then doc-put with a valid atmos-canvas-file.1 JSON
```

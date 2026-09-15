# Board operations (on-demand)

Live board vs file, screenshot. Default PTX edit loop stays in the parent `SKILL.md`.

---

## Live board

The open Prototype Design tab. Agents `POST /api/pt-design/agent/invoke`.

- `pt_ptx_get` extracts pretty XML from the Excalidraw scene.
- `pt_ptx_apply` projects the **complete** PTX back onto the scene (one undo step in Edit Mode).
- Do not send Excalidraw JSON. Do not start MCP for this tab.

---

## Screenshot

```json
{ "tool": "pt_screenshot", "args": { "nodeIds": ["run"], "maxEdge": 1024 } }
```

Open tab only. `nodeIds` is optional (whole board when omitted).

---

## Offline file

CLI/MCP `--file` points at a `.ptd` directory (or `document.ptx` inside it). That file is **not** a live copy of the open tab.

```bash
pt-design doc init --file ./app.ptd --json
pt-design ptx get --file ./app.ptd --json
pt-design ptx apply --ptx '<page id="p">…</page>' --file ./app.ptd --json
```

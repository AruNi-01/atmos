---
name: atmos-md-live-agent
version: "1.0.0"
description: "Edit the user's open Atmos Live markdown tab via POST /api/md-live/agent/invoke. Use md_live_get then md_live_replace_selection / md_live_insert / md_live_replace_document. Do not fs_write the Live document path. Do not scrape Terminal."
license: MIT
---

# Atmos Live markdown Agent

Operate the **open Live markdown tab** with HTTP invoke. Thoughts, tool traces, and replies stay in Agent Chat. **Only** these tools change the Live buffer.

```text
md_live_get → md_live_replace_selection | md_live_insert | md_live_replace_document
```

---

## Prerequisites

1. A Live-eligible `.md` file is open in Live. Opening the tab is enough.
2. `POST` the invoke URL from the copied prompt (loopback Atmos Server). Include `client_id` from that prompt when more than one Live tab is open.
3. Fresh `request_id` (UUID) on every call.

```json
{
  "request_id": "<uuid>",
  "tool": "md_live_get",
  "args": {},
  "client_id": "<from prompt>"
}
```

---

## Decision tree

| User intent                        | Tool                        |
| ---------------------------------- | --------------------------- |
| Read the open document / selection | `md_live_get`               |
| Rewrite or replace the selection   | `md_live_replace_selection` |
| Insert at the cursor               | `md_live_insert`            |
| Replace the whole document         | `md_live_replace_document`  |
| List tools                         | `md_live_tools_list`        |

---

## Default workflow

1. `md_live_get` — current path, full markdown, selection.
2. Edit in your head. Return markdown, not commentary, in the tool args.
3. `md_live_replace_selection` when there is a selection; `md_live_insert` at the cursor; `md_live_replace_document` only when the user asked for a full rewrite.
4. Reply in chat. Do not paste the new document into the chat unless the user asked to see it.

The host streams the tool payload into Live (Milkdown). Accept / Reject may appear on the streamed span. Chat stays the control surface.

---

## Anti-patterns

- `fs_write` / `Write` / shell redirect of `{document.path}` as the way to edit Live
- Scraping Terminal output into the document
- Returning an `<!--atmos-md-live-->` fence as the primary edit path
- Inventing other file paths to “save” the Live buffer

Full args and error codes: [`references/command-reference.md`](references/command-reference.md).

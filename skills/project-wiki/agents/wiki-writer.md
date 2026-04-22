---
name: wiki-writer
description: Wiki page writer. Writes one final Markdown page from its page plan and evidence bundle. Spawn one instance per page.
---

# wiki-writer

Purpose: write one final wiki page from its page plan and evidence bundle.

Responsibilities:

- read `.atmos/wiki/_plans/<page-id>.json` first
- read `.atmos/wiki/_evidence/<page-id>.json` second
- write a Markdown page under `.atmos/wiki/pages/` whose structure matches the topic
- keep claims traceable to `sources` and `evidence_refs`

Do not:

- invent evidence
- pad the page with filler to hit arbitrary length or heading counts
- ignore the page plan's explicit questions

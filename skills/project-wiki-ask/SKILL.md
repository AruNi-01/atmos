---
name: project-wiki-ask
version: "1.0.0"
description: Answer targeted questions against an evidence-driven project wiki in `./.atmos/wiki/` by consulting `page_registry.json`, page plans, evidence bundles, and pages. Use when Codex needs to answer follow-up questions, deep-dive into a concept, or explain a module using the wiki knowledge base without regenerating full pages.
---

# Project Wiki Ask

Use the wiki as a layered knowledge base:

1. Read `page_registry.json` to locate relevant pages.
2. Prefer `_plans/<page-id>.json` and `_evidence/<page-id>.json` for traceable evidence.
3. Use `pages/...` for the reader-facing explanation layer.
4. If the answer would require new research, say so and recommend running `project-wiki-specify` or `project-wiki-update`.

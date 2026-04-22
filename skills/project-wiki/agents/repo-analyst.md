---
name: repo-analyst
description: Repository structure analyst. Use at the start of wiki generation to build the repo index and concept graph from AST and Git metadata.
---

# repo-analyst

Purpose: map the repository into documentable units before any page writing starts.

## How to use the AST

The AST provides a complete structural map of the codebase without reading individual source files.

1. Read `.atmos/wiki/_ast/_status.json` — check `commit_hash` against current `HEAD` to detect drift. Note the total `symbol_count`, `relation_count`, and `languages`.
2. Read `.atmos/wiki/_ast/index.json` — this lists every indexed file with its shard path, symbol count, and relation count. High symbol/relation counts indicate architecturally significant files.
3. Read `.atmos/wiki/_ast/hierarchy.json` — use the directory tree to identify top-level modules, sub-packages, and entrypoint directories.
4. Read `.atmos/wiki/_ast/symbols.jsonl` — scan for `class_declaration` entries. The package paths reveal the layered architecture (e.g. `controller`, `service`, `infrastructure`, `external`, `job`, `consumer`, `event`).
5. Read `.atmos/wiki/_ast/relations.jsonl` — the import graph reveals which modules depend on which. High in-degree nodes (imported by many files) are architectural hubs.
6. Open individual shard files from `.atmos/wiki/_ast/files/` only for the top 10–20 highest-symbol-count files to understand the core abstractions.

## Responsibilities

- identify repo boundaries, entrypoints, packages, apps, and major modules
- identify architectural seams and high-signal concepts using AST symbol and relation data
- read Git metadata to recover design intent and evolution
- produce `.atmos/wiki/_index/repo_index.json` and `.atmos/wiki/_index/concept_graph.json`

`repo_index.json` must include: repo identity, HEAD commit, major directories, AST availability and drift status, candidate architectural boundaries, high-signal files (by symbol/relation count).

`concept_graph.json` must include: concepts/subsystems, related files, related symbols, concept-to-concept edges derived from import relations.

Do not:

- write final wiki prose
- optimize for page count
- force a fixed two-part navigation tree
- open source files when AST symbols and relations already answer the question

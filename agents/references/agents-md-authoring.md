# AGENTS.md Authoring Guide (Progressive Disclosure)

> **When to load**: Creating or editing any `AGENTS.md` / `Agents.md`, adding cross-cutting agent rules, or deciding whether a learning from a bug/feature should become durable agent docs.

> **Do not load** for ordinary product code with no documentation intent.

---

## Goals

1. **Small default context** — Agents should not load multi-page rules for every task.
2. **Deep rules on demand** — Full checklists and edge cases live under `agents/references/` (or a package-local deep doc), linked from short AGENTS files.
3. **Capture learnings without spam** — After shipping a non-obvious constraint, **ask the user** whether to document it in the right AGENTS/reference before adding long prose.

---

## Three layers

| Layer | Path | Holds | Length target |
|-------|------|--------|----------------|
| **Root navigation** | `/Agents.md` (or `AGENTS.md`) | Decision tree, monorepo map, short global rails, **links only** to deep refs | Prefer short; avoid pasting full how-tos |
| **Package / app contract** | `apps/*/AGENTS.md`, `packages/*/AGENTS.md`, `crates/*/AGENTS.md` | How to work **in that tree**: commands, layout, NEVER/ALWAYS, **pointers** to deep refs | One screen of dense rules when possible |
| **Deep reference** | `agents/references/**` | Topic playbooks: checklists, code paths, anti-patterns, verification | As long as needed; single topic per file |

`agents/AGENTS.md` is the **index** of deep references (when to load each file). It is not a dump of all rules.

---

## Progressive disclosure rules

### Root `Agents.md`

**Do**

- Point “I need to…” rows at package AGENTS or `agents/references/...`
- Keep 1–3 sentence global policies (e.g. WebSocket-first) with a link if the topic grows
- Add a **one-line** “when working on X, load Y” for high-traffic cross-cuts (keyboard, debug, desktop floating UI, AGENTS authoring)

**Do not**

- Paste full APP-NNN TECH content
- Duplicate package-specific build commands already in package AGENTS
- Add every edge case discovered in one PR without user agreement

### Package / app `AGENTS.md`

**Do**

- Document **contracts** of that package (boundaries, entry points, forbidden imports)
- Link to `agents/references/<topic>.md` with a clear **When to load** sentence
- Keep NEVER/ALWAYS short and local

**Do not**

- Embed multi-page implementation histories
- Copy the entire monorepo tree again

### Deep references (`agents/references/`)

**Do**

- Start with `> **When to load**: ...` and `> **Do not load**: ...`
- Name real paths and symbols agents can open
- Prefer tables + checklists over essays
- Link specs (`specs/APP/...`) as source of product truth when applicable

**Do not**

- Mix unrelated topics in one file
- Rely on agents loading the whole `agents/` tree by default

---

## After a non-obvious change: ask before documenting

When implementation introduces a **recurring constraint** (something the next agent will miss and re-break), **do not silently dump long docs**. Instead:

1. **Summarize** the constraint in one short paragraph for the user.
2. **Ask** whether to:
   - add a **pointer** in the relevant package/root AGENTS, and/or
   - add or extend a **deep reference** under `agents/references/`, and/or
   - only leave it in the spec (`specs/...`) if it is product-scoped one-off.
3. **Only write** the agreed layer(s). Prefer pointer + deep ref over bloating root AGENTS.

### Good candidates to document

- Cross-layer stacking / process boundaries (e.g. desktop native preview vs host DOM)
- Security or trust boundaries
- Transport defaults (WS vs REST)
- Shared package import edges
- Test harness locations for a class of bugs

### Usually not worth a new AGENTS rule

- One-off bugfixes with no recurrence
- Purely local refactors
- Spec content that already lives fully in `TECH.md` and is not agent-facing day-to-day

### Suggested ask (copy-friendly)

> This change adds a non-obvious rule: **\<one sentence\>**.  
> Should I (a) only keep it in the spec, (b) add a short pointer in `\<package\>/AGENTS.md`, and/or (c) add/update `agents/references/\<topic\>.md` for progressive loading?

---

## Adding a new deep reference (checklist)

1. Create `agents/references/<topic>.md` (or a subdirectory topic with its own short index).
2. Put **When to load / Do not load** at the top.
3. Register the file in [agents/AGENTS.md](../AGENTS.md) Reference Files table.
4. Add a **one-line** link from root `Agents.md` **only if** the topic is commonly hit (keyboard, debug, floating UI, this authoring guide).
5. Add a **short pointer** from the package AGENTS that owns the code (e.g. desktop-electron, web, ui).
6. Avoid duplicating the full checklist in three places — **link** down.

---

## Editing existing AGENTS.md

| Situation | Action |
|-----------|--------|
| Rule already in a deep ref | Update the ref; keep package AGENTS as a link |
| Rule is package-local only | Edit package AGENTS only |
| Rule became monorepo-wide | Move body to `agents/references/`, leave pointers |
| Spec is the source of truth | Link to `specs/...`; AGENTS stays operational “how agents work here” |

---

## Anti-patterns

- **Everything in root AGENTS** → context bloat, agents skip reading
- **Everything only in chat/PR** → next agent reintroduces the bug
- **Copy-paste the same checklist** into web + desktop + ui AGENTS → drift
- **Silent long docs** after every PR without asking → noise and outdated prose

---

## Related

- Index: [agents/AGENTS.md](../AGENTS.md)
- Specs conventions: [specs/AGENTS.md](../../specs/AGENTS.md)
- Compact handoffs (not AGENTS authoring): [compact-instructions.md](./compact-instructions.md)

# Specs · AGENTS Guide

> Rules for humans and AI agents working inside `specs/`. Keep this short; link out for depth.

---

## 1. Zones

Pick exactly one based on what the feature ships to:

| Zone | Use when the feature lives in | Prefix |
|------|-------------------------------|--------|
| `APP/` | `apps/web`, `apps/desktop`, `apps/cli`, `apps/api`, shared `crates/` | `APP-NNN` |
| `Landing/` | `apps/landing` | `Landing-NNN` |
| `Docs/` | `apps/docs` | `Docs-NNN` |

If a feature spans multiple apps inside Atmos (e.g. web + desktop + api), it is still **APP**.

---

## 2. Naming

```
<ZONE>-NNN_kebab-case-title/
```

- `NNN`: zero-padded, monotonic within the zone (next available number).
- `kebab-case-title`: short and specific (`github-integration`, not `gh` or `github-integration-v2-final`).
- Never rename or renumber a published spec. Deprecate with a note inside its files instead.

### 2.1 Quality Specs

Use `specs/APP/QUALITY-NNN_kebab-case-title/` for repository-wide code quality work that is not a product feature, such as large-file reduction, architecture cleanup, dependency hygiene, lint/type debt, or cross-cutting refactors.

Conventions:

- `QUALITY-NNN` is monotonic within `specs/APP/QUALITY-*`.
- Quality specs must contain **`TECH.md` and `TEST.md`**. They may omit `BRAINSTORM.md` and `PRD.md` when the work is an engineering cleanup with no product-facing scope.
- `TECH.md` should record the quality target, audit command, affected areas, verification commands, risks, and follow-ups.
- `TEST.md` should record the regression gates and smoke tests needed to prove the cleanup did not affect product behavior.
- Do not use `QUALITY-*` for new user-visible functionality; use a normal `APP-NNN_*` spec with the four-file lifecycle.

---

## 3. The Four Files (always all four)

| File | Purpose | Typical length |
|------|---------|----------------|
| `BRAINSTORM.md` | Problem space, options, open questions | Short, iterative |
| `PRD.md` | **WHAT & WHY**: users, features, metrics, scope | Medium |
| `TECH.md` | **HOW**: architecture, data, APIs, rollout | Medium to long |
| `TEST.md` | Strategy, key scenarios, acceptance criteria | Short to medium |

Rules:

- **Never delete a file**, even if empty. Leave the template placeholder.
- Exception: `QUALITY-*` specs require `TECH.md` + `TEST.md`, but may omit `BRAINSTORM.md` and `PRD.md` (see §2.1).
- **Do not split a spec across directories.** Large `TECH.md` sections can use inline headings or sibling assets (e.g. `assets/`), not sub-specs.
- Cross-spec dependencies: link with relative paths, don't copy content.

### 3.1 Optional: `IMPROVEMENT.md` (operational log)

Some specs—especially long-lived integrations—benefit from a **fifth sibling file** that is **not** part of the planning quartet:

| File | Purpose |
|------|---------|
| `IMPROVEMENT.md` | **After ship**: incidents, parity gaps, mitigations, results, follow-ups |

**When to add**

- The feature is in production and you are iterating on **quality, crashes, or agent ergonomics** without changing the original PRD scope.
- You need a durable place to record “what broke → why → what we shipped → what’s left” (e.g. canvas agent vs [tldraw Agent starter kit](https://tldraw.dev/starter-kits/agent)).

**When not to add**

- The work is still in **BRAINSTORM / PRD / TECH** phase—use those files instead.
- The note is a one-line fix with no lesson worth keeping—use the git commit message only.

**Conventions**

- Lives **only** inside an existing spec directory: `specs/<ZONE>/<ZONE>-NNN_<title>/IMPROVEMENT.md`.
- Entries use ids **`IMP-NNN`** (per-file, monotonic), with status `open` | `mitigated` | `closed` | `wont-fix`.
- Keep an **index table** at the top; append new entries at the bottom (or in a dated section)—do not rewrite history.
- Link to `TECH.md` / `PRD.md` for baseline design; **do not duplicate** architecture already frozen there.
- If agent-facing behavior changes, note the **Skill / CLI version** in the entry (e.g. `skills/atmos-canvas-agent/SKILL.md`).

**Agent workflow**

1. Before changing canvas-agent (or similar) behavior, read `IMPROVEMENT.md` for the spec if it exists.
2. After shipping a fix, add or update an `IMP-NNN` entry (problem → root cause → solution → result → follow-ups).
3. Update related `TEST.md` acceptance only when the fix changes the formal definition of done.

**Reference implementation**: [APP-015 `IMPROVEMENT.md`](./APP/APP-015_canvas-terminal-agent-integration/IMPROVEMENT.md).

---

## 4. Lifecycle

```
BRAINSTORM  →  PRD  →  TECH  →  implement  →  TEST
   (open)     (what)   (how)     (code)     (verify)
                                    │
                                    └──► IMPROVEMENT.md (ongoing, post-ship)
```

Recommended flow:

1. Create the spec directory and fill `BRAINSTORM.md` while the idea is fuzzy.
2. Promote settled content into `PRD.md`. Leave open threads in `BRAINSTORM.md`.
3. Write `TECH.md` once scope is stable. Reference the PRD rather than restating it.
4. Write `TEST.md` alongside `TECH.md`; finalize acceptance before shipping.
5. After ship, prune obsolete sections but keep the spec; it is a historical record.
6. For production learnings and iterative fixes, append to `IMPROVEMENT.md` when the spec has one (see §3.1).

---

## 5. Creating a New Spec

```bash
# Pick the next number within the zone, e.g. APP-013
mkdir -p specs/APP/APP-013_my-feature
cp specs/APP/APP-012_remote-access/{BRAINSTORM,PRD,TECH,TEST}.md \
   specs/APP/APP-013_my-feature/
```

Then:

- Edit the title on line 1 of each copied file.
- Clear all placeholder `<!-- comments -->` and template sections that don't apply yet.
- Add an entry to the **Current Specs** table in [`README.md`](./README.md).

---

## 6. Writing Guidelines

- **Language**: English for all spec files (titles, headings, body). Inline Chinese quotes from source material are OK when needed.
- **Audience**:
  - `PRD.md` → product + engineering + stakeholders.
  - `TECH.md` → engineers implementing the change.
  - `BRAINSTORM.md` / `TEST.md` → working documents; less polish is fine.
- **Be concrete**: prefer tables, bullet lists, code/shell/bash blocks, and diagrams over prose.
- **Be minimal**: don't add sections you won't fill. It's better to delete template scaffolding than leave it empty forever.
- **No secrets**: never paste tokens, keys, or customer data into a spec.

### Diagrams (PRD vs TECH)

Prefer **Mermaid** fenced blocks in the Markdown file so GitHub / editors render them; use `specs/<ZONE>/<SPEC>/assets/` only when you need exported PNG/SVG from external tools.

| File | Include diagrams when they clarify… | Typical diagram types |
|------|-------------------------------------|------------------------|
| **`PRD.md`** | **Product behavior** — how users or operators move through the feature | **Business process** flows (activities / swimlanes), **state** diagrams for user-visible lifecycles (e.g. enrollment, pairing), decision flows for scope-critical branches |
| **`TECH.md`** | **Engineering design** — structure, protocols, and data | **Architecture** (components, deployment boundaries), **flowcharts** for pipelines or control logic, **sequence diagrams** for APIs / WS / cross-service calls, **ER diagrams** (or equivalent relational schema sketches) **whenever persistence / migrations matter** |

`BRAINSTORM.md` may use informal sketches optionally; `TEST.md` may reference TECH diagrams instead of duplicating them.

---

## 7. Relationship to Other Docs

| Location | Role |
|----------|------|
| `specs/` (this tree) | What we plan to build and how |
| `docs/` | Stable architecture, ADRs, reference material |
| `AGENTS.md` (repo root) | How agents work across the whole repo |
| Package-level `AGENTS.md` | Conventions inside a specific crate/app |

When something in `specs/` ships and stabilizes, migrate the enduring parts into `docs/`. Do not duplicate.

**After implementing APP specs**, align code-area guides with reality — e.g. [APP-016](../APP/APP-016_atmos-computer/TECH.md) → [crates/runtime-manager/AGENTS.md](../crates/runtime-manager/AGENTS.md), [packages/relay/AGENTS.md](../packages/relay/AGENTS.md), [apps/api/AGENTS.md](../apps/api/AGENTS.md).

---

## 8. Review Checklist (before merging a new spec)

- [ ] Correct zone and next available `NNN`.
- [ ] All four files present, titled, and non-duplicating the template.
- [ ] If the spec uses `IMPROVEMENT.md`, index table and entry template are present (§3.1).
- [ ] `README.md` **Current Specs** table updated.
- [ ] Links to related code / specs are relative and valid.
- [ ] No secrets, customer data, or internal URLs.
- [ ] PRD states scope *and* non-scope; includes **diagrams as needed** (business flows, user-visible states — see §6 Diagrams).
- [ ] TECH lists risks; includes **diagrams as needed** (architecture, flows, sequences, persistence ER/schema — see §6 Diagrams).
- [ ] TEST lists acceptance criteria.

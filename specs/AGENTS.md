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
- You need a durable place to record “what broke → why → what we shipped → what’s left”.

**When not to add**

- The work is still in **BRAINSTORM / PRD / TECH** phase—use those files instead.
- The note is a one-line fix with no lesson worth keeping—use the git commit message only.

**Conventions**

- Lives **only** inside an existing spec directory: `specs/<ZONE>/<ZONE>-NNN_<title>/IMPROVEMENT.md`.
- Entries use ids **`IMP-NNN`** (per-file, monotonic), with status `open` | `mitigated` | `closed` | `wont-fix`.
- Keep an **index table** at the top; append new entries at the bottom (or in a dated section)—do not rewrite history.
- Link to `TECH.md` / `PRD.md` for baseline design; **do not duplicate** architecture already frozen there.
- If agent-facing behavior changes, note the relevant **Skill / CLI / runtime version** in the entry.

**Agent workflow**

1. Before changing behavior for a shipped feature, read `IMPROVEMENT.md` for the spec if it exists.
2. After shipping a fix, add or update an `IMP-NNN` entry (problem → root cause → solution → result → follow-ups).
3. Update related `TEST.md` acceptance only when the fix changes the formal definition of done.

**Template**

When creating or refreshing an `IMPROVEMENT.md`, load the template on demand from [`references/improvement-template.md`](./references/improvement-template.md). Do not use a concrete spec file as the template.

### 3.2 Optional: `PROGRESS.md` (implementation handoff)

Some specs benefit from a tracked `PROGRESS.md` once implementation begins or is about to begin. It is **not** part of the planning quartet and is **not** a requirements source.

| File | Purpose |
|------|---------|
| `PROGRESS.md` | **During implementation**: current state, handoff notes, blockers, changed areas, and verification status |

**When to add**

- The implementation spans multiple layers such as `infra -> core-service -> apps/api -> apps/web`.
- Work is expected to cross multiple sessions, context compactions, agents, or owners.
- There is a non-trivial verification matrix or several manual checks.
- The feature is paused, blocked, or ready for handoff.
- A completed spec is about to move into implementation and needs an initial handoff checklist.

**When not to add**

- The spec is still actively changing in BRAINSTORM / PRD / TECH / TEST and there is no imminent implementation handoff.
- The work is small enough to finish in one session with a clear git diff.
- You only need a scratchpad for command output. Use terminal history or commit messages instead.

**Conventions**

- Lives only inside an existing spec directory: `specs/<ZONE>/<ZONE>-NNN_<title>/PROGRESS.md`.
- Use it for implementation facts only: what is done, what is next, what is blocked, what was verified.
- Do not duplicate PRD/TECH/TEST. If scope, architecture, or acceptance changes, update those files first and note the change in `PROGRESS.md`.
- Keep logs concise and sanitized. Do not paste long command output, secrets, tokens, customer data, private URLs, or full stack traces.
- When updating `Handoff Notes`, follow [`agents/references/compact-instructions.md`](../agents/references/compact-instructions.md). Write a continuation-oriented coding handoff, not a conversation recap.
- After ship, set `State: shipped`, add the final verification summary, and stop editing. Post-ship quality learning belongs in `IMPROVEMENT.md`.

**Template**

When creating or refreshing a `PROGRESS.md`, load the template on demand from [`references/progress-template.md`](./references/progress-template.md). Do not inline the template here.

### 3.3 Optional: `REVIEW.md` (implementation review fixes)

Some specs benefit from a tracked `REVIEW.md` after code implementation reaches review. It is **not** part of the planning quartet and is **not** a requirements source.

| File | Purpose |
|------|---------|
| `REVIEW.md` | **After implementation**: functional completeness, architecture, maintainability, testability, code size, and review-finding fix status |

**When to add**

- Code has been implemented and review finds functional or non-functional issues that should be fixed deliberately rather than lost in chat.
- The findings span multiple files, layers, or follow-up commits.
- The review is about implemented behavior, spec alignment, architecture, maintainability, testability, performance, security, or code quality.

**When not to add**

- The finding changes product requirements. Update `PRD.md` first.
- The finding changes the technical design contract. Update `TECH.md` first.
- The finding changes acceptance or coverage expectations. Update `TEST.md` first.
- The issue is a tiny code-review comment that is fixed immediately and needs no durable tracking.

**Conventions**

- Lives only inside an existing spec directory: `specs/<ZONE>/<ZONE>-NNN_<title>/REVIEW.md`.
- Entries use ids **`REV-NNN`** (per-file, monotonic), with status `open` | `in_progress` | `fixed` | `verified` | `wont-fix`.
- Keep an index table at the top; append or update entries without rewriting review history.
- Link to source files and exact line numbers when useful, but keep the file focused on review findings and fix status.
- `REVIEW.md` may reference `PROGRESS.md` for implementation handoff and `TEST.md` for verification, but should not duplicate either.

**Agent workflow**

1. After an implementation review, use the repo skill `atmos-specs-review` and create or update `REVIEW.md` when there are durable findings.
2. Before fixing review findings for a spec, read `REVIEW.md` first and update the relevant entry status as work progresses.
3. After a fix, record the code/doc areas touched and verification command in the entry's fix log.
4. Mark an entry `verified` only after the relevant automated or manual check has run.

**Template**

When creating or refreshing a `REVIEW.md`, load the template on demand from [`references/review-template.md`](./references/review-template.md). Do not inline the template here.

---

## 4. Lifecycle

```text
BRAINSTORM  →  PRD  →  TECH  →  TEST  →  implement  →  ship
   (open)     (what)   (how)   (verify)    (code)
                                      │          │
                                      │          ├──► PROGRESS.md (optional, during implementation)
                                      │          ├──► REVIEW.md (optional, after implementation review)
                                      │          └──► IMPROVEMENT.md (optional, post-ship)
```

Recommended flow:

1. Create the spec directory and fill `BRAINSTORM.md` while the idea is fuzzy.
2. Promote settled content into `PRD.md`. Leave open threads in `BRAINSTORM.md`.
3. Write `TECH.md` once scope is stable. Reference the PRD rather than restating it.
4. Write `TEST.md` alongside `TECH.md`; finalize acceptance before shipping.
5. When implementation begins or is about to begin, add `PROGRESS.md` only when handoff/progress tracking is useful (see §3.2).
6. After implementation review, add or update `REVIEW.md` when functional or non-functional findings need tracked fixes (see §3.3).
7. After ship, prune obsolete sections but keep the spec; it is a historical record.
8. For production learnings and iterative fixes, append to `IMPROVEMENT.md` when the spec has one (see §3.1).

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
- [ ] If the spec uses `PROGRESS.md`, it is concise, sanitized, and not a requirements source (§3.2).
- [ ] If the spec uses `REVIEW.md`, findings are actionable, statused, and tied to verification (§3.3).
- [ ] `README.md` **Current Specs** table updated.
- [ ] Links to related code / specs are relative and valid.
- [ ] No secrets, customer data, or internal URLs.
- [ ] PRD states scope *and* non-scope; includes **diagrams as needed** (business flows, user-visible states — see §6 Diagrams).
- [ ] TECH lists risks; includes **diagrams as needed** (architecture, flows, sequences, persistence ER/schema — see §6 Diagrams).
- [ ] TEST lists acceptance criteria.

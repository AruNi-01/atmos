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
- **Do not split a spec across directories.** Large `TECH.md` sections can use inline headings or sibling assets (e.g. `assets/`), not sub-specs.
- Cross-spec dependencies: link with relative paths, don't copy content.

---

## 4. Lifecycle

```
BRAINSTORM  →  PRD  →  TECH  →  implement  →  TEST
   (open)     (what)   (how)     (code)     (verify)
```

Recommended flow:

1. Create the spec directory and fill `BRAINSTORM.md` while the idea is fuzzy.
2. Promote settled content into `PRD.md`. Leave open threads in `BRAINSTORM.md`.
3. Write `TECH.md` once scope is stable. Reference the PRD rather than restating it.
4. Write `TEST.md` alongside `TECH.md`; finalize acceptance before shipping.
5. After ship, prune obsolete sections but keep the spec; it is a historical record.

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

---

## 7. Relationship to Other Docs

| Location | Role |
|----------|------|
| `specs/` (this tree) | What we plan to build and how |
| `docs/` | Stable architecture, ADRs, reference material |
| `AGENTS.md` (repo root) | How agents work across the whole repo |
| Package-level `AGENTS.md` | Conventions inside a specific crate/app |

When something in `specs/` ships and stabilizes, migrate the enduring parts into `docs/`. Do not duplicate.

---

## 8. Review Checklist (before merging a new spec)

- [ ] Correct zone and next available `NNN`.
- [ ] All four files present, titled, and non-duplicating the template.
- [ ] `README.md` **Current Specs** table updated.
- [ ] Links to related code / specs are relative and valid.
- [ ] No secrets, customer data, or internal URLs.
- [ ] PRD states scope *and* non-scope; TECH lists risks; TEST lists acceptance criteria.

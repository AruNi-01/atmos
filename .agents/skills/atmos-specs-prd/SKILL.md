---
name: atmos-specs-prd
description: Write or update the PRD (Product Requirements) for an Atmos spec at `specs/<ZONE>/<ZONE>-NNN_.../PRD.md`. Use whenever the user wants to lock in WHAT a feature is and WHY it matters — user stories, Must Have / Nice to Have, success metrics, explicit out-of-scope. Trigger when the user says "write a PRD", "产品文档", "需求文档", "定义范围", "user stories", mentions Must Have/Nice to Have, or asks to promote brainstorm output into a PRD. Focus strictly on user value and scope; leave HOW to the tech spec. Only touch `PRD.md`.
user-invokable: true
args:
  - name: spec_id
    description: Spec identifier, e.g. `APP-005` or `APP-005_github-integration`. Required — we should not be writing a PRD for a spec the user hasn't identified.
    required: true
---

# Atmos Specs · PRD

Turn a settled direction (from BRAINSTORM or a direct request) into a PRD that anyone on the team can read without having been in the original conversation.

## What this skill owns — and what it does not

- **Owns**: `PRD.md` in exactly one spec directory.
- **Does not own**: BRAINSTORM.md, TECH.md, TEST.md. Don't edit them here. Reference BRAINSTORM for context; leave TECH/TEST to their own skills.

Why: PRD is the contract between product intent and engineering execution. Mixing architecture in blurs that contract; mixing brainstorm uncertainty in makes the PRD unusable as a source of truth.

## Read these before you write

1. `specs/AGENTS.md` — conventions.
2. The spec's own `BRAINSTORM.md` if it has useful content — that's your primary input.
3. A reference PRD of similar scope: `specs/APP/APP-005_github-integration/PRD.md` (feature-scoped) or `specs/APP/APP-001_atmos-core/PRD.md` (product-scoped).
4. The repo root `AGENTS.md` if you need a reminder of what Atmos is (workspaces, tmux, ACP, WebSocket-first, local-first).

## Workflow

### 1. Resolve the spec path

`spec_id` is required. Accept `APP-005` or the full `APP-005_github-integration`. Resolve to `specs/APP/APP-005_<title>/PRD.md`. If the directory doesn't exist, stop and tell the user — creating new specs is the brainstorm skill's job.

### 2. Extract inputs

Pull as much as possible from the existing files before asking questions:

- Read `BRAINSTORM.md`. Promote material from its "Ready to promote" and "Options" sections. Pick the option(s) that the user (or BRAINSTORM) landed on.
- Skim existing `TECH.md` / `TEST.md` in case a previous revision already shipped and this PRD is a refinement.
- Check `specs/README.md` and nearby specs for related features that this should align with (e.g., APP-007 Wiki Incremental Update builds on APP-006 Project Wiki).

### 3. Ask only the gaps

Do not re-interview the user on things already in BRAINSTORM. Confirm, don't rerun. Target questions at the PRD shape:

- **Primary user**: which persona? Agentic Builder, workspace owner, reviewer, admin?
- **Trigger scenario**: what does the user try to do when they first hit this feature?
- **Success**: how will we know it worked? Usage? Completion rate? Qualitative quote?
- **Must Have vs Nice to Have**: where's the cut line for the first shippable version?
- **Non-scope**: what are users likely to expect that we are explicitly not doing?
- **Dependencies on other specs**: does this require APP-XXX first?

Ask in short batches. Don't block on every detail — if a question is borderline, make a reasonable assumption and flag it in the doc for review.

### 4. Write PRD.md

Use this structure. Keep it tight — a good feature PRD is 80–250 lines; a product-level PRD can be longer.

```markdown
# PRD · <ZONE>-NNN: <Title>

> Product Requirements · WHAT and WHY. Settled direction for <one-sentence summary>.

## Context

- **Problem**: one or two sentences on the user pain.
- **Why now**: what changed — a new capability, a user complaint, a dependency landing.
- **Related specs**: `APP-NNN_...` this depends on, builds on, or supersedes.

## Goals

1. Primary — what the feature must achieve to be worth shipping.
2. Secondary — nice outcomes if the primary lands cleanly.

Non-goals in a separate section below, not here.

## Users & Scenarios

- **Primary persona**: who feels this most acutely.
- **Key scenario(s)**: 2–4 user journeys, each 1–2 sentences. Concrete nouns: "A workspace owner reviewing a PR…".

## User Stories

As a [role], I want [capability], so that [value].

Keep them outcome-focused, not interface-focused. Group by persona if there's more than one.

- As a workspace owner, I want ...
- As a reviewer, I want ...

## Functional Requirements

### Must Have

Number these so TECH and TEST can reference them (M1, M2, …).

- **M1**: description. Acceptance at a high level: "users can X without leaving the workspace view."
- **M2**: ...

### Nice to Have

- **N1**: ...
- **N2**: ...

## Out of Scope

Be explicit about things users might expect. Name the thing, then one line of why it's out.

- **Mobile UI** — desktop/web-first; mobile lands after desktop ships.
- **Cross-repo PRs** — single-repo only in v1.

## Success Metrics

Prefer observable ones. If a metric is aspirational, say so.

- Leading: ...
- Lagging: ...
- Qualitative: ...

## Risks & Open Questions

Product-level risks, not engineering. Open questions for TECH are fine to park here.

- **Risk**: users already have habit X; this may not replace it.
- **Open**: do we surface this in the command palette, or only in the workspace sidebar?

## Milestones

Rough, not a Gantt. "M1 lands first, then N1, gated on …".

- Phase 1 — M1, M2 …
- Phase 2 — M3 + N1 …
```

## Writing rules

- **English**. Technical source material in Chinese can be quoted inline but the PRD itself reads as English.
- **Be concrete**. Use real object nouns from Atmos: Workspace, Project, Worktree, Session, Terminal, Agent Chat, Wiki, PR. Avoid "the system" when you mean `apps/api`.
- **Avoid solutions**. "Users can see PR status on their branch" is PRD. "We poll `gh pr list` every 30s" is TECH — move it.
- **Cite BRAINSTORM forks**. If BRAINSTORM.md called out "Fork 1: real-time vs polled", either resolve it in the PRD or punt it to TECH with a note. Don't silently drop it.
- **Numbering**. Use `M1 / M2` and `N1 / N2` so the TECH and TEST skills can cross-reference.
- **No secrets, real tokens, or customer names** in the PRD.

## Done criteria

- `PRD.md` is populated with real content, no template `<!-- comments -->` left.
- Must Have items are numbered and each is actionable.
- Out of Scope section is non-empty (even a one-item list beats silence).
- At least one success metric is named.
- BRAINSTORM forks are resolved or explicitly deferred to TECH.
- `specs/README.md` inventory table reflects the spec's state if this is the first PRD on it.

## Common mistakes to avoid

- Copying bullet lists from BRAINSTORM verbatim. Condense and rewrite — the PRD is a more committed document.
- Sneaking in endpoint names, table schemas, component names. Move them to TECH.
- Leaving "TBD" scattered throughout. If truly unknown, put it in the Open Questions section.
- Writing the PRD for the engineer. Write it for the product-minded reviewer; the engineer reads it to learn intent, not implementation.

---
name: atmos-specs-brainstorm
description: Run a structured brainstorm for an Atmos spec and write it into `specs/<ZONE>/<ZONE>-NNN_.../BRAINSTORM.md`. Use this whenever the user wants to explore a new feature idea, sketch a rough direction, weigh multiple approaches, or dump unstructured thoughts into the Atmos specs tree — anything that belongs in the BRAINSTORM stage, before a PRD is written. Trigger also when the user says "brainstorm", "头脑风暴", "探索方向", "几种做法", or starts a new `APP-NNN` / `Landing-NNN` / `Docs-NNN` directory. Only touch `BRAINSTORM.md`; leave PRD/TECH/TEST alone.
user-invokable: true
args:
  - name: spec_id
    description: Existing or new spec identifier, e.g. `APP-013` or `APP-013_my-feature`. If only a number is given, infer the zone from context or ask the user. If omitted, allocate the next available number after agreeing on a zone and title.
    required: false
  - name: topic
    description: Short one-line description of what you're brainstorming about, e.g. "terminal session sharing" or "inline agent hints". Used to name new spec directories.
    required: false
---

# Atmos Specs · Brainstorm

Help the user think out loud about a feature before it becomes a PRD. The output goes into a single file: `specs/<ZONE>/<ZONE>-NNN_<title>/BRAINSTORM.md`.

## What this skill owns — and what it does not

- **Owns**: the BRAINSTORM.md of exactly one spec directory.
- **Does not own**: PRD.md, TECH.md, TEST.md. Do not create or edit them in this skill — even if the conversation drifts toward product requirements or architecture. Note promising material at the bottom of BRAINSTORM.md as "Ready to promote to PRD / TECH" bullets instead.

Why: brainstorm is the divergent step. Mixing in PRD language collapses the option space too early, and mixing in tech design commits to a solution before we know the problem is worth solving.

## Read these before you write

1. `specs/AGENTS.md` — the canonical conventions (zones, naming, 4-file rule).
2. `specs/README.md` — the Current Specs inventory table.
3. If updating an existing spec, read that spec's existing `BRAINSTORM.md` + `PRD.md` (if any) so you don't rehash or contradict.

## Workflow

### 1. Decide the spec location

- **Zone** (`APP` / `Landing` / `Docs`): derive from what the feature ships to. When ambiguous, ask once.
- **Number**: look at `ls specs/<ZONE>/` and take the next unused `NNN`.
- **Title**: short, kebab-case, noun-ish (`terminal-session-sharing`, not `feat-share-v2`).
- Final path: `specs/<ZONE>/<ZONE>-NNN_<title>/BRAINSTORM.md`.

If the directory doesn't exist yet, create the full 4-file skeleton by copying an existing spec's placeholders (do not leave empty dirs):

```bash
mkdir -p specs/APP/APP-013_my-feature
cp specs/APP/APP-012_remote-access/{BRAINSTORM,PRD,TECH,TEST}.md \
   specs/APP/APP-013_my-feature/
```

Then clear the copied placeholder bodies in the three files you will not touch (`PRD`, `TECH`, `TEST`) so they stay as clean templates. Only populate `BRAINSTORM.md` in this skill.

### 2. Draw the problem out of the user

Ask short, pointed questions. Prefer two or three rounds of conversation over one giant form. Cover:

- **Trigger**: what happened that made this worth thinking about now? A user complaint, an internal pain point, a competitor, a new capability unlocked?
- **Current workaround**: how are people solving it today (if at all)?
- **Who feels it**: end users of Atmos? internal devs? a specific persona (Agentic Builder, maintainer of a workspace, etc.)?
- **Why it's hard**: what makes this not obvious to just go build?

If the conversation already covered some of these, extract what you can from history first and only ask the gaps.

### 3. Expand, don't converge

Deliberately generate more options than you think you need. Three framings usually beat one:

- **Minimal framing** — the smallest thing that could plausibly work.
- **Generous framing** — what if we had a month and no constraints?
- **Sideways framing** — what if we solved the adjacent problem instead?

For each framing, note 1–3 concrete shapes the solution could take. Don't rank them yet — this stage is about surface area, not decisions.

### 4. Surface tradeoffs and open questions

Name the forks in the road explicitly. Good BRAINSTORM output leaves the PRD author with clear "we decided X, not Y" anchors. Examples of useful forks:

- Local-only vs. sync to cloud
- Built into the main app vs. separate panel / overlay
- WebSocket event vs. REST endpoint (Atmos defaults to WebSocket — flag if you're considering REST)
- Works per-workspace vs. per-project vs. global
- Needs changes in `crates/` vs. pure frontend

List unresolved questions with a clear "decide in PRD" or "decide in TECH" label so they're easy to pick up later.

### 5. Write BRAINSTORM.md

Use this structure. Deviate only when the content clearly needs it.

```markdown
# Brainstorm · <ZONE>-NNN: <Title>

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

What triggered this? Who feels the pain? What's the current workaround? Keep it a few sentences, not a wall.

## Goals (draft)

Rough, revisable. It's fine to list two competing goals; flag which one is primary.

- ...

## Options

### Option A — <one-line label>
What it is, how it would feel to the user, rough scope.

**Pros**: ...
**Cons**: ...
**Unknown**: ...

### Option B — <one-line label>
...

### Option C — <one-line label>
...

## Key forks in the road

- **Fork 1**: X vs Y — decide in PRD / TECH.
- **Fork 2**: ...

## Open questions

- [ ] ...
- [ ] ...

## References

- Existing code: `apps/...`, `crates/...`
- Related specs: `APP-NNN_...`
- External: links, issues, docs

## Ready to promote

Items here are candidates for the PRD/TECH next. Don't write the PRD here — just flag.

- Promote to PRD: ...
- Promote to TECH: ...
```

## Writing style

- **English**, matching the rest of the specs tree.
- Bullet-heavy. Prose is fine for Context and Goals but resist essayifying options.
- Concrete nouns over vague ones (`project-level terminal title`, not `better UX`).
- Never invent user counts, revenue numbers, or specific SLAs. If you don't know, say "unknown".
- Short is a feature. A good BRAINSTORM.md is often 60–150 lines. If you're past 300, you're probably already doing PRD work — stop and ask the user which direction to lock in.

## Done criteria

- The file exists at the right path and has real content (not the template placeholder).
- At least two distinct options are named.
- At least one explicit fork in the road is called out.
- No PRD / TECH / TEST content has been written in this skill run.
- `specs/README.md` Current Specs table is updated if a new spec directory was created.

## Common mistakes to avoid

- Picking a single "obvious" solution and documenting it as if it were the only one. That's PRD work.
- Writing interface names, endpoint shapes, or schemas. That's TECH work.
- Copying the Chinese source material verbatim if the team has moved to English specs; translate or paraphrase.
- Leaving `BRAINSTORM.md` with template `<!-- comments -->` still in it.

# Impl subagent

Read only this file plus the slice brief pasted into the Task prompt. Do not read orchestration skills to “help the lead agent.” You cannot see the parent session; anything not in the brief does not exist.

Coding conventions follow `atmos-specs-impl`: layer order, WebSocket-first, slice regression gate. This file adds hard constraints for parallel slices.

## Hard constraints

1. **Edit only paths in `Owns`.** Reading `Reads` is allowed; writing `Forbids` or unlisted paths = failure. Need a file outside the boundary → `BLOCKED`; do not “fix while here.”
2. **No spec guessing.** TECH/PRD/brief silent or conflicting → `BLOCKED`. Do not pick a “reasonable default.”
3. **No TODO / mock / stubs / `unimplemented!` / fake-green tests.** If you cannot finish → `BLOCKED` with what remains.
4. **No scope expansion.** No neighbor refactors, unrelated lint fixes, or copy keys outside the brief.
5. **Do not declare pass / mark `done`.** Do not write `PROGRESS.md` or `REVIEW.md`.
6. **No commit / push** unless the brief explicitly requires it (default: no).
7. Run the brief's **Verify** command when done. If you cannot run it, say so in the report; do not pretend green.

## Work order

1. Read brief Goal / Out of scope / Owns / Forbids / Invariants / Verify.
2. Read spec sections named in the brief (lead should have excerpted). If excerpts are missing and spec files are readable locally, read only those paths; still insufficient → `BLOCKED`.
3. Implement; keep diff within `Owns`.
4. Run Verify.
5. Return report and **stop**. Do not self-review; do not start the next slice.

## Output (required shape)

Success:

```markdown
SLICE: S1
STATUS: ok
FILES:
- path (created|modified)
VERIFY: `<command>` → pass | fail (exit N)
NOTES: one-line invariants preserved
BLOCKED: none
```

`FILES` must be a subset of `Owns`. Extra paths = slice failure.

Blocked:

```markdown
SLICE: S1
STATUS: BLOCKED
REASON: <spec gap, not "I'm unsure how to write this elegantly">
NEED_FROM: HUMAN | lead agent
QUESTION: <two mutually exclusive options + the TECH sentence you lack>
FILES_ALREADY_CHANGED:
- path
OWNS_RESPECTED: true | false
VERIFY: not_run | `<command>` → …
```

`QUESTION` must offer HUMAN a choice A/B, not an open-ended prompt.

## Brief skeleton (lead agent pastes into Task)

Fill in literally; do not write “continue our earlier discussion.”

```markdown
You are an impl subagent. Read `.agents/skills/atmos-long-task-impl/impl.md`, then `.agents/skills/atmos-specs-impl/SKILL.md` for coding rules. Then do only this slice.

SLICE: S1
GOAL: …
OUT OF SCOPE: …
OWNS:
- path
FORBIDS:
- path
READS (read-only):
- path
INVARIANTS (verbatim from TECH/PRD):
- …
VERIFY: `<command>`
DO NOT: edit outside Owns; write PROGRESS.md / REVIEW.md; commit; guess spec; TODO/mock/stubs; declare pass.
If uncertain, output STATUS: BLOCKED per impl.md and stop.
```

## Failure modes

- Aligning types by editing `packages/api-types` when that is not in `Owns` → stop, `BLOCKED`.
- Wave 0 contract disagrees with TECH → `BLOCKED`; do not “fix contract” in this slice.
- Verify red for reasons in someone else's files → `BLOCKED`; do not edit that file.

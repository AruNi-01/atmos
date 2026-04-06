# Release Notes Template

Use this as a lightweight drafting reference when generating `releasenotes/Atmos Desktop <version>.md`.

This file is intentionally not the source of truth for release content. It exists to improve consistency without forcing a rigid, rule-based output.

## Goal

Turn the collected GitHub release context into concise, product-facing release notes that are useful to end users.

Do not dump raw commit titles.
Do not mirror PR titles mechanically.
Do merge related changes into a smaller number of readable highlights.

## Inputs

Use the collected JSON context as the primary source:

- current release tag and version
- previous desktop release tag
- commit range
- commit subjects and hashes
- merged PRs linked to those commits
- closed issues linked from those PRs

## Writing guidance

- Prefer user-visible outcomes over implementation detail.
- Merge similar commits into one bullet when they describe one feature or one bug-fix area.
- Omit low-signal internal-only noise unless it materially affects users.
  Examples:
  - `chore`
  - `debug`
  - purely internal refactors with no user impact
- Keep the tone factual and product-facing.
- Mention PRs or issues inline only when they add useful traceability.
- If a section has nothing meaningful, omit the section instead of writing filler.

## Suggested structure

```md
Short one-paragraph summary of the release.

## New Features
- ...

## Bug Fixes
- ...

## Improvements
- ...

## Other Changes
- ...
```

> **Note:** Do not include a top-level `#` heading. GitHub Releases already render the release title as an H1 — adding one inside the body creates a duplicate heading.

## Section intent

### `New Features`

Use for net-new capabilities, workflows, surfaces, or major user-facing additions.

### `Bug Fixes`

Use for user-visible defects, regressions, broken flows, incorrect states, or reliability problems that were resolved.

### `Improvements`

Use for UX polish, performance, stability, clarity, and other meaningful non-bug, non-feature upgrades.

### `Other Changes`

Use sparingly. Only include items that are noteworthy but do not fit the earlier sections.

## Style example

Prefer:

- Added real-time file tree updates with live Git status indicators.
- Fixed stuck agent states after permission prompts were approved.
- Improved notification settings reliability and Windows path handling.

Avoid:

- `feat(files): add real-time file tree with live git status`
- `fix: restore agent chat panel opacity control`
- `refactor(web): define AGENT_STATE constants`

## Output requirement

Write the final markdown to:

- `releasenotes/Atmos Desktop <version>.md`

The publish workflow will read that file directly and use it as the GitHub Release body.

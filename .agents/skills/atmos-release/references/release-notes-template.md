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

When the current release shares its base version (`X.Y.Z`) with one or more earlier pre-releases (e.g. `1.1.0-rc.2` after `1.1.0-rc.1`, or stable `1.1.0` after `1.1.0-rc.1` and `1.1.0-rc.2`), the collected context alone is **not enough**. The commit range between two adjacent pre-release tags is typically just a bump commit and a handful of fixes. The prior pre-release file already contains the full product-facing narrative and must be carried forward. See the `Same-base-version continuity` section in `SKILL.md` for the full rule.

Additional inputs in that case:

- the most recent sibling pre-release file at `releasenotes/Atmos Desktop <base>-<prevTag>.md`
- the commit-range delta since that previous pre-release, used only to write the `Changes Since` section or to merge late fixes into a stable

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

## Continuity templates

Use these when the `Same-base-version continuity` rule in `SKILL.md` applies.

### Pre-release following a prior pre-release (e.g. `1.1.0-rc.2` after `1.1.0-rc.1`)

Inherit the prior RC body verbatim and prepend a short `Changes Since` block. Only the `Changes Since` block is newly written.

```md
> **Release candidate.** RC<N> supersedes RC<N-1>. It carries all RC<N-1> content plus the fixes below. Please report any issues you encounter so we can land them before the stable release.

## Changes Since RC<N-1>

- ...two to five bullets summarizing what actually changed since RC<N-1>...

---

...inherited RC<N-1> body continues here, unchanged except for typo fixes...
```

### Stable following one or more pre-releases (e.g. `1.1.0` after `1.1.0-rc.1` and `1.1.0-rc.2`)

Start from the latest RC file, strip RC framing, merge in any `rc.N..X.Y.Z` delta, and polish into stable prose.

- Remove the `Release candidate` callout.
- Remove `Changes Since RC*` preambles.
- Remove language that implies the release is still in progress.
- Keep the full feature / fix / improvement content from the RC line.
- Merge late fixes from the final `rc.N..X.Y.Z` commit range into the appropriate sections.

```md
Short one-paragraph stable-release summary of the release.

## New Features
- ...inherited from the RC line, polished...

## Bug Fixes
- ...inherited from the RC line + any late fixes merged in...

## Improvements
- ...

## Other Changes
- ...
```

### Stable following a stable (no pre-releases in between)

Use the base template directly — no continuity work required. Generate from the commit-range context alone.

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

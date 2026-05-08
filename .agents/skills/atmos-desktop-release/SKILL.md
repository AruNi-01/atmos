---
name: atmos-desktop-release
description: Run the Atmos desktop release workflow for this repository. Use this whenever you need to cut an Atmos desktop release, bump the desktop version, create the required `desktop-v<version>` tag, push the release-prep commit, and verify the GitHub Actions + Homebrew tap flow. Prefer this over a generic GitHub release process for Atmos desktop releases.
user-invokable: true
args:
  - name: version
    description: Desktop version to release, for example `0.2.1` or `0.5.0-rc.1`
    required: true
  - name: prerelease
    description: Set to true for prereleases such as `0.5.0-rc.1`
    required: false
  - name: dry_run
    description: Preview the full release plan without changing files, committing, tagging, or pushing
    required: false
---

Atmos-specific desktop release workflow.

This skill is intentionally tied to this repository's release model. Use it when you want the standard Atmos desktop release path instead of a generic GitHub release flow.

## What this skill owns

This skill handles the Atmos desktop release sequence:

1. validate repository state
2. bump desktop version files together
3. validate version consistency
4. create and push the `desktop-v<version>` tag
5. collect release context from GitHub using `gh`
6. generate the final release body with the model using that context
7. write the generated markdown to `releasenotes/<release title>.md`
8. commit that file as part of the release-prep change
9. let the publish workflow read that file and apply it to the GitHub Release
10. verify the Homebrew tap sync path

The repository-specific implementation lives in the bundled script:

- `scripts/atmos-desktop-release.mjs`

Use that script for execution. Keep this file focused on orchestration and decision-making.

## Repository release model

Atmos desktop releases follow these rules:

- desktop tag format is `desktop-v<version>`
- desktop versions must stay aligned across:
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/tauri.conf.json`
  - `apps/desktop/package.json`
- desktop release workflow:
  - `.github/workflows/release-desktop.yml`
- Homebrew tap sync workflow:
  - `.github/workflows/sync-homebrew-tap.yml`
- shared Homebrew tap:
  - `AruNi-01/homebrew-tap`

Do not replace this with a generic flow like "create a GitHub release first and upload assets manually." For Atmos desktop, the automation is the source of truth.

## Bundled resources

### Execution script
Use the bundled script for the actual release steps:

- `scripts/atmos-desktop-release.mjs`

This script encapsulates the operational workflow:
- version bump
- validation
- commit/tag/push controls
- release guidance
- dry-run behavior

Release-note context collection is handled by the repository helper:

- `scripts/release/collect-desktop-release-context.mjs`

That helper is not responsible for writing the final release prose. Its job is to collect the model inputs needed for release-note generation, including:

- commit subjects and hashes in the release range
- merged PR metadata associated with those commits
- closing issue metadata associated with those PRs
- the previous desktop tag, current tag, and commit range

The final GitHub Release body must be written by the model at skill execution time, not by a rule-based script.

Release-note file resolution is handled by:

- `scripts/release/desktop-release-notes.mjs`

That helper defines the canonical release-notes filename for a desktop release:

- `releasenotes/Atmos Desktop <version>.md`

The release workflow reads that file from the tagged commit and publishes its contents as the GitHub Release body.

Read the script if you need exact command behavior or supported flags.

### Reference checklist
Use the detailed maintainer checklist when you need slower, human-facing verification and recovery guidance:

- `references/release-checklist.md`

Read this reference for:
- pre-release review
- release-wide verification
- Homebrew tap verification
- failure modes
- rollback guidance
- final sign-off

### Post-release verification reference
Load this only when the user explicitly wants release verification, release health investigation, or install/upgrade validation:

- `references/post-release-verification.md`

Use it for:
- validating a published release
- checking DMG artifacts
- confirming release and tap alignment
- verifying Homebrew install or upgrade behavior
- investigating whether a release is fully healthy end-to-end

### Release-notes drafting reference
Load this when you want a lightweight writing template for the model-generated release body:

- `references/release-notes-template.md`

Use it for:
- keeping the release body product-facing
- merging similar commits into fewer highlights
- avoiding raw commit-dump style notes

Do not treat it as a hard rule engine. The collected GitHub context remains the primary input.

Load this reference only when you are actively drafting or revising release-note prose.

Do not load it for:
- version bump only
- tag creation only
- workflow monitoring only
- post-release verification only
- Homebrew tap investigation only

## Same-base-version continuity

Every release-notes file under `releasenotes/` must be **self-sufficient** — it is published verbatim as the GitHub Release body and is the only document users see for that release. When a release shares its base version (`X.Y.Z`) with earlier pre-releases or RCs, the new file must carry forward their content instead of starting from the commit range alone.

Why this rule exists:

- `scripts/release/collect-desktop-release-context.mjs` picks the immediately previous desktop tag as the baseline. For an RC that follows another RC (or a stable that follows RCs), that tag range only contains the delta since the prior pre-release — typically just a bump commit or a single fix — and is insufficient as a stand-alone release note.
- The release body is not an incremental changelog; it is the full product-facing description of the release.

Apply the rule in these cases:

- **Pre-release follows a pre-release of the same base** (e.g. `1.1.0-rc.2` after `1.1.0-rc.1`):
  1. Read the previous pre-release file, `releasenotes/Atmos Desktop <base>-<prevTag>.md`.
  2. Carry its body forward into the new file unchanged.
  3. Insert a short `Changes Since <prevTag>` block at the top (above the existing content) that summarizes what changed since the previous pre-release. Keep the RC framing (for example the `Release candidate` callout) intact.
  4. Only the `Changes Since ...` block needs to be generated from the commit-range context; the rest is inherited.

- **Stable follows one or more pre-releases of the same base** (e.g. `1.1.0` after `1.1.0-rc.1`, `1.1.0-rc.2`):
  1. Start from the most recent pre-release file as the foundation.
  2. Remove the `Release candidate` framing, any `Changes Since RC*` preambles, and language that implies the release is still in progress.
  3. Polish the surviving content into stable-release prose and merge in anything new from the final `rc.N..X.Y.Z` range.
  4. The stable release notes must cover the full feature set introduced in the `X.Y.Z` line, not only the post-RC delta.

- **Stable follows a stable (no pre-releases)** — normal flow: generate from the commit-range context alone. No continuity work required.

How to locate sibling pre-release files:

```bash
ls "releasenotes/" | grep -E "^Atmos Desktop <base>-(rc|beta|alpha)\."
```

Read the newest matching file (by filename sort) as the inheritance source. If no match exists, fall back to the normal commit-range-only flow.

## Inputs

### `version`
Required. A semver-like desktop version such as:

- `0.2.1`
- `1.0.0`
- `0.5.0-rc.1`

### `prerelease`
Optional. Treat the release as a prerelease when relevant.

### `dry_run`
Optional. If true, preview the release without mutating git state.

## Preconditions

Before running the release flow, confirm:

- you are operating in the Atmos repository
- you have permission to push commits and tags
- GitHub authentication is valid
- the working tree is intentionally clean unless you explicitly choose otherwise
- required GitHub Actions secrets are configured

Important secrets to be aware of include:

- `HOMEBREW_TAP_PAT`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `APPLE_SIGNING_IDENTITY` when applicable

If `HOMEBREW_TAP_PAT` is missing, the desktop release may still publish but the Homebrew tap sync can fail.

## Default execution pattern

When asked to perform an Atmos desktop release:

1. normalize the requested inputs
2. construct the desktop tag as `desktop-v<version>`
3. run the bundled release script
4. wait for the GitHub Release to exist for that tag
5. collect release context with `gh`
6. generate a polished release body with the model
7. write the release body to `releasenotes/Atmos Desktop <version>.md`
8. run the bundled release script so the release-prep commit includes that file
9. confirm the publish workflow used that file as the GitHub Release body
10. review the result and surface follow-up verification steps

Recommended command sequence for the note-generation portion:

```bash
node ./scripts/release/collect-desktop-release-context.mjs --current-tag desktop-v<version> --output /tmp/atmos-desktop-release-context.json
node ./scripts/release/desktop-release-notes.mjs --version <version> --print abs-path
# write the model-generated markdown into the resolved path
```

Expected model behavior for this step:

- read the collected JSON context
- synthesize similar commits into a smaller number of user-facing highlights
- write release notes in the sections:
  - `New Features`
  - `Bug Fixes`
  - `Improvements`
  - `Other Changes`
- mention related PRs and closed issues inline where helpful
- produce polished product-facing prose rather than commit-title dumps
- save the final markdown at `releasenotes/Atmos Desktop <version>.md`

### Dry run
If the user wants a preview, run:

```bash
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version> --dry-run
```

### Standard release
For a normal release, run:

```bash
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version>
```

### Prerelease
For a prerelease, run:

```bash
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version> --prerelease
```

## When to read the script

Read `scripts/atmos-desktop-release.mjs` if you need to know:

- what flags are available
- whether commit/tag/push can be skipped
- how dry-run behaves
- what validation is enforced
- what post-release guidance is printed

Do not duplicate that operational detail here unless the script changes significantly.

If you need the detailed checklist, manual verification flow, or rollback guidance, read:

- `references/release-checklist.md`

Read `scripts/release/collect-desktop-release-context.mjs` if you need to change:

- which GitHub metadata is collected for the model
- how PRs are associated with commits
- how closing issues are resolved
- how the previous desktop tag is selected

Read `scripts/release/desktop-release-notes.mjs` if you need to change:

- the canonical release title
- the canonical release-notes filename
- how release-note file existence is validated

Read `references/release-notes-template.md` if you need to change:

- release-note tone and style guidance
- the suggested markdown structure
- examples of what to include or omit

If and only if the user is asking to verify a release after it has been created or published, read:

- `references/post-release-verification.md`

## Required behavior

When using this skill:

- prefer the bundled script over manually reconstructing the flow
- preserve the Atmos desktop tag format
- preserve the repository's version consistency checks
- preserve the model-generated release-note flow instead of using GitHub auto-generated notes
- preserve the repository convention that release notes live under `releasenotes/` and are named after the release title
- rely on `release-desktop.yml` for release publication
- rely on `sync-homebrew-tap.yml` for tap updates

## Failure handling

If the bundled script reports a failure:

1. stop
2. explain the failure clearly
3. do not continue to later release steps manually
4. fix the underlying cause first

### Common failure classes
- dirty working tree
- invalid version format
- mismatched desktop version files
- existing tag conflict
- push failure
- release workflow failure
- tap sync failure

If release artifacts and tag version disagree, treat it as a release integrity problem. Do not patch around it by hand-editing downstream metadata.

## Verification after execution

After a non-dry-run release, verify:

- the desktop release workflow ran
- the GitHub Release exists for `desktop-v<version>`
- the tagged commit contains `releasenotes/Atmos Desktop <version>.md`
- the published GitHub Release body matches the custom grouped sections:
  - `New Features`
  - `Bug Fixes`
  - `Improvements`
  - `Other Changes`
- the release body was read from `releasenotes/Atmos Desktop <version>.md`, not from GitHub auto-generated notes
- the expected macOS artifacts were produced:
  - `Atmos_<version>_aarch64.dmg`
  - `Atmos_<version>_x64.dmg`
- the Homebrew tap sync workflow ran
- the shared tap updated successfully
- the install path works

For the full maintainer checklist, recovery notes, and sign-off flow, use:

- `references/release-checklist.md`

Only when the user wants post-release validation, release health checks, or install-path confirmation, also use:

- `references/post-release-verification.md`

The minimum install-path verification command is:

```bash
brew install --cask AruNi-01/tap/atmos
```

Optionally verify upgrade behavior too:

```bash
brew upgrade --cask atmos
```

## Never do these things

- never use a plain `v<version>` tag for Atmos desktop
- never skip desktop version consistency checks
- never create the desktop tag before versions are aligned
- never assume a successful GitHub Release means Homebrew is already updated
- never hand-edit the cask to hide a broken release
- never declare the release complete before both release and tap sync are verified

## Quick reference

### Standard release
```bash
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version>
```

### Dry run
```bash
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version> --dry-run
```

### Prerelease
```bash
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version> --prerelease
```

### Collect release-note context
```bash
node ./scripts/release/collect-desktop-release-context.mjs --current-tag desktop-v<version> --to-ref HEAD --output /tmp/atmos-desktop-release-context.json
```

### Resolve release-note path
```bash
node ./scripts/release/desktop-release-notes.mjs --version <version> --print path
```

## Summary

This skill is the Atmos desktop release entrypoint.

Use this file to decide that the Atmos-specific flow is appropriate.
Use the bundled script to actually execute that flow.
Keep the release source of truth aligned across:

- version files
- desktop tag
- release artifacts
- Homebrew tap

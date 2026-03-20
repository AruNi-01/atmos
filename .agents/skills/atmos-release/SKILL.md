---
name: atmos-release
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
5. rely on GitHub Actions to publish the desktop release
6. verify the Homebrew tap sync path

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
3. run the bundled script
4. review the script output
5. surface any follow-up verification steps

### Dry run
If the user wants a preview, run:

```bash
node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs <version> --dry-run
```

### Standard release
For a normal release, run:

```bash
node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs <version>
```

### Prerelease
For a prerelease, run:

```bash
node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs <version> --prerelease
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

If and only if the user is asking to verify a release after it has been created or published, read:

- `references/post-release-verification.md`

## Required behavior

When using this skill:

- prefer the bundled script over manually reconstructing the flow
- preserve the Atmos desktop tag format
- preserve the repository's version consistency checks
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
node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs <version>
```

### Dry run
```bash
node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs <version> --dry-run
```

### Prerelease
```bash
node ./.agents/skills/atmos-release/scripts/atmos-desktop-release.mjs <version> --prerelease
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

---
name: atmos-cli-release
description: Run the standalone Atmos CLI release workflow for this repository. Use this whenever you need to cut an Atmos CLI release, verify `apps/cli/Cargo.toml`, create or dispatch the required `cli-v<version>` GitHub Release, and publish CLI archives. Prefer this over local runtime or generic GitHub release flows for CLI releases.
user-invokable: true
args:
  - name: version
    description: CLI version to release, for example `0.1.0` or `0.2.0-rc.1`
    required: true
  - name: prerelease
    description: Set to true for prereleases such as `0.2.0-rc.1`
    required: false
  - name: dry_run
    description: Preview the full release plan without changing files, creating tags, or publishing anything
    required: false
---

Atmos-specific standalone CLI release workflow.

Use this skill when publishing the `atmos` CLI as an independent control-plane artifact for agents, scripts, Desktop, Web, and Local Runtime integrations.

## What this skill owns

This skill handles the Atmos CLI release sequence:

1. validate repository state
2. validate the CLI version in `apps/cli/Cargo.toml`
3. optionally build the CLI locally for a spot check
4. publish a stable `cli-v<version>` release from `main`, or a prerelease test release from an explicit ref
5. rely on GitHub Actions to build and upload CLI archives
6. verify the published GitHub Release assets
7. verify `atmos update` and Settings > About can discover the stable release

The repository-specific execution wrapper lives in the bundled script:

- `scripts/atmos-cli-release.mjs`

Use that script for operational steps. Keep this file focused on orchestration and decision-making.

This skill does not own the local runtime release flow, `@atmos/local-web-runtime`, Desktop release packaging, or Homebrew tap updates. Keep those in `atmos-local-web-release` and `atmos-desktop-release`.

## Repository release model

Atmos CLI releases follow these rules:

- CLI tag format is `cli-v<version>`
- CLI package version is sourced from:
  - `apps/cli/Cargo.toml`
- CLI release workflow:
  - `.github/workflows/release-cli.yml`
- stable tag push releases must point at a commit already contained in `origin/main`
- prerelease test releases should use `workflow_dispatch` with `prerelease=true`
- stable version checks filter out prerelease tags such as `cli-v0.2.0-rc.1`
- release assets must be named:
  - `atmos-cli-aarch64-apple-darwin.tar.gz`
  - `atmos-cli-x86_64-apple-darwin.tar.gz`
  - `atmos-cli-x86_64-unknown-linux-gnu.tar.gz`
  - `atmos-cli-x86_64-pc-windows-msvc.tar.gz`

Do not replace this with a manual flow like "create a GitHub release and upload tarballs by hand." For Atmos CLI, the GitHub Actions workflow is the source of truth for publication.

## Bundled resources

### Execution script

Use the bundled script for release-prep steps:

- `scripts/atmos-cli-release.mjs`

This script encapsulates:

- version validation
- optional local CLI build preflight
- stable tag creation and push controls
- prerelease workflow dispatch controls
- dry-run behavior
- workflow monitoring guidance

### Publication workflow

Use the GitHub Actions workflow for actual publication:

- `.github/workflows/release-cli.yml`

This workflow is responsible for:

- validating the CLI version against the tag
- building each supported target
- uploading CLI archives to the GitHub Release
- marking the GitHub Release published

## Inputs

### `version`

Required. A semver-like CLI version such as:

- `0.1.0`
- `1.0.0`
- `0.2.0-rc.1`

### `prerelease`

Optional. Treat the release as a prerelease. Prerelease releases use `workflow_dispatch` and may target a non-main ref for real release-path testing.

### `dry_run`

Optional. If true, preview the release without mutating git state or triggering publication.

## Preconditions

Before running the release flow, confirm:

- you are operating in the Atmos repository
- you have permission to push tags or dispatch GitHub workflows
- GitHub authentication is valid
- the working tree is intentionally clean unless you explicitly choose otherwise
- required GitHub Actions permissions are configured

The CLI release does not require npm, desktop-signing, or Homebrew tap secrets.

## Default execution pattern

When asked to perform a stable Atmos CLI release:

1. normalize the requested inputs
2. construct the CLI tag as `cli-v<version>`
3. validate `apps/cli/Cargo.toml` matches the requested version
4. optionally build the local CLI for confidence checking
5. confirm the target commit is on `origin/main`
6. if `dry_run=true`, stop after validation and report exact release commands
7. create and push the `cli-v<version>` tag
8. monitor `.github/workflows/release-cli.yml`
9. verify the GitHub Release contains the expected CLI archives

Recommended command sequence for dry run:

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version> --dry-run
```

Recommended command sequence for stable release:

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version>
```

Recommended command sequence for prerelease test release:

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version> --prerelease
```

Recommended command sequence for workflow monitoring:

```bash
gh run list --workflow release-cli.yml --limit 5
gh run watch <run-id>
```

### Dry run

For a preview-only run, do not create tags or publish anything. Instead:

1. validate the CLI version
2. optionally build the CLI locally
3. report the exact tag and workflow path that would be used
4. highlight whether the release would be stable tag push or prerelease workflow dispatch

## Required behavior

When using this skill:

- preserve the Atmos CLI tag format
- preserve the repository's CLI version check
- rely on `release-cli.yml` for publication
- treat GitHub Release assets as the canonical CLI download source
- do not publish stable releases from branch-only commits
- use prerelease workflow dispatch for real release-path testing from non-main refs

## Failure handling

If validation or publication fails:

1. stop
2. explain the failure clearly
3. do not continue to later release steps manually
4. fix the underlying cause first

### Common failure classes

- dirty working tree
- invalid version format
- `apps/cli/Cargo.toml` version mismatch
- stable release commit not on `origin/main`
- existing tag conflict
- push failure
- GitHub Actions workflow failure
- missing release assets

If the GitHub Release assets and tag version disagree, treat it as a release integrity problem. Do not patch around it by manually uploading mismatched archives.

## Verification after execution

After a non-dry-run release, verify:

- the CLI release workflow ran
- the GitHub Release exists for `cli-v<version>`
- the expected CLI archives are present for the supported targets
- stable CLI checks discover the new version only when it is not a prerelease

Minimum verification command:

```bash
gh release view cli-v<version>
```

## Never do these things

- never use a plain `v<version>` tag for Atmos CLI
- never publish a stable CLI release from a branch-only commit
- never skip the CLI version check
- never manually upload ad-hoc CLI archives to work around a broken workflow
- never declare the release complete before GitHub Release assets are verified

## Quick reference

### Dry run

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version> --dry-run
```

### Stable release-prep

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version>
```

### Prerelease test release

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version> --prerelease
```

### Monitor workflow

```bash
gh run list --workflow release-cli.yml --limit 5
gh run watch <run-id>
```

## Summary

This skill is the Atmos standalone CLI release entrypoint.

Use this file to decide that the CLI-specific flow is appropriate.
Use the bundled execution script for release-prep work.
Use the GitHub Actions workflow for publication.
Keep the release source of truth aligned across:

- CLI package version
- CLI tag
- GitHub Release assets
- `atmos update` discovery

---
name: atmos-local-web-release
description: Run the Atmos local web runtime release workflow for this repository. Use this whenever you need to cut an Atmos local web runtime release, verify the local runtime version, create the required `local-web-runtime-<version>` tag, and publish the runtime archives. Prefer this over a generic GitHub release process for Atmos local web runtime releases.
user-invokable: true
args:
  - name: version
    description: Local runtime version to release, for example `2026.7.2` or `2026.7.2-rc.1`
    required: true
  - name: prerelease
    description: Set to true for prereleases such as `2026.7.2-rc.1`
    required: false
  - name: dry_run
    description: Preview the full release plan without changing files, creating tags, or publishing anything
    required: false
---

Atmos-specific local runtime release workflow.

Use this skill when you want the standard Atmos local runtime distribution path instead of a generic GitHub release flow.

## What This Skill Owns

This skill handles the Atmos local runtime release sequence:

1. validate repository state
2. validate the local runtime version and tag alignment
3. optionally build the local runtime archive locally for a spot check
4. create and push the `local-web-runtime-<version>` tag
5. rely on GitHub Actions to build and upload runtime archives
6. verify the published GitHub Release assets
7. verify the shell installer resolves the published release when requested

The repository-specific execution wrapper lives in:

- `scripts/atmos-local-web-release.mjs`

This skill does not own the standalone CLI release flow, desktop release flow, Tauri artifacts, DMG packaging, Homebrew tap updates, or npm publication.

## Repository Release Model

Atmos local runtime releases follow these rules:

- local runtime tag format is `local-web-runtime-<version>`
- local runtime release version is sourced from `resources/local-runtime/version.json`
- standalone CLI releases use `cli-<version>` and are handled by the `atmos-cli-release` skill
- local runtime release workflow is `.github/workflows/release-local-runtime.yml`
- installer entrypoint is `install-local-web-runtime.sh`
- runtime build script is `scripts/local-runtime/build-runtime.mjs`
- version consistency script is `scripts/release/check-local-runtime-version.mjs`

Do not replace this with a manual flow like "create a GitHub release and upload tarballs by hand." For Atmos local runtime, the GitHub Actions workflow is the source of truth for publication.

## Bundled Resources

### Version Validation

Use the repository version-check script before any release action:

- `scripts/release/check-local-runtime-version.mjs`

This script confirms:

- the local runtime version
- optional tag-to-version alignment

### Execution Script

Use the bundled script for release-prep steps:

- `scripts/atmos-local-web-release.mjs`

This script encapsulates:

- version validation
- optional local runtime build preflight
- tag creation and push controls
- dry-run behavior
- workflow monitoring guidance

### Runtime Packaging

Use the repository build script when you need to validate the local runtime package before release:

- `scripts/local-runtime/build-runtime.mjs`

That script produces:

- `dist/local-runtime/atmos-local-runtime-<target>.tar.gz`

The archive is expected to contain:

- `bin/api`
- `web/`
- `system-skills/`
- `version.txt`
- `manifest.json`

### Publication Workflow

Use GitHub Actions for actual publication:

- `.github/workflows/release-local-runtime.yml`

This workflow is responsible for:

- building each supported target
- uploading runtime archives to the GitHub Release
- marking the GitHub Release published

### Installer Entrypoint

Use this file when validating the published install path:

- `install-local-web-runtime.sh`

### References

Use the detailed checklist when you need slower, human-facing verification and recovery guidance:

- `references/release-checklist.md`

Load post-release verification only when the user explicitly wants release health investigation or installer validation:

- `references/post-release-verification.md`

## Preconditions

Before running the release flow, confirm:

- you are operating in the Atmos repository
- you have permission to push commits and tags
- GitHub authentication is valid
- the working tree is intentionally clean unless you explicitly choose otherwise
- required GitHub Actions secrets for release asset publishing are configured

The local runtime release does not require npm, desktop-signing, or Homebrew tap secrets.

## Default Execution Pattern

When asked to perform an Atmos local runtime release:

1. normalize the requested inputs
2. construct the local runtime tag as `local-web-runtime-<version>`
3. run the local version validation script
4. optionally build one local runtime archive for confidence checking
5. if `dry_run=true`, stop after validation and report the exact release commands
6. create and push the `local-web-runtime-<version>` tag
7. monitor `.github/workflows/release-local-runtime.yml`
8. verify the GitHub Release contains the expected runtime archives
9. verify the shell installer resolves the published release when requested

Recommended validation command:

```bash
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version> --dry-run
```

Recommended standard command:

```bash
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version>
```

Recommended monitoring commands:

```bash
gh run list --workflow release-local-runtime.yml --limit 5
gh run watch <run-id>
```

## Required Behavior

When using this skill:

- preserve the Atmos local runtime tag format
- preserve the repository's version consistency checks
- rely on `release-local-runtime.yml` for publication
- treat GitHub Release assets and R2 sync as the canonical runtime download path
- verify `install-local-web-runtime.sh` after release when installer validation is requested

## Failure Handling

If validation or publication fails:

1. stop
2. explain the failure clearly
3. do not continue to later release steps manually
4. fix the underlying cause first

Common failure classes:

- dirty working tree
- invalid version format
- version mismatch between local runtime tag and `resources/local-runtime/version.json`
- existing tag conflict
- push failure
- GitHub Actions workflow failure
- missing release assets
- R2 sync failure

If the GitHub Release assets and tag version disagree, treat it as a release integrity problem. Do not patch around it by manually uploading mismatched archives.

## Verification After Execution

After a non-dry-run release, verify:

- the local runtime release workflow ran
- the GitHub Release exists for `local-web-runtime-<version>`
- the expected runtime archives are present:
  - `atmos-local-runtime-aarch64-apple-darwin.tar.gz`
  - `atmos-local-runtime-x86_64-apple-darwin.tar.gz`
  - `atmos-local-runtime-x86_64-unknown-linux-gnu.tar.gz`
- `install-local-web-runtime.sh` resolves the correct `local-web-runtime-<version>` release when installer validation is requested

Minimum verification command:

```bash
gh release view local-web-runtime-<version>
```

Installer verification command:

```bash
bash ./install-local-web-runtime.sh --version <version> --no-start
```

## Never Do These Things

- never add `v` to Atmos local runtime tags; use `local-web-runtime-<version>`
- never skip the local runtime version consistency check
- never create the local runtime tag before the version file matches the tag
- never manually upload ad-hoc runtime archives to work around a broken workflow
- never declare the release complete before GitHub Release assets are verified

## Quick Reference

### Dry Run
```bash
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version> --dry-run
```

### Standard Release Prep
```bash
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version>
```

### Validate Versions Directly
```bash
node ./scripts/release/check-local-runtime-version.mjs --release-tag local-web-runtime-<version>
```

### Build Local Runtime Archive Directly
```bash
node ./scripts/local-runtime/build-runtime.mjs
```

### Monitor Workflow
```bash
gh run list --workflow release-local-runtime.yml --limit 5
gh run watch <run-id>
```

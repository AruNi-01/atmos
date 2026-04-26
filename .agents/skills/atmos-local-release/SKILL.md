---
name: atmos-local-release
description: Run the Atmos local web runtime release workflow for this repository. Use this whenever you need to cut an Atmos local runtime release, verify the shared local runtime version, create the required `local-v<version>` tag, publish the runtime archives, and publish the `@atmos/local` installer package. Prefer this over a generic GitHub release process for Atmos local runtime releases.
user-invokable: true
args:
  - name: version
    description: Local runtime version to release, for example `0.1.0` or `0.2.0-rc.1`
    required: true
  - name: prerelease
    description: Set to true for prereleases such as `0.2.0-rc.1`
    required: false
  - name: dry_run
    description: Preview the full release plan without changing files, creating tags, or publishing anything
    required: false
---

Atmos-specific local runtime release workflow.

This skill is intentionally tied to this repository's local runtime release model. Use it when you want the standard Atmos local web distribution path instead of a generic GitHub release flow.

## What this skill owns

This skill handles the Atmos local runtime release sequence:

1. validate repository state
2. validate the shared local runtime version across CLI and installer
3. optionally build the local runtime archive locally for a spot check
4. create and push the `local-v<version>` tag
5. rely on GitHub Actions to build and upload runtime archives
6. rely on GitHub Actions to publish `@atmos/local`
7. verify the published GitHub Release assets
8. verify the shell and npm installer entrypoints are aligned with the published release

The repository-specific execution wrapper lives in the bundled script:

- `scripts/atmos-local-release.mjs`

Use that script for the operational steps. Keep this file focused on orchestration and decision-making.

This skill does not own the desktop release flow, Tauri artifacts, DMG packaging, or Homebrew tap updates. Keep those in the separate `atmos-release` skill.

## Repository release model

Atmos local runtime releases follow these rules:

- local runtime tag format is `local-v<version>`
- shared local runtime versions must stay aligned across:
  - `apps/cli/Cargo.toml`
  - `packages/local-installer/package.json`
- local runtime release workflow:
  - `.github/workflows/release-local-runtime.yml`
- installer entrypoints:
  - `install.sh`
  - `@atmos/local`
- runtime build script:
  - `scripts/local-runtime/build-runtime.mjs`
- version consistency script:
  - `scripts/release/check-local-runtime-version.mjs`

Do not replace this with a manual flow like "create a GitHub release and upload tarballs by hand." For Atmos local runtime, the GitHub Actions workflow is the source of truth for publication.

## Bundled resources

### Version validation
Use the repository version-check script before any release action:

- `scripts/release/check-local-runtime-version.mjs`

This script is the source of truth for confirming:

- the CLI version
- the npm installer version
- optional tag-to-version alignment

### Execution script
Use the bundled script for the actual release-prep steps:

- `scripts/atmos-local-release.mjs`

This script encapsulates the operational workflow:

- version validation
- optional local runtime build preflight
- tag creation and push controls
- dry-run behavior
- workflow monitoring guidance

### Runtime packaging
Use the repository build script when you need to validate the local runtime package before release:

- `scripts/local-runtime/build-runtime.mjs`

That script produces the canonical release archive:

- `dist/local-runtime/atmos-local-runtime-<target>.tar.gz`

The archive is expected to contain:

- `bin/api`
- `bin/atmos`
- `web/`
- `system-skills/`
- runtime manifest metadata

### Publication workflow
Use the GitHub Actions workflow for actual publication:

- `.github/workflows/release-local-runtime.yml`

This workflow is responsible for:

- building each supported target
- uploading runtime archives to the GitHub Release
- publishing `@atmos/local` to npm
- marking the GitHub Release published

### Installer entrypoints
Use these files when validating the published install path:

- `install.sh`
- `packages/local-installer/bin/atmos-local.mjs`
- `packages/local-installer/README.md`

### Reference checklist
Use the detailed maintainer checklist when you need slower, human-facing verification and recovery guidance:

- `references/release-checklist.md`

Read this reference for:

- pre-release review
- release-wide verification
- npm alignment checks
- installer verification
- failure modes
- final sign-off

### Post-release verification reference
Load this only when the user explicitly wants release verification, release health investigation, or installer validation:

- `references/post-release-verification.md`

Use it for:

- validating a published release
- checking runtime archives
- confirming release and npm alignment
- verifying shell or npm installer behavior
- investigating whether a release is fully healthy end-to-end

## Inputs

### `version`
Required. A semver-like local runtime version such as:

- `0.1.0`
- `1.0.0`
- `0.2.0-rc.1`

### `prerelease`
Optional. Treat the release as a prerelease when relevant.

### `dry_run`
Optional. If true, preview the release without mutating git state or triggering publication.

## Preconditions

Before running the release flow, confirm:

- you are operating in the Atmos repository
- you have permission to push commits and tags
- GitHub authentication is valid
- npm publish credentials are valid if publication is expected
- the working tree is intentionally clean unless you explicitly choose otherwise
- required GitHub Actions secrets are configured

Important secrets to be aware of include:

- `NPM_TOKEN`

The local runtime release does not require the desktop-signing or Homebrew tap secrets.

## Default execution pattern

When asked to perform an Atmos local runtime release:

1. normalize the requested inputs
2. construct the local runtime tag as `local-v<version>`
3. run the local version validation script
4. optionally build one local runtime archive for confidence checking
5. if `dry_run=true`, stop after validation and report the exact release commands
6. create and push the `local-v<version>` tag
7. monitor `.github/workflows/release-local-runtime.yml`
8. verify the GitHub Release contains the expected runtime archives
9. verify npm has the expected `@atmos/local` version
10. verify the install entrypoints still resolve the published release correctly

Recommended command sequence for the validation portion:

```bash
node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs <version> --dry-run
```

Recommended command sequence for the standard path:

```bash
node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs <version>
```

Recommended command sequence for workflow monitoring:

```bash
gh run list --workflow release-local-runtime.yml --limit 5
gh run watch <run-id>
```

Expected model behavior for this step:

- verify the release tag matches the validated version
- avoid hand-publishing release assets outside the workflow
- treat GitHub Release assets and npm publish results as the authoritative output
- call out missing secrets or workflow failures clearly instead of improvising around them

### Dry run
For a preview-only run, do not create tags or publish anything. Instead:

1. run version validation
2. optionally build the runtime locally
3. report the exact tag and workflow steps that would be used
4. highlight any preconditions that are not yet satisfied

Run:

```bash
node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs <version> --dry-run
```

## Required behavior

When using this skill:

- preserve the Atmos local runtime tag format
- preserve the repository's version consistency checks
- rely on `release-local-runtime.yml` for publication
- treat GitHub Release assets as the canonical runtime download source
- treat `@atmos/local` as the canonical `npx` and `bunx` entrypoint
- verify both installer paths after release:
  - `install.sh`
  - `npx @atmos/local` or `bunx @atmos/local`

## Failure handling

If validation or publication fails:

1. stop
2. explain the failure clearly
3. do not continue to later release steps manually
4. fix the underlying cause first

### Common failure classes

- dirty working tree
- invalid version format
- version mismatch between CLI and npm installer
- existing tag conflict
- push failure
- GitHub Actions workflow failure
- missing release assets
- npm publish failure

If the GitHub Release assets, npm version, and tag version disagree, treat it as a release integrity problem. Do not patch around it by manually uploading mismatched archives.

## Verification after execution

After a non-dry-run release, verify:

- the local runtime release workflow ran
- the GitHub Release exists for `local-v<version>`
- the expected runtime archives are present for the supported targets
- the published archive names follow:
  - `atmos-local-runtime-aarch64-apple-darwin.tar.gz`
  - `atmos-local-runtime-x86_64-apple-darwin.tar.gz`
  - `atmos-local-runtime-x86_64-unknown-linux-gnu.tar.gz`
- npm reports the expected `@atmos/local` version
- `install.sh` resolves the correct `local-v<version>` release
- `npx @atmos/local` or `bunx @atmos/local` resolves the correct `local-v<version>` release

Minimum verification commands:

```bash
gh release view local-v<version>
npm view @atmos/local version
```

Use installer verification only when the user explicitly wants install-path confirmation or release health checks:

```bash
bash ./install.sh --version <version> --no-start
npx @atmos/local --version <version> --no-start
```

## Never do these things

- never use a plain `v<version>` tag for Atmos local runtime
- never skip the local runtime version consistency check
- never create the local runtime tag before versions are aligned
- never publish `@atmos/local` from a version that does not match the release tag
- never manually upload ad-hoc runtime archives to work around a broken workflow
- never declare the release complete before both GitHub Release assets and npm publish are verified

## Quick reference

### Dry run
```bash
node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs <version> --dry-run
```

### Standard release-prep
```bash
node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs <version>
```

### Validate versions directly
```bash
node ./scripts/release/check-local-runtime-version.mjs --release-tag local-v<version>
```

### Build local runtime archive directly
```bash
node ./scripts/local-runtime/build-runtime.mjs
```

### Monitor workflow
```bash
gh run list --workflow release-local-runtime.yml --limit 5
gh run watch <run-id>
```

### Check published npm version
```bash
npm view @atmos/local version
```

## Summary

This skill is the Atmos local runtime release entrypoint.

Use this file to decide that the Atmos-specific local runtime flow is appropriate.
Use the bundled execution script for release-prep work.
Use the GitHub Actions workflow for publication.
Keep the release source of truth aligned across:

- CLI version
- npm installer version
- local runtime tag
- GitHub Release assets
- installer entrypoints

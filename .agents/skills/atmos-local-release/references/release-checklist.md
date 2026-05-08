# Atmos Local Runtime Release Checklist

Use this as the concise maintainer checklist for an Atmos local runtime release.

Use this file for:
- pre-release review
- release sign-off
- quick recovery guidance

Do not use this as the default verification reference after release publication. For that, use `post-release-verification.md`.

---

## Release contract

A correct Atmos local runtime release means these agree:

1. CLI version
2. npm installer version
3. local runtime tag
4. GitHub Release assets
5. installer resolution behavior

If any layer disagrees, the release is not complete.

---

## Repository conventions

- Tag format: `local-v<version>`
- Version files:
  - `apps/cli/Cargo.toml`
  - `packages/local-installer/package.json`
- Release workflow:
  - `.github/workflows/release-local-runtime.yml`
- Runtime build script:
  - `scripts/local-runtime/build-runtime.mjs`
- Version check script:
  - `scripts/release/check-local-runtime-version.mjs`
- Installer entrypoints:
  - `install-local-web-runtime.sh`
  - `@atmos/local-web-runtime`

---

## Pre-release checklist

### Repository state
- [ ] On the intended release branch
- [ ] Working tree is clean, or any dirty state is intentional
- [ ] Recent release-relevant changes were reviewed
- [ ] No unrelated work is mixed into the release

### Version planning
- [ ] Target version is correct
- [ ] Version format is valid
- [ ] Intended tag is clear, for example `local-v0.1.0`

### Access and secrets
- [ ] Push permission is available
- [ ] GitHub authentication works
- [ ] `NPM_TOKEN` is configured for the workflow

---

## Version consistency checklist

Before tagging, confirm all of the following:

- [ ] `apps/cli/Cargo.toml` version matches target version
- [ ] `packages/local-installer/package.json` version matches target version
- [ ] Release tag matches the same version

Typical commands:
- `node ./scripts/release/check-local-runtime-version.mjs --release-tag local-v<version>`
- `node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs <version> --dry-run`

Example for `0.1.0`:
- files = `0.1.0`
- tag = `local-v0.1.0`

---

## Standard release checklist

### Prepare
- [ ] Dry run reviewed if needed
- [ ] Version checks passed
- [ ] Optional local runtime preflight build passed
- [ ] Diff reviewed

### Git actions
- [ ] `local-v<version>` tag created
- [ ] `local-v<version>` tag pushed

### Automation
- [ ] `release-local-runtime.yml` started
- [ ] `release-local-runtime.yml` passed
- [ ] GitHub Release was created or updated
- [ ] npm publish step passed

### Distribution
- [ ] Expected runtime archives exist
- [ ] Archive names match intended version line
- [ ] npm package version is correct
- [ ] Installer entrypoints resolve the intended release

---

## Minimum artifact checks

For version `0.1.0`, expect:

- `atmos-local-runtime-aarch64-apple-darwin.tar.gz`
- `atmos-local-runtime-x86_64-apple-darwin.tar.gz`
- `atmos-local-runtime-x86_64-unknown-linux-gnu.tar.gz`

Verify:
- [ ] all expected archives exist
- [ ] archives are attached to `local-v<version>`
- [ ] archive set matches supported targets

If tag and runtime assets disagree, stop and treat the release as invalid.

---

## Minimum npm checks

Verify:
- [ ] npm publish step succeeded
- [ ] `npm view @atmos/local-web-runtime version` matches target version
- [ ] npm package is consistent with the GitHub Release version

If GitHub Release and npm version disagree, treat the release as invalid.

---

## Minimum installer checks

Verify:
- [ ] `install-local-web-runtime.sh` resolves the correct local release tag
- [ ] `npx @atmos/local-web-runtime` resolves the correct local release tag
- [ ] both entrypoints still download the published runtime asset set

If installers resolve the wrong release, the distribution path is not healthy even if assets exist.

---

## Sign-off checklist

- [ ] CLI version matches
- [ ] npm installer version matches
- [ ] tag matches version files
- [ ] GitHub Release exists
- [ ] expected runtime archives exist
- [ ] npm package version matches
- [ ] installer entrypoints resolve the release
- [ ] safe to announce or treat as complete

---

## Common failure cases

### Version mismatch
Symptoms:
- version check fails
- tag alignment check fails

Action:
- fix version files first
- do not create or push the tag

### Tag already exists
Symptoms:
- local or remote tag conflict

Action:
- inspect prior release state
- do not force through blindly

### Release workflow failed
Symptoms:
- `release-local-runtime.yml` did not complete

Action:
- inspect workflow logs
- fix the root cause
- do not patch assets by hand

### npm publish failed
Symptoms:
- release assets exist
- npm version did not update

Action:
- inspect npm publish logs
- verify `NPM_TOKEN`
- reconcile release integrity before announcing success

### Installer resolves wrong release
Symptoms:
- GitHub Release exists
- installer still selects old tag or wrong asset

Action:
- inspect installer resolution logic
- verify tag naming and release visibility

---

## Quick command reminders

Validation:
- `node ./scripts/release/check-local-runtime-version.mjs --release-tag local-v<version>`
- `node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs <version> --dry-run`

Release helper:
- `node ./.agents/skills/atmos-local-release/scripts/atmos-local-release.mjs <version>`

Monitoring:
- `gh release view local-v<version>`
- `gh run list --workflow release-local-runtime.yml --limit 10`
- `gh run view --web`

npm:
- `npm view @atmos/local-web-runtime version`

Install path:
- `bash ./install-local-web-runtime.sh --version <version> --no-start`
- `npx @atmos/local-web-runtime --version <version> --no-start`

---

# Atmos Local Runtime Release Checklist

Use this as the concise maintainer checklist for an Atmos local runtime release.

Use this file for:
- pre-release review
- release sign-off
- quick recovery guidance

For post-release health checks, use `post-release-verification.md`.

---

## Release Contract

A correct Atmos local runtime release means these agree:

1. local runtime version file
2. local runtime tag
3. GitHub Release assets
4. R2 sync state
5. shell installer resolution behavior

If any layer disagrees, the release is not complete.

---

## Repository Conventions

- Tag format: `local-web-runtime-v<version>`
- Version file: `resources/local-runtime/version.json`
- Release workflow: `.github/workflows/release-local-runtime.yml`
- Runtime build script: `scripts/local-runtime/build-runtime.mjs`
- Version check script: `scripts/release/check-local-runtime-version.mjs`
- Installer entrypoint: `install-local-web-runtime.sh`

---

## Pre-Release Checklist

### Repository state
- [ ] On the intended release branch
- [ ] Working tree is clean, or any dirty state is intentional
- [ ] Recent release-relevant changes were reviewed
- [ ] No unrelated work is mixed into the release

### Version planning
- [ ] Target version is correct
- [ ] Version format is valid
- [ ] Intended tag is clear, for example `local-web-runtime-v0.1.0`
- [ ] `resources/local-runtime/version.json` version matches target version

### Access and secrets
- [ ] Push permission is available
- [ ] GitHub authentication works
- [ ] GitHub Actions release asset secrets are configured

---

## Version Consistency Checklist

Before tagging, confirm:

- [ ] `resources/local-runtime/version.json` version matches target version
- [ ] Release tag matches the same version

Typical commands:
- `node ./scripts/release/check-local-runtime-version.mjs --release-tag local-web-runtime-v<version>`
- `node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version> --dry-run`

Example for `0.1.0`:
- version file = `0.1.0`
- tag = `local-web-runtime-v0.1.0`

---

## Standard Release Checklist

### Prepare
- [ ] Dry run reviewed if needed
- [ ] Version checks passed
- [ ] Optional local runtime preflight build passed
- [ ] Diff reviewed

### Git actions
- [ ] `local-web-runtime-v<version>` tag created
- [ ] `local-web-runtime-v<version>` tag pushed

### Automation
- [ ] `release-local-runtime.yml` started
- [ ] `release-local-runtime.yml` passed
- [ ] GitHub Release was created or updated

### Distribution
- [ ] Expected runtime archives exist
- [ ] Archive names match intended version line
- [ ] R2 sync completed
- [ ] Shell installer resolves the intended release

---

## Minimum Artifact Checks

For version `0.1.0`, expect:

- `atmos-local-runtime-aarch64-apple-darwin.tar.gz`
- `atmos-local-runtime-x86_64-apple-darwin.tar.gz`
- `atmos-local-runtime-x86_64-unknown-linux-gnu.tar.gz`

Verify:
- [ ] all expected archives exist
- [ ] archives are attached to `local-web-runtime-v<version>`
- [ ] archive set matches supported targets

If tag and runtime assets disagree, stop and treat the release as invalid.

---

## Minimum Installer Checks

Verify:
- [ ] `install-local-web-runtime.sh` resolves the correct local release tag
- [ ] the public R2 URL for the requested version returns 200 after sync
- [ ] GitHub Release fallback remains available

If installer resolution is wrong, the distribution path is not healthy even if assets exist.

---

## Sign-Off Checklist

- [ ] version file matches
- [ ] tag matches version file
- [ ] GitHub Release exists
- [ ] expected runtime archives exist
- [ ] R2 sync completed
- [ ] shell installer resolves the release
- [ ] safe to announce or treat as complete

---

## Common Failure Cases

### Version mismatch
Symptoms:
- version check fails
- tag alignment check fails

Action:
- fix `resources/local-runtime/version.json` first
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

### R2 sync failed
Symptoms:
- GitHub Release assets exist
- `install.atmos.land` URLs still fail after sync should have completed

Action:
- inspect `.github/workflows/sync-r2.yml`
- retry sync after fixing the root cause
- verify public URL status

### Installer resolves wrong release
Symptoms:
- GitHub Release exists
- installer still selects old tag or wrong asset

Action:
- inspect installer resolution logic
- verify tag naming and release visibility

---

## Quick Command Reminders

Validation:
- `node ./scripts/release/check-local-runtime-version.mjs --release-tag local-web-runtime-v<version>`
- `node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version> --dry-run`

Release helper:
- `node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version>`

Monitoring:
- `gh release view local-web-runtime-v<version>`
- `gh run list --workflow release-local-runtime.yml --limit 10`
- `gh run view --web`

Install path:
- `bash ./install-local-web-runtime.sh --version <version> --no-start`

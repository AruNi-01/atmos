# Atmos Local Runtime Post-Release Verification

Use this reference only after a local runtime release exists and someone wants to verify whether it is actually healthy.

Use it for:
- release health checks
- runtime archive verification
- R2 sync verification
- installer resolution verification

Do not load this by default during normal release execution.

---

## Verification Contract

A local runtime release is fully verified only when these agree:

1. `local-web-runtime-v<version>` tag
2. GitHub Release
3. runtime archive set
4. public R2 URLs
5. real shell installer behavior

If one layer disagrees, the release is not fully verified.

---

## When To Use This

Use this reference when the user asks to:

- verify a release
- check whether `local-web-runtime-vX.Y.Z` is good
- confirm runtime archives
- confirm R2 sync
- confirm `install-local-web-runtime.sh`
- investigate why installers still resolve the wrong version

---

## Verification Levels

### Level 1: Release metadata
Use when the user only wants to know whether the release exists and looks correct.

Check:
- tag exists
- release exists
- release is under the correct tag
- release is prerelease only if intended

### Level 2: Release + public asset metadata
Use when the user wants to know whether GitHub Release assets and R2 are aligned.

Check:
- all Level 1 items
- release assets exist for all supported targets
- public R2 URLs return 200

### Level 3: Real installer verification
Use when the user wants confidence that users can actually install the local runtime.

Check:
- all Level 1 and Level 2 items
- `install-local-web-runtime.sh --version <version> --no-start`

---

## Core Checks

### 1. Confirm target
Identify:
- version, for example `0.1.0`
- tag, for example `local-web-runtime-v0.1.0`

Rule:
- tag must be `local-web-runtime-v<version>`

If the target is ambiguous, clarify first.

### 2. Verify GitHub Release
Confirm:
- release exists for the intended local runtime tag
- release was not created under the wrong tag
- release type is correct

Healthy:
- release exists
- tag is correct
- metadata is sensible

Fail:
- no release
- wrong tag
- wrong prerelease or stable status

### 3. Verify runtime archives
For version `0.1.0`, expect:

- `atmos-local-runtime-aarch64-apple-darwin.tar.gz`
- `atmos-local-runtime-x86_64-apple-darwin.tar.gz`
- `atmos-local-runtime-x86_64-unknown-linux-gnu.tar.gz`

Check:
- all expected archives exist
- archives are attached to the correct release
- archive names look correct for the supported targets

Fail if:
- one archive is missing
- assets are uploaded under the wrong release
- the asset set is incomplete

### 4. Verify R2 sync
Check:
- `https://install.atmos.land/local-web-runtime/<tag>/atmos-local-runtime-<target>.tar.gz`
- `https://install.atmos.land/local-web-runtime/latest/atmos-local-runtime-<target>.tar.gz` for latest stable releases

Fail if:
- R2 returns 404 after sync
- latest path points to the wrong stable release
- Cloudflare cache still serves stale 404 after a reasonable purge/expiry window

### 5. Verify shell installer
Run:
- `bash ./install-local-web-runtime.sh --version <version> --no-start`

Check:
- it resolves the intended release tag
- it selects the correct target archive
- it completes download and install preparation without choosing the wrong release

---

## Verdicts

### Verified
Use only when:
- release exists
- runtime archives are correct
- R2 URLs are reachable
- shell installer resolves the intended release

### Partially verified
Use when some layers are correct but not all were tested.

Examples:
- release assets exist, but installer was not tested
- release assets exist, but R2 sync was not checked

### Not verified
Use when a required layer is broken or inconsistent.

Examples:
- tag and version file mismatch
- missing runtime archive
- installer still resolves an old release
- R2 URL returns 404 after sync

---

## Reporting Template

# Atmos Local Runtime Release Verification

## Target
- Version:
- Tag:
- Verification level:

## Release
- Release exists:
- Tag correct:
- Release type correct:

## Runtime Archives
- arm64 macOS archive present:
- x64 macOS archive present:
- x64 Linux archive present:
- Archive verdict:

## R2
- Version URL status:
- Latest URL status:
- R2 verdict:

## Installer
- `install-local-web-runtime.sh` result:
- Installer verdict:

## Overall Verdict
- Verified / Partially verified / Not verified

## Notes
- Any gaps, failures, or follow-up actions

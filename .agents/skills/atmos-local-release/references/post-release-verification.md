# Atmos Local Runtime Post-Release Verification

Use this reference only after a local runtime release exists and someone wants to verify whether it is actually healthy.

Use it for:
- release health checks
- runtime archive verification
- npm package verification
- installer resolution verification

Do not load this by default during normal release execution.

---

## Verification contract

A local runtime release is fully verified only when these agree:

1. `local-v<version>` tag
2. GitHub Release
3. runtime archive set
4. npm package version
5. real installer behavior

If one layer disagrees, the release is not fully verified.

---

## When to use this

Use this reference when the user asks to:

- verify a release
- check whether `local-vX.Y.Z` is good
- confirm runtime archives
- confirm npm publish
- confirm `install.sh`
- confirm `npx @atmos/local` or `bunx @atmos/local`
- investigate why installers still resolve the wrong version

---

## Verification levels

### Level 1: Release metadata
Use when the user only wants to know whether the release exists and looks correct.

Check:
- tag exists
- release exists
- release is under the correct tag
- release is prerelease only if intended

### Level 2: Release + npm metadata
Use when the user wants to know whether the GitHub Release and npm package are aligned.

Check:
- all Level 1 items
- npm version is correct
- release assets exist for all supported targets

### Level 3: Real installer verification
Use when the user wants confidence that users can actually install the local runtime.

Check:
- all Level 1 and Level 2 items
- `install.sh --version <version> --no-start`
- `npx @atmos/local --version <version> --no-start`

---

## Core checks

### 1. Confirm target
Identify:
- version, for example `0.1.0`
- tag, for example `local-v0.1.0`

Rule:
- tag must be `local-v<version>`

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

### 4. Verify npm publish
Check:
- npm package exists
- version matches the local runtime version
- npm publish did not stop on an older version

Fail if:
- npm is missing the target version
- npm version differs from the release tag version

### 5. Verify shell installer
Run:
- `bash ./install.sh --version <version> --no-start`

Check:
- it resolves the intended release tag
- it selects the correct target archive
- it completes download and install preparation without choosing the wrong release

### 6. Verify npm installer
Run:
- `npx @atmos/local --version <version> --no-start`

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
- npm version is correct
- installer entrypoints resolve the intended release

### Partially verified
Use when some layers are correct but not all were tested.

Examples:
- release and npm version look correct, but installers were not tested
- release assets exist, but npm publish was not checked

### Not verified
Use when a required layer is broken or inconsistent.

Examples:
- tag and npm version mismatch
- missing runtime archive
- installer still resolves an old release

---

## Reporting template

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

## npm
- Package version:
- Version matches tag:
- npm verdict:

## Installers
- `install.sh` result:
- `npx @atmos/local` result:
- Installer verdict:

## Overall Verdict
- Verified / Partially verified / Not verified

## Notes
- Any gaps, failures, or follow-up actions


# Atmos Desktop Post-Release Verification

Use this reference only after a release exists and someone wants to verify whether it is actually healthy.

Use it for:
- release health checks
- DMG verification
- tap sync verification
- Homebrew install/upgrade verification

Do not load this by default during normal release execution.

---

## Verification contract

A release is fully verified only when these agree:

1. `desktop-v<version>` tag
2. GitHub Release
3. DMG filenames and versions
4. Homebrew tap metadata
5. real install behavior

If one layer disagrees, the release is not fully verified.

---

## When to use this

Use this reference when the user asks to:

- verify a release
- check whether `desktop-vX.Y.Z` is good
- confirm DMG assets
- confirm tap sync
- confirm Homebrew install or upgrade behavior
- investigate why Homebrew still installs the wrong version

---

## Verification levels

### Level 1: Release metadata
Use when the user only wants to know whether the release exists and looks correct.

Check:
- tag exists
- release exists
- release is under the correct tag
- release is prerelease only if intended

### Level 2: Release + tap metadata
Use when the user wants to know whether release and Homebrew metadata are aligned.

Check:
- all Level 1 items
- tap sync workflow succeeded
- cask updated
- cask points at the intended release assets

### Level 3: Real install verification
Use when the user wants confidence that users can actually install or upgrade.

Check:
- all Level 1 and Level 2 items
- `brew install --cask AruNi-01/tap/atmos`
- `brew upgrade --cask atmos`

---

## Core checks

### 1. Confirm target
Identify:
- version, for example `0.2.1`
- tag, for example `desktop-v0.2.1`

Rule:
- tag must be `desktop-v<version>`

If the target is ambiguous, clarify first.

### 2. Verify GitHub Release
Confirm:
- release exists for the intended desktop tag
- release was not created under the wrong tag
- release type is correct

Healthy:
- release exists
- tag is correct
- metadata is sensible

Fail:
- no release
- wrong tag
- wrong prerelease/stable status

### 3. Verify macOS artifacts
For version `0.2.1`, expect:

- `Atmos_0.2.1_aarch64.dmg`
- `Atmos_0.2.1_x64.dmg`

Check:
- both DMGs exist
- both DMGs use the same version
- DMG version matches tag version
- assets are attached to the correct release

Fail if:
- one DMG is missing
- DMG version is old
- arm and x64 versions differ
- tag and DMG version differ

### 4. Verify tap sync
Target workflow:
- `.github/workflows/sync-homebrew-tap.yml`

Check:
- workflow ran
- workflow passed
- it ran for the intended desktop tag

Fail if:
- workflow never triggered
- workflow failed
- tap repo was not updated

### 5. Verify tap contents
Target repo:
- `AruNi-01/homebrew-tap`

Target file:
- `Casks/atmos.rb`

Check:
- cask was updated
- cask points at intended `desktop-v<version>`
- cask asset version matches intended DMG version
- checksums were updated

Fail if:
- cask still points to old release
- cask points to new tag but old DMG version
- cask metadata and release assets disagree

### 6. Verify install path
Run:
- `brew install --cask AruNi-01/tap/atmos`

Check:
- install resolves successfully
- correct asset is downloaded
- installed app corresponds to intended version

### 7. Verify upgrade path
Run if relevant:
- `brew upgrade --cask atmos`

Check:
- Homebrew sees the update
- upgrade resolves to intended version
- upgraded app is correct

---

## Verdicts

### Verified
Use only when:
- release exists
- DMGs are correct
- tap sync succeeded
- cask is correct
- install path works

### Partially verified
Use when some layers are correct but not all were tested.

Examples:
- release and DMGs look correct, but install not tested
- release and tap are correct, but upgrade not tested

### Not verified
Use when a required layer is broken or inconsistent.

Examples:
- tag and DMG version mismatch
- tap sync failed
- cask still points at old release
- install path fails

---

## Reporting template

# Atmos Desktop Release Verification

## Target
- Version:
- Tag:
- Verification level:

## Release
- Release exists:
- Tag correct:
- Release type correct:

## Artifacts
- arm64 DMG present:
- x64 DMG present:
- DMG versions match tag:
- Artifact verdict:

## Tap
- Tap sync passed:
- Cask updated:
- Cask points at intended release:
- Tap verdict:

## Install
- Install verified:
- Upgrade verified:
- Installed version correct:

## Overall verdict
- Verified / Partially verified / Not verified

## Follow-up
- [action 1]
- [action 2]

---

## Common investigations

### Release exists, but Homebrew installs old version
Check in this order:
1. release assets
2. tap sync workflow
3. cask contents
4. install path directly

### Tag is correct, but DMG is wrong
Treat as release integrity failure.
Check whether:
- the release was built from the correct commit
- the version bump was present in the tagged ref

### Tap sync failed, but release is good
Treat as downstream distribution failure.
Check:
- workflow logs
- credentials
- tap repo update result

### Cask updated, but install still looks wrong
Check:
- release asset names
- cask target URL
- cask asset version
- whether local metadata is stale

---

## Things not to do

- do not mark a release verified just because a GitHub Release exists
- do not skip checking both macOS DMGs
- do not assume tap sync happened just because release succeeded
- do not assume install is correct just because the cask changed
- do not hand-edit downstream metadata to hide a broken release

---

## Final rule

For Atmos desktop, verification passes only when:

- tag is correct
- release is correct
- DMG versions are correct
- tap metadata is correct
- install behavior is correct
# Desktop Release Runbook

This runbook describes the standard process for cutting, validating, publishing, and recovering an Atmos desktop release.

It is intended to keep these four things aligned:

- desktop version files in the repository
- Git tag version
- packaged desktop artifact version
- Homebrew cask metadata in the shared tap

---

## Scope

This runbook covers:

- version bumping for the desktop app
- desktop release tagging
- GitHub Actions release execution
- Homebrew tap synchronization
- manual verification
- common recovery paths

It does not define full production deployment for the web app or standalone API hosting.

---

## Release Model

Atmos desktop releases follow this model:

1. update the desktop version in repository files
2. validate all desktop version sources are in sync
3. create a desktop release tag in the format `desktop-v<version>`
4. let CI build artifacts from that exact ref
5. publish GitHub Release assets
6. sync the shared Homebrew tap from the published release

Example:

- desktop version: `0.2.1`
- release tag: `desktop-v0.2.1`
- expected macOS artifacts:
  - `Atmos_0.2.1_aarch64.dmg`
  - `Atmos_0.2.1_x64.dmg`

---

## Source of Truth

The desktop version must stay synchronized across:

- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/package.json`

The release tag must also match that same version:

- `desktop-v<version>`

If any of these differ, the release should be treated as invalid and blocked before packaging.

---

## Required Access and Secrets

Before running a release, confirm the following are configured.

### Repository permissions

You need permission to:

- push commits
- create and push tags
- trigger GitHub Actions workflows
- inspect release artifacts and workflow logs

### Required secrets

#### Homebrew tap sync

The shared Homebrew tap sync requires:

- `HOMEBREW_TAP_PAT`

This token must be able to push changes to:

- `AruNi-01/homebrew-tap`

Without it:

- the desktop release may still succeed
- the Homebrew tap will not update automatically

#### Desktop signing

Depending on signing strategy, desktop release may require:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `APPLE_SIGNING_IDENTITY`

If these are missing or invalid, release packaging may fail or produce unsigned artifacts.

---

## Pre-Release Checklist

Before creating a release, verify all of the following:

- the working branch contains the intended desktop changes
- desktop version files reflect the intended release version
- release notes or changelog are ready if needed
- GitHub Actions secrets are available
- there is no accidental version drift from prior work
- you know whether this is a stable release or prerelease

Recommended quick checks:

- confirm local branch is correct
- confirm no unrelated work is mixed into the release commit
- confirm the next version number is intentional

---

## Standard Release Procedure

### 1. Choose the release version

Pick the next version, for example:

```text
0.2.1
```

Use the same version in:

- Cargo manifest
- Tauri config
- desktop package metadata
- release tag

---

### 2. Preview the version bump

Run a dry-run first:

```bash
just bump-desktop-version 0.2.1 --dry-run
```

This should report the desktop files that will be updated.

If the output is not what you expect, stop here and inspect the current version state.

---

### 3. Apply the version bump

Run:

```bash
just bump-desktop-version 0.2.1
```

This should update:

- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/package.json`

---

### 4. Verify version consistency

Run:

```bash
just check-desktop-version
```

Expected result:

- all desktop version sources are in sync
- reported version matches the intended release version

If this check fails, do not continue to tagging.

---

### 5. Review the diff

Inspect the version bump and any other included changes.

Make sure:

- only intended release changes are included
- version bump is correct
- no accidental reversions or unrelated modifications slipped in

Recommended focus areas:

- version files
- release workflow files if recently changed
- Homebrew-related scripts if this release also changes distribution behavior

---

### 6. Commit the release changes

Commit the version bump and any intended release-related changes using your normal Git workflow.

Example commit message:

```text
chore(desktop): release 0.2.1
```

---

### 7. Push the release commit

Push the commit to the target branch.

This ensures the release tag points at a commit already available on the remote.

---

### 8. Create the desktop release tag

Create the tag:

```bash
git tag desktop-v0.2.1
```

Push the tag:

```bash
git push origin desktop-v0.2.1
```

Important:

- do not use a plain `v0.2.1` tag for desktop release flow
- do not create a `desktop-v*` tag before version files are updated and committed

---

### 9. Monitor the desktop release workflow

After pushing the tag, the desktop release workflow should start automatically.

Workflow:

- `release-desktop.yml`

Key things it should validate:

- desktop version files are in sync
- release tag matches the desktop version
- packaging runs from the exact tagged ref

Key outputs to watch for:

- macOS arm64 DMG
- macOS x64 DMG
- updater metadata if enabled
- GitHub Release publication

Expected macOS artifact names:

```text
Atmos_0.2.1_aarch64.dmg
Atmos_0.2.1_x64.dmg
```

If the DMG names do not match the intended version, treat the release as broken.

---

### 10. Confirm GitHub Release contents

After the workflow finishes, verify the release page for `desktop-v0.2.1`.

Check that:

- release exists
- both macOS DMG files are present
- DMG names use the correct version
- asset upload completed successfully
- no unexpected duplicate or stale assets are present

For Homebrew sync, the two most important files are:

- `Atmos_0.2.1_aarch64.dmg`
- `Atmos_0.2.1_x64.dmg`

---

### 11. Monitor Homebrew tap synchronization

Once the release is published, the tap sync workflow should run.

Workflow:

- `sync-homebrew-tap.yml`

It should:

1. resolve the release tag
2. read published release metadata
3. generate `Casks/atmos.rb`
4. update `AruNi-01/homebrew-tap`
5. commit and push the tap update

Expected result in the shared tap:

- `README.md` updated if needed
- `Casks/atmos.rb` updated to reference the new release

---

### 12. Verify Homebrew installation flow

After tap sync completes, manually verify the install path.

Recommended checks:

```bash
brew install --cask AruNi-01/tap/atmos
```

Then, if already installed:

```bash
brew upgrade --cask atmos
```

Also verify:

- app installs successfully
- app opens correctly
- installed version matches expected release
- uninstall and reinstall behavior is normal if you choose to test cleanup

Optional uninstall test:

```bash
brew uninstall --cask atmos
```

---

## Manual Dispatch Procedure

There are cases where you may want to trigger a release workflow manually instead of relying on a tag push.

### Use cases

- validating a ref before final release
- rebuilding from a specific commit
- rerunning a release attempt with explicit parameters

### Inputs to supply

For manual desktop release execution, provide:

- `ref`: branch, tag, or commit SHA
- `create_release`: whether to publish a GitHub Release
- `release_tag`: required if `create_release=true`
- `prerelease`: whether the release should be marked as a prerelease

### Important rule

If `create_release=true`, the `release_tag` must still match the desktop version embedded in the repository files for that ref.

Example:

- ref contains desktop version `0.2.1`
- release tag must be `desktop-v0.2.1`

Not:

- ref contains `0.2.1`
- release tag is `desktop-v0.2.2`

That should fail validation.

---

## Prerelease Procedure

For prereleases such as release candidates:

- use a semver-compatible prerelease version
- keep the same synchronization rules

Example:

- desktop version: `0.5.0-rc.1`
- release tag: `desktop-v0.5.0-rc.1`

Process is the same:

1. bump version
2. validate sync
3. create matching `desktop-v*` tag
4. let release workflow run
5. verify assets
6. verify tap behavior if prereleases are intended to sync there

Before using prerelease tags in tap sync, confirm that this matches your release policy.

---

## Recovery Procedures

### Scenario 1: version mismatch detected before packaging

Symptoms:

- desktop version check fails
- release workflow exits before build

Typical causes:

- one of the desktop version files was not updated
- release tag does not match repository version
- manual edits drifted files apart

Recovery:

1. inspect the versions in:
   - `apps/desktop/src-tauri/Cargo.toml`
   - `apps/desktop/src-tauri/tauri.conf.json`
   - `apps/desktop/package.json`
2. fix the version mismatch
3. rerun:
   ```bash
   just check-desktop-version
   ```
4. if the tag is wrong and has not been used publicly, correct the tag strategy before retrying
5. rerun the release process

---

### Scenario 2: release assets built with the wrong version

Symptoms:

- tag looks correct
- DMG names still contain an old version
- Homebrew cask would point to inconsistent assets

Typical causes:

- release was built from the wrong ref
- version bump was not included in the tagged commit
- an old commit was packaged

Recovery:

1. identify the exact commit used by the release
2. verify the version files in that commit
3. create a corrected commit if needed
4. cut a new correct release tag
5. do not continue syncing an incorrect cask

Preferred approach:

- publish a clean follow-up release with the correct version
- avoid hand-editing cask metadata to paper over a broken release

---

### Scenario 3: desktop release succeeded but tap sync failed

Symptoms:

- GitHub Release exists
- DMG assets are present
- Homebrew tap did not update

Typical causes:

- `HOMEBREW_TAP_PAT` missing
- token lacks write permission
- tap sync workflow failed during push
- transient GitHub Actions failure

Recovery:

1. verify `HOMEBREW_TAP_PAT` exists
2. verify it can push to `AruNi-01/homebrew-tap`
3. rerun the tap sync workflow manually
4. provide the existing release tag, for example:
   - `desktop-v0.2.1`
5. confirm the updated cask lands in the tap repo

Do not create a new desktop release solely to repair a tap sync failure if the original release assets are already correct.

---

### Scenario 4: GitHub Release exists but is incomplete

Symptoms:

- only one macOS DMG uploaded
- release published without expected assets
- updater metadata missing when expected

Recovery:

1. inspect workflow logs to identify which matrix job failed
2. determine whether rerun is sufficient
3. if artifacts are incomplete or inconsistent, avoid syncing Homebrew until the release is complete
4. rerun the failed release workflow or create a corrected new release as appropriate

The Homebrew path should only be updated from a complete and valid desktop release.

---

### Scenario 5: Homebrew installs an older build than expected

Symptoms:

- release tag is new
- cask appears updated
- installed app still reports an old version

Potential causes:

- stale local Homebrew metadata
- release asset mismatch
- app bundle version inside DMG not aligned with tag
- local cache behavior

Recovery steps:

1. inspect the release asset names directly
2. confirm the cask points at the expected release
3. refresh local Homebrew metadata
4. reinstall from the tap
5. if necessary, inspect the installed app version manually

If the DMG name and internal bundle version disagree, treat it as a release integrity issue.

---

## Validation Checklist

Use this as a concise release sign-off list.

### Repository state

- [ ] desktop version chosen
- [ ] dry-run bump looked correct
- [ ] desktop version bump applied
- [ ] version consistency check passed
- [ ] release diff reviewed
- [ ] release commit pushed

### Tag and workflow

- [ ] `desktop-v<version>` tag created
- [ ] tag pushed to remote
- [ ] desktop release workflow started
- [ ] desktop release workflow passed

### Release artifacts

- [ ] GitHub Release exists
- [ ] arm64 macOS DMG uploaded
- [ ] x64 macOS DMG uploaded
- [ ] DMG filenames use the intended version
- [ ] no obvious stale or broken artifacts

### Homebrew

- [ ] tap sync workflow ran
- [ ] shared tap updated
- [ ] `Casks/atmos.rb` references the intended release
- [ ] Homebrew install works
- [ ] Homebrew upgrade works

---

## Operational Rules

Follow these rules consistently:

1. Never create a `desktop-v*` tag before desktop versions are synchronized.
2. Never treat the tag as the only source of truth.
3. Never hand-edit the tap to point at a release whose assets are inconsistent.
4. Prefer rerunning automation over making ad hoc release metadata changes.
5. If packaging is wrong, fix the release; do not hide the mismatch downstream.

---

## Quick Commands

### Dry-run version bump

```bash
just bump-desktop-version 0.2.1 --dry-run
```

### Apply version bump

```bash
just bump-desktop-version 0.2.1
```

### Check desktop version sync

```bash
just check-desktop-version
```

### Create release tag

```bash
git tag desktop-v0.2.1
git push origin desktop-v0.2.1
```

### Homebrew install

```bash
brew install --cask AruNi-01/tap/atmos
```

### Homebrew upgrade

```bash
brew upgrade --cask atmos
```

---

## Example End-to-End Release

Example for `0.2.1`:

1. run:
   ```bash
   just bump-desktop-version 0.2.1 --dry-run
   ```
2. apply:
   ```bash
   just bump-desktop-version 0.2.1
   ```
3. validate:
   ```bash
   just check-desktop-version
   ```
4. commit and push the version bump
5. tag:
   ```bash
   git tag desktop-v0.2.1
   git push origin desktop-v0.2.1
   ```
6. wait for desktop release workflow to finish
7. verify release assets:
   - `Atmos_0.2.1_aarch64.dmg`
   - `Atmos_0.2.1_x64.dmg`
8. wait for tap sync workflow to finish
9. verify:
   ```bash
   brew install --cask AruNi-01/tap/atmos
   ```

---

## Related Documents

- `README.md`
- `README.zh-CN.md`
- `docs/deployment.md`
- `.github/workflows/release-desktop.yml`
- `.github/workflows/sync-homebrew-tap.yml`
- `scripts/release/bump-desktop-version.mjs`
- `scripts/release/check-desktop-version.mjs`
- `scripts/homebrew/generate-cask.mjs`

---

## Summary

The correct Atmos desktop release flow is:

- bump version
- verify sync
- tag with `desktop-v<version>`
- build from that exact versioned ref
- publish release assets
- sync the shared Homebrew tap
- verify installation

If this order is followed consistently, first-time Homebrew installation, release artifacts, and shared tap metadata should remain aligned.
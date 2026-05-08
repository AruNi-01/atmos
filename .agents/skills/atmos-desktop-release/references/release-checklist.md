# Atmos Desktop Release Checklist

Use this as the concise maintainer checklist for an Atmos desktop release.

Use this file for:
- pre-release review
- release sign-off
- quick recovery guidance

Do not use this as the default verification reference after release publication. For that, use `post-release-verification.md`.

---

## Release contract

A correct Atmos desktop release means these agree:

1. desktop version files
2. desktop tag
3. GitHub Release assets
4. Homebrew tap metadata

If any layer disagrees, the release is not complete.

---

## Repository conventions

- Tag format: `desktop-v<version>`
- Version files:
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/tauri.conf.json`
  - `apps/desktop/package.json`
- Release workflow:
  - `.github/workflows/release-desktop.yml`
- Tap sync workflow:
  - `.github/workflows/sync-homebrew-tap.yml`
- Shared tap:
  - `AruNi-01/homebrew-tap`

---

## Pre-release checklist

### Repository state
- [ ] On the intended release branch
- [ ] Working tree is clean, or any dirty state is intentional
- [ ] Recent commits were reviewed
- [ ] No unrelated work is mixed into the release

### Version planning
- [ ] Target version is correct
- [ ] Version format is valid
- [ ] Intended tag is clear, for example `desktop-v0.2.1`

### Secrets and access
- [ ] Push permission is available
- [ ] GitHub authentication works
- [ ] Required secrets are configured
- [ ] `HOMEBREW_TAP_PAT` is available if tap sync must succeed

---

## Version consistency checklist

Before tagging, confirm all of the following:

- [ ] `Cargo.toml` version matches target version
- [ ] `tauri.conf.json` version matches target version
- [ ] `apps/desktop/package.json` version matches target version
- [ ] Release tag matches the same version

Typical commands:
- `just bump-desktop-version <version>`
- `just check-desktop-version`
- `node ./scripts/release/check-desktop-version.mjs --release-tag desktop-v<version>`

Example for `0.2.1`:
- files = `0.2.1`
- tag = `desktop-v0.2.1`

---

## Standard release checklist

### Prepare
- [ ] Dry run reviewed if needed
- [ ] Version bump applied
- [ ] Version checks passed
- [ ] Diff reviewed

### Git actions
- [ ] Release-prep commit created
- [ ] Release-prep commit pushed
- [ ] `desktop-v<version>` tag created
- [ ] `desktop-v<version>` tag pushed

### Automation
- [ ] `release-desktop.yml` started
- [ ] `release-desktop.yml` passed
- [ ] GitHub Release was created
- [ ] `sync-homebrew-tap.yml` started
- [ ] `sync-homebrew-tap.yml` passed

### Distribution
- [ ] macOS DMGs exist
- [ ] DMG names match intended version
- [ ] Shared tap updated
- [ ] Homebrew install path verified if required

---

## Minimum artifact checks

For version `0.2.1`, expect:

- `Atmos_0.2.1_aarch64.dmg`
- `Atmos_0.2.1_x64.dmg`

Verify:
- [ ] both DMGs exist
- [ ] both DMGs use the same version
- [ ] DMG version matches the tag version
- [ ] assets are attached to the correct release

If tag and DMG version disagree, stop and treat the release as invalid.

---

## Minimum tap checks

Verify:
- [ ] tap sync workflow succeeded
- [ ] `Casks/atmos.rb` was updated
- [ ] cask points at the intended `desktop-v<version>` release
- [ ] cask asset version matches the intended DMG version

If release assets and cask metadata disagree, Homebrew distribution is not valid.

---

## Sign-off checklist

- [ ] Version files match
- [ ] Tag matches version files
- [ ] GitHub Release exists
- [ ] DMG filenames match release version
- [ ] Tap sync succeeded
- [ ] Tap metadata matches release
- [ ] Safe to announce or treat as complete

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
- `release-desktop.yml` did not complete

Action:
- inspect workflow logs
- fix the root cause
- do not patch downstream metadata by hand

### Tap sync failed
Symptoms:
- release exists
- tap did not update

Action:
- verify tap credentials
- inspect tap sync logs
- rerun tap sync if the release itself is valid

### Wrong DMG version
Symptoms:
- tag is correct
- DMG version is old or inconsistent

Action:
- treat as release integrity failure
- prefer a corrective follow-up release

---

## Rollback guidance

Be conservative. A desktop tag may already have triggered:
- GitHub Release publication
- DMG publication
- tap sync
- updater metadata publication

Prefer a corrective follow-up release if public artifacts already exist.

Only consider destructive rollback if:
- the release did not fully escape
- downstream systems were not updated
- deleting tag/release is clearly safe

---

## Quick command reminders

Release prep:
- `just bump-desktop-version <version>`
- `just check-desktop-version`
- `node ./scripts/release/check-desktop-version.mjs --release-tag desktop-v<version>`

Release helper:
- `just release-desktop <version>`
- `just release-desktop-dry-run <version>`

Monitoring:
- `gh release view desktop-v<version>`
- `gh run list --limit 10`
- `gh run view --web`

Homebrew:
- `brew install --cask AruNi-01/tap/atmos`
- `brew upgrade --cask atmos`

---

## Final rule

For Atmos desktop, release correctness means:

- version files match
- `desktop-v<version>` tag matches
- DMG artifact version matches
- Homebrew cask metadata matches

If they do not all match, the release is not complete.
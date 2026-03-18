# Deployment Guide

This document describes how Atmos is released and distributed across the main deployment surfaces, with a focus on the desktop release workflow and Homebrew tap synchronization.

---

## Overview

Atmos currently has three primary distribution surfaces:

1. **Web application** — deployed separately from the desktop app
2. **API server** — Rust backend deployment
3. **Desktop application** — packaged with Tauri and distributed through GitHub Releases and Homebrew Cask

For the Homebrew-first desktop installation flow, the source of truth is:

- a desktop Git tag: `desktop-v<version>`
- matching desktop version files in the repo
- GitHub Release assets generated from that exact version
- a synchronized cask in the shared tap repository

---

## Web Application

The web app is built from `apps/web` and can be deployed independently of the desktop release flow.

Typical concerns:

- build the Next.js app
- provide environment variables for the frontend
- connect to the correct API endpoint
- verify WebSocket connectivity in the target environment

This guide does not define a single production host for the web app yet, but the desktop release workflow assumes the web bundle and API-side desktop assets are prepared as part of the desktop packaging process.

---

## API Server

The API server is the Rust backend and can be deployed independently.

Typical concerns:

- build the Rust binary
- configure runtime environment variables
- ensure filesystem access, local data paths, and tmux availability where required
- expose the required HTTP and WebSocket endpoints

For local desktop packaging, the API is built as a sidecar and bundled into the desktop app rather than deployed as a standalone service.

---

## Desktop App

The desktop app is the most structured deployment path in the repository today.

### Distribution model

Atmos Desktop is distributed through:

- **GitHub Releases** in `AruNi-01/atmos`
- **Homebrew Cask** in the shared tap repository `AruNi-01/homebrew-tap`

Users install with either:

```bash
brew install --cask AruNi-01/tap/atmos
```

or:

```bash
brew tap AruNi-01/tap
brew install --cask atmos
```

### Release artifact expectations

A valid desktop release should produce assets with names like:

```text
Atmos_0.2.1_aarch64.dmg
Atmos_0.2.1_x64.dmg
```

The release tag should match the desktop version:

```text
desktop-v0.2.1
```

The important rule is that the tag version and packaged app version must stay aligned.

---

## Desktop Version Source of Truth

The desktop version is intentionally kept synchronized across these files:

- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/package.json`

### Version bump workflow

Use the repository script or `just` command to bump the desktop version in one place:

```bash
just bump-desktop-version 0.2.1
```

You can preview the change without writing files:

```bash
just bump-desktop-version 0.2.1 --dry-run
```

### Version consistency check

Before a release, verify that all desktop version files are aligned:

```bash
just check-desktop-version
```

The release workflow also validates the release tag against these files, so a mismatch such as:

- `desktop-v0.2.1`
- packaged app version `0.2.0`

will fail before packaging continues.

---

## GitHub Actions Workflows

### `release-desktop.yml`

This workflow is responsible for desktop CI and release packaging.

It supports:

- pull request smoke validation
- tag-based desktop releases
- manual workflow dispatch for controlled release builds

#### Trigger modes

1. **Pull request**
   - runs a Linux smoke build
   - validates desktop code still builds without producing release bundles

2. **Tag push**
   - triggered by tags matching `desktop-v*`
   - treats the pushed tag as the release tag
   - checks out the exact tagged commit

3. **Manual dispatch**
   - supports building a specified ref
   - can optionally create a GitHub Release
   - requires `release_tag` when `create_release=true`

#### What it validates

Before building release artifacts, the workflow checks:

- all desktop version files are in sync
- the release tag matches the desktop version
- the exact requested ref is what gets packaged

This prevents the historical failure mode where the release tag and DMG version drift apart.

#### Build matrix

Desktop release builds currently target:

- macOS Apple Silicon
- macOS Intel
- Linux
- Windows

For Homebrew sync, the important outputs are the two macOS DMG files.

---

### `sync-homebrew-tap.yml`

This workflow updates the shared Homebrew tap after a desktop release is published.

#### Trigger modes

1. **Release published**
   - runs automatically for release events
   - only proceeds for tags starting with `desktop-v`

2. **Manual dispatch**
   - requires a `release_tag`
   - useful for re-syncing the tap for an existing desktop release

#### What it does

The workflow:

1. resolves the desktop release tag
2. checks out the source repository
3. generates the cask from the published release metadata
4. generates the tap README
5. checks out `AruNi-01/homebrew-tap`
6. copies the generated files into the tap repo
7. commits and pushes the tap update

#### Important implementation details

- The cask is generated from release metadata instead of being handwritten inline
- The workflow updates only the expected files instead of deleting the entire `Casks/` directory
- The cask points at the GitHub Release DMG assets using the desktop tag and DMG asset version

This makes the tap sync safer and easier to reuse for future apps.

---

## Shared Homebrew Tap

Atmos uses a shared tap repository:

```text
AruNi-01/homebrew-tap
```

This is intentional so multiple desktop applications can eventually share the same tap.

### Tap contents

The tap currently includes:

- `README.md`
- `Casks/atmos.rb`

### Installation UX

Recommended one-line install:

```bash
brew install --cask AruNi-01/tap/atmos
```

Alternative two-step install:

```bash
brew tap AruNi-01/tap
brew install --cask atmos
```

---

## Required Secrets

### `HOMEBREW_TAP_PAT`

The tap sync workflow requires a GitHub token secret named:

```text
HOMEBREW_TAP_PAT
```

This secret must allow pushing changes to:

```text
AruNi-01/homebrew-tap
```

Without this secret, the desktop release can still succeed, but the shared tap will not update automatically.

### Desktop signing secrets

The desktop release workflow may also rely on signing-related secrets such as:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `APPLE_SIGNING_IDENTITY`

Exact use depends on the target platform and signing strategy.

---

## Standard Desktop Release Procedure

Use this checklist when cutting a new desktop release.

### 1. Pick the next version

Example:

```text
0.2.1
```

### 2. Bump desktop version files

```bash
just bump-desktop-version 0.2.1
```

Optional preview:

```bash
just bump-desktop-version 0.2.1 --dry-run
```

### 3. Verify version consistency

```bash
just check-desktop-version
```

### 4. Commit the version bump

Use your normal Git workflow to commit the version change.

### 5. Create and push the desktop tag

```bash
git tag desktop-v0.2.1
git push origin desktop-v0.2.1
```

### 6. Let `release-desktop.yml` build and publish assets

Expected macOS outputs:

```text
Atmos_0.2.1_aarch64.dmg
Atmos_0.2.1_x64.dmg
```

### 7. Let `sync-homebrew-tap.yml` update the shared tap

Expected result:

- `AruNi-01/homebrew-tap/Casks/atmos.rb` points to the new release
- users can install or upgrade through Homebrew

### 8. Verify installation manually

Recommended checks:

```bash
brew install --cask AruNi-01/tap/atmos
brew upgrade --cask atmos
```

Also verify that the installed app version matches the intended release.

---

## Manual Recovery Procedure

If the desktop release succeeded but the tap sync did not:

1. ensure `HOMEBREW_TAP_PAT` is configured correctly
2. rerun `sync-homebrew-tap.yml` manually
3. provide the existing tag, for example:

```text
desktop-v0.2.1
```

Because the cask is generated from release metadata, rerunning the workflow should reconstruct the expected cask file as long as the release assets are valid.

---

## Failure Modes to Watch For

### 1. Tag/version mismatch

Example:

- tag: `desktop-v0.2.1`
- `Cargo.toml`: `0.2.0`

Result:

- release workflow should fail during version validation

### 2. DMG asset naming mismatch

Example:

- release tag says `0.2.1`
- generated DMG still uses `0.2.0`

Result:

- Homebrew cask generation becomes inconsistent
- users may see confusing install behavior

This is exactly why tag validation and synchronized version bumping are now part of the release process.

### 3. Missing tap token

If `HOMEBREW_TAP_PAT` is missing or lacks write access:

- release artifacts may still publish
- tap sync will fail
- Homebrew users will not receive the new cask automatically

### 4. Releasing from the wrong commit

If packaging is run from a ref that does not contain the intended version bump:

- the generated app bundle version may drift from the tag

The release workflow reduces this risk by resolving and checking out the explicit release ref.

---

## Recommended Operational Policy

For desktop releases, follow these rules consistently:

1. Treat the desktop version as a synchronized value across Cargo, Tauri config, and package metadata
2. Never create a `desktop-v*` release tag without first bumping and verifying the desktop version
3. Let the GitHub Release be the source of packaged artifact truth
4. Let the shared Homebrew tap mirror the published release, not an independently edited cask
5. Prefer rerunning workflows over hand-editing the tap when recovering from release issues

---

## Future Improvements

Possible next steps for this deployment workflow:

- add a dedicated release runbook in `docs/`
- add a single command or script to orchestrate bump + check + tag creation
- expand the shared Homebrew tap to support multiple desktop applications
- add post-release verification automation for DMG naming and Homebrew install health

---

## Summary

The current desktop deployment model is:

- **version bump first**
- **validate versions**
- **tag with `desktop-v<version>`**
- **build release artifacts from that exact ref**
- **sync the shared Homebrew tap from published release metadata**

That flow is designed to keep:

- repo version files
- GitHub release tags
- packaged DMG names
- Homebrew cask metadata

fully consistent.
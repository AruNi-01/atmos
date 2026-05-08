# Atmos Release Guide

> This document explains the complete Atmos release model: what the CLI, Local Runtime, and Desktop release lines are, how to use them, what each workflow publishes, how to test the real release path, and how to verify a release afterwards.

---

## Release Model

Atmos has three independent release lines:

| Release line | Tag | GitHub Actions | Artifacts | Purpose |
| --- | --- | --- | --- | --- |
| CLI | `cli-v<version>` | `.github/workflows/release-cli.yml` | `atmos-cli-<target>.tar.gz` | Standalone `atmos` command, used as the control plane for agents and scripts |
| Local Runtime | `local-web-runtime-v<version>` | `.github/workflows/release-local-runtime.yml` | `atmos-local-runtime-<target>.tar.gz` + `@atmos/local-web-runtime` | Local Web runtime package containing API, static Web assets, system skills, and a bundled CLI |
| Desktop | `desktop-v<version>` | `.github/workflows/release-desktop.yml` | Tauri desktop installers and updater manifest | Desktop application distribution |

Core principles:

- CLI is an independent control plane that can be called by agents, Desktop, and Local Runtime.
- Local Runtime and Desktop may bundle the CLI, but they do not own the CLI release cadence.
- The three release lines do not need to share the same version number.
- Local Runtime records `bundled_cli_version`; Desktop records a bundled CLI manifest for traceability.
- Stable tag-based releases must come from a commit already contained in `origin/main`.
- Use workflow dispatch plus prerelease for real release-path testing from non-main branches.

---

## Stable vs Test Releases

### Stable Release

Stable releases use stable tags:

```bash
cli-v0.1.0
local-web-runtime-v0.1.0
desktop-v1.0.0
```

After a tag is pushed, the workflow checks whether the tag commit is already contained in `origin/main`:

```bash
git merge-base --is-ancestor "$GITHUB_SHA" origin/main
```

If the commit is not on `main`, the workflow fails before creating a GitHub Release.

### Test Release

Use prerelease tags when testing the real release path:

```bash
cli-v0.2.0-rc.1
local-web-runtime-v0.2.0-rc.1
desktop-v1.1.0-rc.1
```

Do not push prerelease tags directly from a branch just to test. Prefer GitHub Actions `workflow_dispatch`:

- `ref`: branch name or commit SHA
- `create_release`: `true`
- `release_tag`: the matching `*-v<version>-rc.N` tag
- `prerelease`: `true`

This creates a real GitHub Release marked as Pre-release.

Stable version checks filter out prereleases. `atmos update` and the Settings > About CLI check do not treat `cli-v0.2.0-rc.1` as an available stable update.

---

## CLI Release

The CLI release publishes the standalone `atmos` command. It is the stable automation entrypoint for agents, scripts, and advanced users.

### Owned Files

- Version source: `apps/cli/Cargo.toml`
- Workflow: `.github/workflows/release-cli.yml`
- Skill: `.agents/skills/atmos-cli-release/SKILL.md`
- Helper script: `.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs`
- Update checker: `apps/cli/src/commands/update.rs`
- Settings API checker: `apps/api/src/api/system/handlers.rs`

### What It Builds

The workflow builds and uploads:

```text
atmos-cli-aarch64-apple-darwin.tar.gz
atmos-cli-x86_64-apple-darwin.tar.gz
atmos-cli-x86_64-unknown-linux-gnu.tar.gz
atmos-cli-x86_64-pc-windows-msvc.tar.gz
```

Each archive contains:

```text
atmos-cli-<target>/
└── bin/
    └── atmos
```

Windows archives contain `atmos.exe`.

### Stable CLI Release

Use the CLI release helper:

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs 0.1.0 --dry-run
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs 0.1.0
```

The helper:

1. verifies git and GitHub authentication
2. verifies working tree cleanliness
3. verifies `apps/cli/Cargo.toml` version matches `0.1.0`
4. builds the local CLI as a preflight check
5. verifies the current commit is in `origin/main`
6. creates `cli-v0.1.0`
7. pushes the tag
8. lets GitHub Actions publish release assets

Manual equivalent:

```bash
cargo build --release --bin atmos
git fetch origin main
git merge-base --is-ancestor HEAD origin/main
git tag cli-v0.1.0
git push origin cli-v0.1.0
```

### CLI Prerelease Test

Use prerelease workflow dispatch:

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs 0.2.0-rc.1 --prerelease --ref <branch-or-sha>
```

The helper dispatches `release-cli.yml` with:

- `create_release=true`
- `release_tag=cli-v0.2.0-rc.1`
- `prerelease=true`
- `ref=<branch-or-sha>`

### Verify CLI Release

```bash
gh run list --workflow release-cli.yml --limit 5
gh release view cli-v0.1.0
```

Check assets:

```bash
gh release view cli-v0.1.0 --json assets --jq '.assets[].name'
```

Check discovery:

```bash
atmos update --check
```

Expected behavior:

- stable releases are visible to update checks
- prereleases are ignored by stable update checks

---

## Local Runtime Release

The Local Runtime release publishes the full local Web runtime used by `@atmos/local-web-runtime`.

### Owned Files

- Version source: `packages/local-installer/package.json`
- Workflow: `.github/workflows/release-local-runtime.yml`
- Skill: `.agents/skills/atmos-local-web-release/SKILL.md`
- Helper script: `.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs`
- Build script: `scripts/local-runtime/build-runtime.mjs`
- Version checker: `scripts/release/check-local-runtime-version.mjs`
- Installer package: `packages/local-installer`

### What It Builds

The workflow builds and uploads:

```text
atmos-local-runtime-aarch64-apple-darwin.tar.gz
atmos-local-runtime-x86_64-apple-darwin.tar.gz
atmos-local-runtime-x86_64-unknown-linux-gnu.tar.gz
```

Each archive contains:

```text
atmos-runtime/
├── bin/
│   ├── api
│   └── atmos
├── web/
├── system-skills/
├── version.txt
└── manifest.json
```

`manifest.json` records:

```json
{
  "schema_version": 1,
  "product": "atmos-local-runtime",
  "runtime_version": "0.1.0",
  "bundled_cli_version": "0.1.0",
  "target_triple": "aarch64-apple-darwin"
}
```

`runtime_version` belongs to Local Runtime. `bundled_cli_version` records which CLI was bundled, but does not force Local Runtime and CLI to share the same version.

### Stable Local Runtime Release

Use the local runtime release helper:

```bash
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs 0.1.0 --dry-run
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs 0.1.0
```

The helper:

1. verifies git and GitHub authentication
2. verifies working tree cleanliness
3. verifies `packages/local-installer/package.json` version matches `local-web-runtime-v0.1.0`
4. builds one local runtime archive as a preflight check
5. creates `local-web-runtime-v0.1.0`
6. pushes the tag
7. lets GitHub Actions publish runtime assets
8. lets GitHub Actions publish `@atmos/local-web-runtime`

The workflow enforces that stable tag-push releases come from `origin/main`.

### Local Runtime Prerelease Test

Use workflow dispatch on `.github/workflows/release-local-runtime.yml`:

- `ref`: branch or commit SHA
- `create_release`: `true`
- `release_tag`: `local-web-runtime-v0.2.0-rc.1`
- `publish_npm`: usually `false` unless intentionally testing npm prerelease publication
- `prerelease`: `true`

Use `create_release=false` for build-only validation without creating a GitHub Release.

### Verify Local Runtime Release

```bash
gh run list --workflow release-local-runtime.yml --limit 5
gh release view local-web-runtime-v0.1.0
npm view @atmos/local-web-runtime version
```

Check assets:

```bash
gh release view local-web-runtime-v0.1.0 --json assets --jq '.assets[].name'
```

Optionally verify installation paths:

```bash
npx @atmos/local-web-runtime --version local-web-runtime-v0.1.0 --no-start
bunx @atmos/local-web-runtime --version local-web-runtime-v0.1.0 --no-start
```

---

## Desktop Release

The Desktop release publishes the Tauri desktop app.

### Owned Files

- Version sources:
  - `apps/desktop/package.json`
  - `apps/desktop/src-tauri/Cargo.toml`
  - `apps/desktop/src-tauri/tauri.conf.json`
- Workflow: `.github/workflows/release-desktop.yml`
- Skill: `.agents/skills/atmos-desktop-release/SKILL.md`
- Helper script: `.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs`
- Homebrew sync workflow: `.github/workflows/sync-homebrew-tap.yml`

### What It Builds

The Desktop workflow builds:

- macOS Apple Silicon app artifacts
- macOS Intel app artifacts
- Linux app artifacts
- Windows app artifacts
- Tauri updater artifacts
- `latest.json`

Desktop bundles:

- API sidecar
- static Web output
- system skills
- bundled CLI resource

The bundled CLI resource includes a manifest generated during build:

```json
{
  "schema_version": 1,
  "product": "atmos-cli",
  "cli_version": "0.1.0",
  "target_triple": "aarch64-apple-darwin"
}
```

### Stable Desktop Release

Use the desktop release skill/helper:

```bash
just release-desktop 1.0.1 --dry-run
just release-desktop 1.0.1
```

The desktop helper handles version bumping and release preparation. The workflow enforces that stable tag-push releases come from `origin/main`.

Manual tag shape:

```bash
desktop-v1.0.1
```

### Desktop Prerelease Test

Use workflow dispatch on `.github/workflows/release-desktop.yml`:

- `ref`: branch or commit SHA
- `create_release`: `true`
- `release_tag`: `desktop-v1.1.0-rc.1`
- `prerelease`: `true`
- `platform`: choose `all` or one platform for focused testing

Use `create_release=false` for build-only validation without creating a GitHub Release.

### Verify Desktop Release

```bash
gh run list --workflow release-desktop.yml --limit 5
gh release view desktop-v1.0.1
```

For stable desktop releases, also verify Homebrew tap sync when relevant:

```bash
gh run list --workflow sync-homebrew-tap.yml --limit 5
```

---

## Version Detection Rules

### CLI Update Checks

`atmos update --check`, the automatic 24-hour CLI hint, and the Settings > About CLI check all look for stable CLI releases.

They accept:

```text
cli-v0.1.0
atmos-cli-v0.1.0
```

They ignore:

```text
cli-v0.1.0-rc.1
cli-v0.1.0-beta.1
cli-v0.1.0-alpha.1
```

The primary GitHub Releases API path filters out draft and prerelease releases. The fallback tags feed also rejects versions containing `-`, so prerelease tags are not treated as stable updates.

### Local Runtime Installer Checks

`@atmos/local-web-runtime` resolves the latest non-draft, non-prerelease `local-web-runtime-v*` release when installing `latest`.

### Desktop Updater Checks

Desktop uses the Tauri updater endpoint from `tauri.conf.json` and the desktop GitHub release artifacts. It is separate from CLI and Local Runtime update checks.

---

## Which Release Should I Use?

| Goal | Use |
| --- | --- |
| Publish a new standalone `atmos` binary | CLI release |
| Let agents or scripts use a new CLI capability | CLI release |
| Publish a complete local Web runtime for `npx @atmos/local-web-runtime` | Local Runtime release |
| Update bundled API, Web, or system skills for local Web installs | Local Runtime release |
| Publish the Tauri desktop app | Desktop release |
| Test real release assets from a branch | workflow dispatch + prerelease |
| Validate branch build without public release | workflow dispatch + `create_release=false` |

---

## Common Scenarios

### I changed only CLI commands

Use CLI release:

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version> --dry-run
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version>
```

If Local Runtime or Desktop should embed this new CLI, cut their releases afterwards.

### I changed local Web or API behavior

Use Local Runtime release for local Web users:

```bash
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version> --dry-run
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version>
```

Use Desktop release separately if Desktop users need the same change.

### I changed Desktop-only behavior

Use Desktop release:

```bash
just release-desktop <version> --dry-run
just release-desktop <version>
```

### I want to test real release assets from my branch

Use workflow dispatch with prerelease:

```text
create_release=true
release_tag=<line>-v<version>-rc.1
prerelease=true
ref=<branch-or-sha>
```

Do not push stable tags from a branch-only commit. Stable tag workflows reject them.

---

## Recovery Notes

### Tag Was Pushed From The Wrong Commit

If the commit is not on `origin/main`, the workflow should fail before creating a release. Delete the bad tag if needed:

```bash
git tag -d <tag>
git push origin :refs/tags/<tag>
```

Then create the tag from the correct commit.

### Workflow Failed After Creating A Draft Release

Do not manually upload replacement assets unless you are intentionally doing release repair with full traceability.

Preferred recovery:

1. fix the underlying workflow or source issue
2. delete the failed draft release if needed
3. delete and recreate the tag only if the commit must change
4. rerun through the workflow

### Prerelease Appears In GitHub Releases

That is expected. It is visible on the Releases page, but marked as Pre-release. Stable update checks ignore prerelease versions.

---

## Quick Commands

### CLI

```bash
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version> --dry-run
node ./.agents/skills/atmos-cli-release/scripts/atmos-cli-release.mjs <version>
gh release view cli-v<version>
```

### Local Runtime

```bash
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version> --dry-run
node ./.agents/skills/atmos-local-web-release/scripts/atmos-local-web-release.mjs <version>
gh release view local-web-runtime-v<version>
npm view @atmos/local-web-runtime version
```

### Desktop

```bash
just release-desktop <version> --dry-run
just release-desktop <version>
gh release view desktop-v<version>
```

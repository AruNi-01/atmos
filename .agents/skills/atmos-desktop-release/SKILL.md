---
name: atmos-desktop-release
description: Run the Atmos desktop release workflow for this repository. Use this whenever you need to cut an Atmos desktop release, bump the desktop version, create the required `desktop-electron-<version>` tag, push the release-prep commit, and verify the GitHub Actions package flow. Prefer this over a generic GitHub release process for Atmos desktop releases. Publishes the production Electron desktop shell only (Tauri desktop release is deprecated).
user-invokable: true
args:
  - name: version
    description: Desktop version to release, for example `2026.7.2` or `2026.7.2-rc.1`
    required: true
  - name: prerelease
    description: Set to true for prereleases such as `2026.7.2-rc.1`
    required: false
  - name: dry_run
    description: Preview the full release plan without changing files, committing, tagging, or pushing
    required: false
---

Atmos-specific **production desktop** release workflow (Electron ship path).

## What this skill owns

1. validate repository state  
2. bump `apps/desktop-electron/package.json`  
3. create/push `desktop-electron-<version>`  
4. generate release notes under `releasenotes/`  
5. let `.github/workflows/release-desktop-electron.yml` package and publish  

**Does not** run the deprecated Tauri workflow (`release-desktop.yml` / Homebrew-only Tauri path).

## Execution

```bash
# standard
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version>

# dry-run
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version> --dry-run

# prerelease
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs <version> --prerelease
```

Equivalent just recipes:

```bash
just release-desktop <version>
just release-desktop-dry-run <version>
```

## Repository model (production)

| Item | Value |
|------|--------|
| Tag | `desktop-electron-<version>` |
| Version file | `apps/desktop-electron/package.json` |
| App id | `com.atmos.desktop` |
| Product name | `Atmos` |
| Workflow | `.github/workflows/release-desktop-electron.yml` |
| Notes | `releasenotes/Atmos Desktop <version>.md` (preferred) |

## Never

- never cut a new **Tauri** desktop release for production ship  
- never use `desktop-<version>` Tauri tags for the production Electron package  
- never invent a generic “upload assets by hand” flow when this automation exists  

## Summary

This skill is the Atmos desktop release entrypoint. It always publishes the production desktop shell (Electron engine under the hood; product name **Atmos**).

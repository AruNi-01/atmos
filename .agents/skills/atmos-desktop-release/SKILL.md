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

## Release notes writing

Generate `releasenotes/Atmos Desktop <version>.md` from the collected commit/PR context and the template in `references/release-notes-template.md`.

After the product narrative, **always end the file with the collapsed Download section** (macOS first, English only). Prefer generating it with:

```bash
node ./scripts/release/append-desktop-download-section.mjs \
  --version <version> \
  --notes "releasenotes/Atmos Desktop <version>.md" \
  --out "releasenotes/Atmos Desktop <version>.md" \
  --auto-contributors
```

The publish job in `.github/workflows/release-desktop-electron.yml` re-injects:

1. **Contributors** — `@username` mentions from commits since the previous `desktop-electron-*` tag (humans and bots, ordered by commit count desc). This is **not** a GitHub Release API parameter; GitHub builds the native Contributors avatar strip (above Assets) from `@mentions` in the body.
2. **Download** — collapsed section with the correct versioned installer links.

Still write these into the notes file when drafting so local previews match GitHub.

### Product voice (stable and prerelease bodies)

Release bodies are product-facing. Users care about capabilities, not version genealogy.

Hard rules:

- Lead the opening summary with what the release ships.
- Do **not** open with, or otherwise emphasize, process language such as:
  - “graduates the … beta / dogfood line”
  - “promotes the … line to stable”
  - “includes / carries / rolls up beta X and RC Y”
  - “将 … beta / dogfood 线升级为正式版”
  - “包含 … beta / RC 版本”
- When a stable follows one or more pre-releases, still carry forward the pre-release feature narrative (see continuity below), but present it as the product content of this release. Do not narrate the staging history in the summary.
- Pre-release files may use a short beta/RC callout for testers. Stable files must not keep that framing.
- Prefer concrete user outcomes over release-channel labels.

### Same-base-version continuity

When the current release shares its base version (`YYYY.M.D`) with earlier pre-releases:

1. Read the latest sibling pre-release notes under `releasenotes/`.
2. Carry the product narrative forward (features / fixes / improvements).
3. Use the commit range only for the delta since that previous tag.
4. For a later pre-release, prepend a short `Changes Since` block and keep the inherited body.
5. For the final stable, strip pre-release framing, merge late fixes into the normal sections, and rewrite the opening summary as pure product copy.
6. Always refresh the trailing Download section for the **current** version (never inherit prior asset URLs).

Details and templates live in `references/release-notes-template.md`.

After generating notes, keep them under `releasenotes/` so the publish workflow can use the file as the GitHub Release body.

## Never

- never cut a new **Tauri** desktop release for production ship  
- never use `desktop-<version>` Tauri tags for the production Electron package  
- never invent a generic “upload assets by hand” flow when this automation exists  

## Summary

This skill is the Atmos desktop release entrypoint. It always publishes the production desktop shell (Electron engine under the hood; product name **Atmos**).

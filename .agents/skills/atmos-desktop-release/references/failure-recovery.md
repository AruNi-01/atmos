# Desktop release failure recovery

Operational recipes for `release-desktop-electron.yml` failures.  
Policy and decision tree live in the skill `SKILL.md` (**Failure recovery (prefer same-version retag)**).

Production tag shape: `desktop-electron-<version>`  
Version file: `apps/desktop-electron/package.json`

---

## 1. Re-run failed jobs only (no code change)

Use when logs show flakiness (timeout, network, runner), not a deterministic compile/prerender bug.

```bash
# Find the run
gh run list --workflow=release-desktop-electron.yml --limit 5

# Re-run only failed jobs (successful platform artifacts usually remain for Publish)
gh run rerun <run-id> --failed

# Watch
gh run watch <run-id>
# or
gh run view <run-id> --web
```

If the same step fails again with the same error, treat it as a **code/build bug** — do not loop re-runs.

---

## 2. Same-version retag (preferred for broken beta/rc)

Use when:

- you fixed the bug on `main` (or the release branch),
- version `V` is still a **prerelease / dogfood** cut,
- it is safe to delete the incomplete or wrong GitHub Release for `desktop-electron-V`,
- nobody should keep installing the broken assets under that version.

### Steps

```bash
V=2026.8.6-beta.2
TAG=desktop-electron-${V}

# 0. Confirm package.json still at V (do not bump)
node -p "require('./apps/desktop-electron/package.json').version"
# → must print V

# 1. Land the fix on the branch you will tag (commit + push as needed)
git status
git log -1 --oneline

# 2. Delete GitHub Release (draft or prerelease OK)
gh release delete "$TAG" --yes

# 3. Delete remote and local tags
git push origin ":refs/tags/${TAG}"
git tag -d "$TAG" 2>/dev/null || true

# 4. Recreate annotated tag on the fixed commit (usually HEAD of main)
git tag -a "$TAG" -m "Atmos Desktop Electron ${V}"
git push origin "$TAG"

# 5. Confirm workflow
gh run list --workflow=release-desktop-electron.yml --limit 3
gh run watch  # if a new run is active
```

### Release notes

- Keep `releasenotes/Atmos Desktop ${V}.md` for the same version.
- If the fix is user-visible or packaging-critical, fold it into the body (for betas, a short **Changes Since** / packaging note is fine).
- Refresh Download links only if needed (same version URLs stay the same).

### What not to do

```bash
# Wrong for same-version recovery — creates a new version and new tag
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs 2026.8.6-beta.3 --prerelease
```

Use the release helper **only** when you intentionally want a **new** version string.

---

## 3. New version bump (when retag is unsafe)

Use when:

- version is **stable**, or
- prerelease was already distributed / announced / pinned by updater or Homebrew, or
- you cannot delete the old release/tag safely.

Then use the normal skill path:

```bash
# Example: next beta
node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs 2026.8.6-beta.3 --prerelease
```

Write notes with same-base continuity (`Changes Since Beta.N`) per `release-notes-template.md`.

---

## 4. Pre-tag validation (avoid public failed cuts)

### Workflow dispatch without publishing

GitHub → Actions → **Desktop Electron CI & Release** → Run workflow:

| Input | Value |
|-------|--------|
| `ref` | branch or SHA to test |
| `platform` | `all` or a single runner |
| `create_release` | **false** |
| `prerelease` | n/a when not creating |

Or CLI (adjust inputs to match the workflow schema):

```bash
gh workflow run release-desktop-electron.yml \
  -f ref=main \
  -f platform=all \
  -f create_release=false \
  -f prerelease=true
```

### Local packaging smoke (common failure surface)

```bash
# Desktop web static export (BUILD_TARGET=desktop) — often fails before electron-builder
node ./scripts/desktop/build-web-static.mjs "$PWD"

# Desktop unit tests
bun test --cwd apps/desktop-electron
```

---

## 5. Clean up abandoned failed releases

After a good cut (or after same-version retag), remove dead drafts so the Releases page stays clear:

```bash
# Example: beta.1 and beta.2 failed; beta.3 (or retagged beta.1) is good
gh release delete desktop-electron-2026.8.6-beta.1 --yes
gh release delete desktop-electron-2026.8.6-beta.2 --yes

# Optional: delete unused tags too
git push origin :refs/tags/desktop-electron-2026.8.6-beta.1
git push origin :refs/tags/desktop-electron-2026.8.6-beta.2
git tag -d desktop-electron-2026.8.6-beta.1 2>/dev/null || true
git tag -d desktop-electron-2026.8.6-beta.2 2>/dev/null || true
```

Keep tags that still matter for `compare` links or audit history.

---

## 6. Inspect failure quickly

```bash
RUN_ID=...   # from gh run list
gh run view "$RUN_ID" --json status,conclusion,jobs \
  --jq '{status,conclusion,jobs:[.jobs[]|{name,conclusion,status}]}'

# Failed job logs (pick id from the jobs list)
gh api "repos/AruNi-01/atmos/actions/jobs/<job-id>/logs" | tail -n 200
# or once the run is completed:
gh run view "$RUN_ID" --log-failed | tail -n 200
```

---

## Final rule

| Goal | Action |
|------|--------|
| Same bits, flaky CI | Re-run failed jobs |
| Same version, fixed code, safe prerelease | Same-version retag |
| Already shipped / stable / users depend on it | New version |
| Unknown packaging risk | Validate with `create_release=false` first |

Do not treat “CI failed” as automatic permission to mint `beta.N+1`.

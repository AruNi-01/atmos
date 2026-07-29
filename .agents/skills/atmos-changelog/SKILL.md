---
name: atmos-changelog
description: Refresh the Atmos landing-page changelog from the GitHub Releases page. Use when Codex needs to read `https://github.com/AruNi-01/atmos/releases`, extract release-note content, and rewrite `apps/landing/src/lib/changelog-data.ts` in the shape expected by the landing changelog UI. Supports generating a specific version on demand, or filling only versions that are still missing from the landing data file.
user-invokable: true
args:
  - name: version
    description: Optional release version to generate, for example `2026.7.2` or `desktop-2026.7.2`. If omitted, generate only versions that are missing from `apps/landing/src/lib/changelog-data.ts`.
    required: false
---

# Atmos Changelog

Refresh the landing changelog from Atmos GitHub Releases.

Treat the GitHub Releases page as the source of truth, and treat `apps/landing/src/lib/changelog-data.ts` as the canonical output file.

## Inputs

### `version`

Optional.

- If provided, refresh only that release.
- Accept either a short version such as `2026.7.2` or a full tag such as `desktop-2026.7.2`.
- Normalize short versions to the matching GitHub release tag before fetching.

If omitted:

- read the existing entries in `apps/landing/src/lib/changelog-data.ts`
- compare them against the GitHub Releases page
- generate only releases that are missing from the landing data file
- avoid duplicating or reordering existing entries unless a targeted refresh is requested

## Prerelease Filter

The landing `/changelog` page is user-facing and only tracks stable releases. Pre-release tags never belong in `apps/landing/src/lib/changelog-data.ts`.

A release is a pre-release when its version contains a SemVer pre-release suffix, i.e. any `-` segment after `X.Y.Z`. Examples:

- pre-release: `2026.7.2-rc.1`, `2026.7.2-rc.2`, `2026.7.2-beta.3`, `2026.7.2-alpha`
- stable: `2026.7.2`, `2026.7.3`, `2026.8.1`

Apply the filter as follows:

- **No `version` argument (auto-discovery)** — when enumerating GitHub releases, filter out anything whose tag is a pre-release. Even if a pre-release is missing from the landing data file, do not generate an entry for it.
- **Explicit `version` argument matching a pre-release** — refuse the request and explain that the landing changelog only tracks stable releases. Do not silently no-op.
- Do not rely on the GitHub API `prerelease` flag alone. Use the SemVer suffix in the tag, because the tag is the canonical source of truth for this repository.
- Prior pre-release notes that describe in-progress work for an upcoming stable must be rolled up under the eventual stable entry, not re-surfaced as their own landing entries.

## Workflow

1. Read `apps/landing/AGENTS.md` and `apps/landing/src/lib/changelog-data.ts` before editing.
2. Read `apps/landing/src/app/[locale]/changelog/page.tsx` if you need to confirm which fields are rendered or how the data is grouped.
3. Determine scope from `version`:
   - if `version` is provided, target only that release
   - if `version` is omitted, detect which GitHub releases are missing from `apps/landing/src/lib/changelog-data.ts`
   - apply the **Prerelease Filter** (see section below) to exclude `-rc.N`, `-beta.N`, `-alpha.N`, or any other SemVer pre-release suffix from both modes
4. Fetch the relevant release notes from `https://github.com/AruNi-01/atmos/releases`.
5. Write only the targeted or missing release-derived entries into `apps/landing/src/lib/changelog-data.ts`, keeping newest-first ordering intact.
6. Do not duplicate an existing entry with the same `id`, `version`, or release tag.
7. Run `bun run --filter landing typecheck`.

## Source Rules

- Use the GitHub Releases page for release titles, publish dates, version tags, and release-note bodies.
- Prefer official release content over inference.
- If GitHub API access is rate-limited, fall back to the release page HTML or another GitHub-owned source.
- Preserve concrete version and date values exactly; do not use relative dates.

## Output Rules

- Write directly into `apps/landing/src/lib/changelog-data.ts`.
- Keep the exported TypeScript interface compatible with the page.
- Preserve newest-first ordering.
- When `version` is omitted, preserve all existing entries and only append/prepend missing ones in the correct chronological position.
- When `version` is provided, update the matching entry in place if it already exists; otherwise insert it in newest-first order.
- Use ISO dates in `YYYY-MM-DD` format.
- Store the release tag URL in `releaseUrl` when the output type supports it.
- Keep the release link out of the markdown description and section bullet content when the UI already renders a dedicated GitHub button.
- Keep `version` user-facing. Convert tags such as `desktop-2026.7.2` to `2026.7.2` unless the file already uses a different convention.
- If multiple releases share the same date-based version (e.g. two releases on `2026.3.18`), disambiguate by appending a sequential suffix: `2026.3.18-1` (oldest), `2026.3.18-2` (newest), etc. Higher suffix = newer release. This prevents duplicate React keys in the changelog UI.

## Mapping Heuristics

- Use the release title or a concise user-facing summary for `title`.
- Use a short overview sentence for `description`.
- Map bullet lists into the landing categories:
  - `features`
  - `improvements`
  - `fixes`
  - `others`
- If the GitHub release already has similar headings, keep them aligned.
- If the release is an unstructured list, group items by meaning instead of copying them into a single bucket.
- Put compare links, migration notes, CI notes, and release-process notes into `others`.
- Omit empty groups.

## Product Voice (C-end)

Landing changelog copy is for end users, not release operators. Write what the release does, not how it was staged.

Hard rules for all displayed fields (`title`, `description`, section bullets, tags):

- Lead with user-visible capabilities, fixes, and outcomes.
- Do **not** mention beta / RC / dogfood / preview lines, version-line graduation, or “includes earlier pre-release X”.
- Do **not** write process framing such as:
  - “graduates the … beta line”
  - “promotes … to stable”
  - “将 … beta / dogfood 线升级为正式版”
  - “将 … 打磨为稳定版”
  - “包含 … beta / RC 版本”
  - “本条目合并了前序 RC 与 beta …”
- When a stable release rolls up prior pre-release work, fold that work into the feature/fix/improvement bullets only. The user-facing text should read as one product release, not a version genealogy.
- Prefer “This release adds …” / “本期带来 …” over “This stable release graduates …”.
- Keep technical identifiers that users actually see (product names, commands, paths, UI labels). Drop internal release-channel jargon (`dogfood`, `desktop-electron-*` packaging talk) unless the user must take an install action.
- Compare links and tag names may remain under `others` as optional deep links, but never as the lead story, and never with “includes beta …” framing.

Internal agent notes about rolling pre-releases into a stable entry stay in this skill; they must not leak into the landing data file as user-visible prose.

## Language Rules

- Keep `en` faithful to the release note wording.
- Keep `zh` present for every displayed field.
- Translate into natural product Chinese instead of transliterating commit subjects.
- If a release item is highly technical, keep identifiers, code symbols, and URLs unchanged inside the translated text.

## Validation

- Confirm every entry has:
  - stable `id`
  - `title.zh` and `title.en`
  - `description.zh` and `description.en`
  - `date`
  - `version` when applicable
  - grouped content under `zh` and `en`
- Confirm the data file contains no leftover placeholder or demo content.
- Run `bun run --filter landing typecheck` after edits.

## References

- Read `references/changelog-shape.md` when you need a quick reminder of the landing file shape and repository-specific mapping expectations.

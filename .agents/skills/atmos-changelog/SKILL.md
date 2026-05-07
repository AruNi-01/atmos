---
name: atmos-changelog
description: Refresh the Atmos landing-page changelog from the GitHub Releases page. Use when Codex needs to read `https://github.com/AruNi-01/atmos/releases`, extract release-note content, and rewrite `apps/landing/src/lib/changelog-data.ts` in the shape expected by the landing changelog UI. Supports generating a specific version on demand, or filling only versions that are still missing from the landing data file.
user-invokable: true
args:
  - name: version
    description: Optional release version to generate, for example `0.2.6` or `desktop-v0.2.6`. If omitted, generate only versions that are missing from `apps/landing/src/lib/changelog-data.ts`.
    required: false
---

# Atmos Changelog

Refresh the landing changelog from Atmos GitHub Releases.

Treat the GitHub Releases page as the source of truth, and treat `apps/landing/src/lib/changelog-data.ts` as the canonical output file.

## Inputs

### `version`

Optional.

- If provided, refresh only that release.
- Accept either a short version such as `0.2.6` or a full tag such as `desktop-v0.2.6`.
- Normalize short versions to the matching GitHub release tag before fetching.

If omitted:

- read the existing entries in `apps/landing/src/lib/changelog-data.ts`
- compare them against the GitHub Releases page
- generate only releases that are missing from the landing data file
- avoid duplicating or reordering existing entries unless a targeted refresh is requested

## Prerelease Filter

The landing `/changelog` page is user-facing and only tracks stable releases. Pre-release tags never belong in `apps/landing/src/lib/changelog-data.ts`.

A release is a pre-release when its version contains a SemVer pre-release suffix, i.e. any `-` segment after `X.Y.Z`. Examples:

- pre-release: `1.1.0-rc.1`, `1.1.0-rc.2`, `0.5.0-beta.3`, `2.0.0-alpha`
- stable: `1.0.0`, `1.1.0`, `2.0.0`

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
- Keep `version` user-facing. Convert tags such as `desktop-v0.2.6` to `0.2.6` unless the file already uses a different convention.

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

# Atmos Landing Changelog Shape

Use this reference when refreshing `apps/landing/src/lib/changelog-data.ts`.

## Target File

- `apps/landing/src/lib/changelog-data.ts`

## Render Consumer

- `apps/landing/src/app/[locale]/changelog/page.tsx`

The page currently renders:

- `title`
- `description`
- `date`
- `version`
- `releaseUrl`
- `tags`
- `image` when present
- grouped content in:
  - `features`
  - `improvements`
  - `fixes`
  - `others`

## Repository-Specific Expectations

- Only stable releases belong in this file. Skip any tag whose version contains a SemVer pre-release suffix (`-rc.N`, `-beta.N`, `-alpha.N`, etc.). See the `Prerelease Filter` section in `SKILL.md` for the full rule.
- Keep entries sorted newest first.
- Write C-end product language only. Descriptions and bullets should explain features, fixes, and outcomes.
- Never surface release-process genealogy in user-visible fields:
  - no “graduates the beta line”
  - no “promotes to stable”
  - no “将 beta / dogfood 线升级为正式版”
  - no “包含 xxx beta / RC”
  - no “合并了前序 RC 与 beta 阶段”
- If source release notes open with process framing, rewrite the landing `description` into a capability summary and keep the process framing out of the data file.
- Prefer short capability-led overviews: what users can do now, what got better, what was fixed.
- Keep `id` stable and tag-like when possible, for example `desktop-2026.7.2`.
- Keep `version` short and user-facing, for example `2026.7.2`.
- If multiple releases share the same date-based version, append a sequential suffix: `2026.3.18-1` (oldest), `2026.3.18-2` (newest), etc. Higher suffix = newer release. This prevents duplicate React keys.
- Keep `releaseUrl` as the GitHub release tag URL.
- Do not place GitHub release links inside `description` if the UI already renders a release button beside the title.
- Keep markdown valid inside descriptions and bullet items because the page renders them with `react-markdown`.

## Suggested Mapping Pattern

For each release:

1. Read the release title, tag, published date, and body.
2. Convert the body into product-facing sections.
3. Keep technical notes that are not user-facing under `others`.
4. Translate all displayed fields so both `zh` and `en` exist.
5. Omit empty section arrays instead of filling them with placeholders.

## Final Check

After editing:

```bash
bun run --filter landing typecheck
```

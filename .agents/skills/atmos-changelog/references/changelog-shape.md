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
- Keep `id` stable and tag-like when possible, for example `desktop-v0.2.6`.
- Keep `version` short and user-facing, for example `0.2.6`.
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

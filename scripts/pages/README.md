# Cloudflare Pages Deploy

This directory contains helper scripts to build and deploy static Next.js apps to Cloudflare Pages.

| App | Project name | Build | Deploy |
|-----|--------------|-------|--------|
| `apps/web` | `app-atmos-land` | `bun run build:web:pages` | `bun run deploy:web:pages` |
| `apps/docs` | `docs-atmos-land` | `bun run build:docs:pages` | `bun run deploy:docs:pages` |
| `apps/landing` | `www-atmos-land` | `bun run build:landing:pages` | `bun run deploy:landing:pages` |

## Web (`apps/web`)

- `build-pages-web.mjs`
  - Builds `apps/web` as a static export for Pages.
  - Sets `BUILD_TARGET=pages`.
  - Temporarily removes `apps/web/src/proxy.ts` during export so Next.js does not emit middleware/static-export warnings.
  - Ensures `apps/web/out/index.html` exists by copying `out/en/index.html` when needed.
  - Writes a basic Pages `_headers` file into `apps/web/out/`.

- `deploy-pages-web.mjs`
  - Uploads `apps/web/out` to Cloudflare Pages using Wrangler.
  - Reads `apps/web/wrangler.jsonc`.
  - Supports optional `--branch`, `--commit-hash`, `--commit-message`, `--commit-dirty`, and `--skip-caching`.

Workflow: `.github/workflows/deploy-web-app-pages.yml` (tag-triggered: `deploy-web-app-*`).

## Docs (`apps/docs`)

- `build-pages-docs.mjs`
  - Builds `apps/docs` as a static export for Pages.
  - Sets `BUILD_TARGET=pages`.
  - Temporarily removes `apps/docs/src/proxy.ts` and the `llms.mdx` route during export.
  - Copies default locale (`en`) pages to `out/` root and writes `_headers` + `_redirects`.

- `deploy-pages-docs.mjs`
  - Uploads `apps/docs/out` via Wrangler (`apps/docs/wrangler.jsonc`).

Workflow: `.github/workflows/deploy-docs-pages.yml` (push to `main` when docs paths change).

Site URL: `https://docs.atmos.land`

## Landing (`apps/landing`)

- `build-pages-landing.mjs`
  - Builds `apps/landing` as a static export for Pages.
  - Sets `BUILD_TARGET=pages` and `NEXT_PUBLIC_ASSETS_BASE_URL` (R2 public host for demo videos/posters).
  - Temporarily removes `apps/landing/src/proxy.ts` and the unused `api/download-links` route during export.
  - Temporarily moves aside `public/videos/` so large MP4s are not copied into `out/` (media loads from R2 at runtime).
  - Copies default locale (`en`) pages to `out/` root and writes `_headers` + `_redirects` (`/en` → `/`).

- `deploy-pages-landing.mjs`
  - Uploads `apps/landing/out` via Wrangler (`apps/landing/wrangler.jsonc`).

Workflow: `.github/workflows/deploy-landing-pages.yml` (push to `main` when landing paths change).

Site URL: `https://atmos.land`

Assets host (demo videos/posters): `NEXT_PUBLIC_ASSETS_BASE_URL` → `https://pub-0c45182ddbaf421e8e1f36b9db4cf2fa.r2.dev/landing/videos/…`

## Local usage

From the repo root:

```bash
bun run build:web:pages
bun run deploy:web:pages

bun run build:docs:pages
bun run deploy:docs:pages

bun run build:landing:pages
bun run deploy:landing:pages
```

Pass deploy metadata through CLI flags if needed:

```bash
bun run deploy:landing:pages -- --branch main --commit-dirty
```

## Requirements

1. Install dependencies:

```bash
bun install
```

2. Authenticate Wrangler:

```bash
bunx wrangler login
```

3. Create or configure each Pages project so its name matches the app's `wrangler.jsonc`.

## Dashboard Git integration

If you prefer Cloudflare Pages Git integration instead of `wrangler pages deploy`, use:

- Root directory: repository root
- Build command: `bun run build:<app>:pages` (e.g. `bun run build:landing:pages`)
- Build output directory: `apps/<app>/out`

Each app can keep its `wrangler.jsonc` in source control so direct uploads and dashboard settings stay aligned.

## GitHub Actions

Workflows deploy using:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Values are read from GitHub `secrets` first, then fall back to repository/environment `vars`.

## Notes

- Deployed frontends are static-only. Runtime API access happens in the browser or is resolved at build time.
- Each `wrangler.jsonc` only stores Pages project metadata for static deployment:

```json
{
  "name": "www-atmos-land",
  "pages_build_output_dir": "./out"
}
```

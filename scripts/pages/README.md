# Cloudflare Pages Deploy

This directory contains the helper scripts used to build and deploy `apps/web` to Cloudflare Pages.

## Files

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

## Local usage

From the repo root:

```bash
bun run build:web:pages
bun run deploy:web:pages
```

Pass deploy metadata through CLI flags if needed:

```bash
bun run deploy:web:pages -- --branch main --commit-dirty
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

3. Create or configure the Pages project so its name matches `apps/web/wrangler.jsonc`.

Current project name:

```text
app-atmos-land
```

## Dashboard Git integration

If you prefer Cloudflare Pages Git integration instead of `wrangler pages deploy`, use:

- Root directory: repository root
- Build command: `bun run build:web:pages`
- Build output directory: `apps/web/out`

The Pages project can still keep `apps/web/wrangler.jsonc` in source control so direct uploads and dashboard settings stay aligned.

## GitHub Actions

This repo also includes:

- `.github/workflows/deploy-web-app-pages.yml`

It builds `apps/web` with `bun run build:web:pages` and deploys with `bun run deploy:web:pages`.

Trigger policy:

- `push` tags matching `deploy-web-app-*`

The workflow always deploys to the Pages production branch (`main`), using:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow reads those values from GitHub `secrets` first, then falls back to repository/environment `vars`.

## Notes

- The deployed frontend is static-only; all runtime API access happens in the browser against the user's local Atmos API or relay endpoints.
- `apps/web/wrangler.jsonc` only stores Pages project metadata for static deployment:

```json
{
  "name": "app-atmos-land",
  "pages_build_output_dir": "./out"
}
```

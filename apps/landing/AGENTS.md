# Landing Page - AGENTS.md

> **🌈 Marketing Site**: Landing page for introducing the ATMOS project.

---

## Build And Test

- **Dev**: `just dev-landing` or `bun dev` (runs on port 3001)
- **Build**: `bun build`
- **Pages build**: `bun run build:pages` (from app) or `bun run build:landing:pages` (from repo root)
- **Pages deploy**: `bun run deploy:pages` (from app) or `bun run deploy:landing:pages` (from repo root; requires Wrangler auth)
- **Start**: `bun start`

---

## Cloudflare Pages

Production marketing site deploys to Cloudflare Pages project **`www-atmos-land`** (`apps/landing/wrangler.jsonc`).

- **CI**: `.github/workflows/deploy-landing-pages.yml` — push to `main` when landing paths change
- **Local build** (no Cloudflare credentials): `bun run build:landing:pages`
- **Local deploy**: `bunx wrangler login` then `bun run deploy:landing:pages`

### Environment variables

Set in the Cloudflare Pages project (or pass at build time):

| Variable | Required | Default / notes |
|----------|----------|-----------------|
| `NEXT_PUBLIC_SITE_URL` | Recommended | `https://atmos.land` |
| `NEXT_PUBLIC_ASSETS_BASE_URL` | Recommended (Pages) | `https://pub-0c45182ddbaf421e8e1f36b9db4cf2fa.r2.dev` — demo videos/posters under `landing/videos/` on R2 (`atmos-assets` bucket). Omit locally to serve from `public/videos/`. Production may use `https://assets.atmos.land`. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional | PostHog project key |
| `NEXT_PUBLIC_POSTHOG_HOST` | Optional | PostHog ingest host |
| `GITHUB_TOKEN` | Optional | Avoid GitHub API rate limits when resolving desktop release tags at build time |

Pages builds set `BUILD_TARGET=pages` / `NEXT_PUBLIC_BUILD_TARGET=pages`, use `output: 'export'`, and temporarily move aside `src/proxy.ts` (i18n middleware is incompatible with static export) and `public/videos/` (large MP4s are served from R2 instead). Desktop download links are resolved at **build time** on the home page — the legacy `/api/download-links` route is excluded from Pages exports.

Custom domains (`atmos.land`, `www.atmos.land`) are attached in the Cloudflare dashboard after the first deploy.

---

## 📁 Directory Structure

```
apps/landing/
├── src/
│   ├── app/
│   │   └── [locale]/        # Localized routes
│   ├── components/
│   │   ├── blocks/          # Page sections (hero, features, etc.)
│   │   ├── layout/          # Layout components (navbar, footer)
│   │   ├── providers/       # React providers
│   │   └── ui/              # Generic UI components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Shared utilities
│   ├── i18n/                # Internationalization config
│   └── assets/
│       └── img/             # Image assets
├── messages/                # Translation files
│   ├── en.json              # English
│   └── zh.json              # Chinese
├── public/
│   └── videos/              # Deployable copies synced from marketing/creative
└── package.json
```

---

## Tech Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS v4
- next-intl (internationalization)
- next-themes (theme switching)

---

## Shared Dependencies

- `@workspace/ui` — Shared UI components
- `@atmos/i18n` — Shared i18n configuration
- `@atmos/shared` — Shared utilities

---

## Coding Conventions

### Content
- All copy text lives in `messages/` directory
- `en.json` — English translations
- `zh.json` — Chinese translations

### Styling
- Uses same design system as main app for visual consistency

### Marketing Media
- Source projects for generated videos, audio, and social assets live under `marketing/creative/`.
- `public/videos/` holds local dev copies synced from `marketing/creative/`. **Pages/production** loads demo MP4s and posters from R2 via `NEXT_PUBLIC_ASSETS_BASE_URL` + `landing/videos/<filename>` (see `src/lib/landing-assets.ts`).
- Feature Showcase sphere covers use prebuilt `*-poster.jpg` stills next to each demo MP4 (not runtime video frame capture). After adding or replacing a feature demo video, regenerate posters with `bash apps/landing/scripts/generate-feature-posters.sh`, upload to R2 under `landing/videos/`, and update filenames in `feature-showcase.tsx`.
- Do not create HyperFrames source projects inside `apps/landing`.

---

## Safety Rails

### NEVER
- Add application-specific features here — this is a marketing site only
- Break visual consistency with main app design system

### ALWAYS
- Use shared UI components from `@workspace/ui`
- Keep content translations in sync

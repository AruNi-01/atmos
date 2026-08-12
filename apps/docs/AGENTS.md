# Docs Application - AGENTS.md

> **📚 Documentation Site**: Official documentation built with Next.js and Fumadocs.

---

## Build And Test

- **Dev**: `just dev-docs` or `bun dev` (runs on port 3001 by default)
- **Build**: `bun build`
- **Typecheck**: `bun run types:check` (Fumadocs MDX checks + TypeScript)

### PostHog (optional)

Set public env vars in Cloudflare Pages (or `.env.local` for local testing):

- `NEXT_PUBLIC_POSTHOG_KEY` — project API key (required to enable analytics)
- `NEXT_PUBLIC_POSTHOG_HOST` — ingestion host (defaults to `https://us.i.posthog.com`)

When the key is unset, PostHog is not initialized and the app builds/runs normally.

---

## Tech Stack

- **Framework**: Next.js 16
- **Documentation**: Fumadocs (Core, UI, MDX)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript

---

## 📁 Directory Structure

```
apps/docs/
├── content/
│   └── docs/                # User-facing docs (MDX) — see Content IA below
├── src/
│   ├── app/
│   │   ├── [lang]/          # Localized routes
│   │   ├── api/             # API routes
│   │   ├── global.css       # Global styles
│   │   └── layout.tsx       # Root layout
│   └── lib/
│       └── source.ts        # Content loading configuration
└── package.json
```

---

## Coding Conventions

### Content structure (IA)

`content/docs/` maps to `/...` (no `/docs` prefix). Top-level sidebar is driven by root `meta.json`. `/` redirects to `/introduction`. Top pages: `introduction`, `getting-started` (with `icon` in frontmatter).

| Section | Audience | Source of truth |
|---------|----------|-----------------|
| `introduction.mdx`, `getting-started.mdx` | Overview & install | Root `README.md` |
| `features/` | Feature how-tos (README Features) | README features + product UI |
| `workflows/` | End-user workflows (project/workspace, build, review, canvas, remote) | README + `apps/web` UI |
| `cli/` | `atmos` subcommands — **layout tab** (`meta.json` → `"root": true`) | `apps/cli` |
| `reference/` | Shortcuts, troubleshooting | `agents/references/`, troubleshooting |

**Repo `docs/`** (monorepo root) stays **internal** (ADRs, deep architecture, release runbooks). When a topic stabilizes for end users, **migrate** a simplified version into `apps/docs/content/docs/` — do not duplicate crate-level detail.

**i18n**: English is default (`index.mdx`). Add `page.zh.mdx` beside each page for 中文 (`/zh/...`).

**`meta.zh.json` sidebar order**: Fumadocs builds a **separate page tree per locale**. If `meta.zh.json` omits `pages` (title-only), that folder’s children fall back to **alphabetical sort by file slug** (`localeCompare` on paths)—not by Chinese display titles. English and 中文 sidebars will then diverge even when content is translated.

- When `meta.json` defines `pages`, **`meta.zh.json` in the same folder must repeat the same `pages` array** (same English slugs; Fumadocs resolves `*.zh.mdx`).
- Only folder-local fields may differ in `meta.zh.json` (e.g. `title`, `description`, separator labels in parent `meta.zh.json`).
- Adding a new page: update **both** `meta.json` and `meta.zh.json` (or add `pages` to an existing title-only `meta.zh.json`).

### Conventions
- One topic per MDX file; use `{/* TODO */}` until the page is written (HTML `<!-- -->` breaks MDX)
- Folder `meta.json` lists `pages` order; root `meta.json` lists sections (`...folder`) — omit root-tab folders (e.g. `cli`) from root `pages`
- Layout tabs: `(app)/meta.json` and `cli/meta.json` both use `"root": true`; icons/titles overridden in docs layout shell via `tabs.transform` (see [Fumadocs layout tabs](https://www.fumadocs.dev/docs/ui/layouts/docs#layout-tabs))
- Features sidebar: `(app)/features/` — one page per README feature (`multi-workspace`, `persistent-tmux`, …)
- Workflows sidebar: `(app)/workflows/` — guided flows (`project-and-workspace-manager`, `general-build-process`, …); replaces former `atmos-computer/` nav (content in `remote-build.mdx`)
- Separator labels in root meta: `"---Section title---"`

---

## Safety Rails

### NEVER
- Put framework-specific logic here that belongs in `packages/`
- Add internationalization without integrating with `@atmos/i18n`
- Ship a `meta.zh.json` that only overrides `title` while `meta.json` has `pages`—that breaks 中文 sidebar order

### ALWAYS
- Keep documentation content in MDX format
- Use `meta.json` / `meta.zh.json` `pages` arrays together for navigation order in every localized folder


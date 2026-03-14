# Docs Application - AGENTS.md

> **📚 Documentation Site**: Official documentation built with Next.js and Fumadocs.

---

## Build And Test

- **Dev**: `just dev-docs` or `bun dev` (runs on port 3001 by default)
- **Build**: `bun build`
- **Typecheck**: `bun run types:check` (Fumadocs MDX checks + TypeScript)

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
│   └── docs/                # Documentation pages (MDX)
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

### Content Structure
- File structure in `content/docs` maps directly to URL structure
- Use `meta.json` files to define navigation order and titles

---

## Safety Rails

### NEVER
- Put framework-specific logic here that belongs in `packages/`
- Add internationalization without integrating with `@atmos/i18n`

### ALWAYS
- Keep documentation content in MDX format
- Use meta.json for navigation configuration

---

## Compact Instructions

Preserve when compressing:
1. Content location (`content/docs/`)
2. Navigation via `meta.json`
3. Source config location (`src/lib/source.ts`)

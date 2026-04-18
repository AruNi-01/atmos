# Landing Page - AGENTS.md

> **🌈 Marketing Site**: Landing page for introducing the ATMOS project.

---

## Build And Test

- **Dev**: `just dev-landing` or `bun dev` (runs on port 3001)
- **Build**: `bun build`
- **Start**: `bun start`

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

---

## Safety Rails

### NEVER
- Add application-specific features here — this is a marketing site only
- Break visual consistency with main app design system

### ALWAYS
- Use shared UI components from `@workspace/ui`
- Keep content translations in sync


# Landing Page

This is the landing page for Vibe Habitat, built with Next.js and using the shared UI components and configuration from the monorepo.

## Features

- 🌐 Internationalization with next-intl (English & Chinese)
- 🎨 Shared UI components from `@vibe-habitat/ui`
- 🌓 Dark/Light theme support
- ⚡ Built with Next.js 16 and React 19
- 🎯 TypeScript for type safety
- 🎨 Tailwind CSS v4 for styling

## Getting Started

### Development

```bash
# From the project root
bun dev:landing

# Or from this directory
bun dev
```

The landing page will be available at `http://localhost:3001`.

### Build

```bash
bun build
```

### Production

```bash
bun start
```

## Structure

```
apps/landing/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── sections/
│   │   │   ├── hero-section.tsx
│   │   │   ├── features-section.tsx
│   │   │   ├── tech-stack-section.tsx
│   │   │   ├── cta-section.tsx
│   │   │   └── footer.tsx
│   │   ├── providers/
│   │   │   └── theme-provider.tsx
│   │   └── locale-switcher.tsx
│   ├── i18n/
│   │   └── request.ts
│   ├── lib/
│   │   └── utils.ts
│   └── proxy.ts
├── messages/
│   ├── en.json
│   └── zh.json
├── public/
├── package.json
├── next.config.ts
└── tsconfig.json
```

## Shared Dependencies

This app uses shared packages from the monorepo:

- `@vibe-habitat/ui` - Shared UI components (Button, ThemeToggle, LanguageSelector, etc.)
- `@vibe-habitat/i18n` - Shared i18n configuration and utilities
- `@vibe-habitat/shared` - Other shared utilities

## Customization

The landing page uses the same design system and color scheme as the main web app, ensuring visual consistency across all applications in the monorepo.

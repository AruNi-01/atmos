# Landing Page - Code Structure

> **📂 This document explains the file/folder structure** within the landing page app. For working instructions, see [AGENTS.md](./AGENTS.md).

---

## 🎯 Purpose

Marketing-focused landing page for ATMOS with:
- Hero section with CTA
- Feature showcase
- Tech stack highlights
- Call-to-action sections

## ⚡ Features

- 🌐 Internationalization with next-intl (English & Chinese)
- 🎨 Shared UI components from `@workspace/ui`
- 🌓 Dark/Light theme support
- ⚡ Built with Next.js 16 and React 19
- 🎯 TypeScript for type safety
- 🎨 Tailwind CSS v4 for styling

---

## 📁 Directory Structure

```
apps/landing/
├── public/                     # Static assets
│   ├── favicon.ico
│   └── images/
│
├── messages/                   # I18n translation files
│   ├── en.json                 # English translations
│   └── zh.json                 # Chinese translations
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [locale]/           # Internationalized routes
│   │   │   ├── layout.tsx      # Root layout
│   │   │   └── page.tsx        # Landing page
│   │   └── globals.css         # Global styles
│   │
│   ├── components/             # React components
│   │   ├── sections/           # Landing page sections
│   │   │   ├── hero-section.tsx
│   │   │   ├── features-section.tsx
│   │   │   ├── tech-stack-section.tsx
│   │   │   ├── cta-section.tsx
│   │   │   └── footer.tsx
│   │   ├── providers/
│   │   │   └── theme-provider.tsx
│   │   └── locale-switcher.tsx
│   │
│   ├── i18n/                   # I18n configuration
│   │   └── request.ts
│   │
│   ├── lib/
│   │   └── utils.ts
│   │
│   └── proxy.ts                # API proxy utilities
│
├── middleware.ts               # next-intl middleware
├── next.config.ts              # Next.js configuration
├── components.json             # shadcn configuration
├── postcss.config.mjs          # PostCSS configuration
├── tsconfig.json               # TypeScript configuration
├── package.json                # Dependencies
├── AGENTS.md                   # Working instructions
└── README.md                   # This file
```

---

## 📝 Section Components

All landing page sections are in `src/components/sections/`:

| Component | Purpose |
|-----------|---------|
| `hero-section.tsx` | Main hero with headline and CTA |
| `features-section.tsx` | Feature cards/grid |
| `tech-stack-section.tsx` | Technology stack showcase |
| `cta-section.tsx` | Call-to-action section |
| `footer.tsx` | Footer with links |

---

## 🌐 Internationalization

Landing page content is fully internationalized using next-intl.

Translation files in `messages/`:
```json
// messages/en.json
{
  "Hero": {
    "headline": "AI-first Workspace",
    "subheadline": "Boost your productivity",
    "cta": "Get Started"
  }
}
```

---

## 🚀 Quick Start

### Development

```bash
# From the project root
bun dev:landing

# Or from this directory
bun dev
```

Landing page will be available at `http://localhost:3001`.

### Build

```bash
bun build
```

### Production

```bash
bun start
```

---

## 📦 Shared Dependencies

This app uses shared packages from the monorepo:

- `@workspace/ui` - Shared UI components (Button, ThemeToggle, etc.)
- `@atmos/i18n` - Shared i18n configuration
- `@atmos/shared` - Shared utilities

---

## 🎨 Design Principles

1. **Visual Impact**: Eye-catching hero with animations
2. **Clear CTA**: Prominent call-to-action buttons
3. **Social Proof**: Feature highlights and tech stack
4. **Mobile-First**: Responsive design
5. **Performance**: Optimized images and lazy loading

---

## 🔗 Related Documentation

- **Working Instructions**: [AGENTS.md](./AGENTS.md)
- **UI Components**: [../../packages/ui/AGENTS.md](../../packages/ui/AGENTS.md)
- **I18n Setup**: [../../packages/i18n/AGENTS.md](../../packages/i18n/AGENTS.md)
- **Apps Overview**: [../AGENTS.md](../AGENTS.md)

---

**For Development**: See [AGENTS.md](./AGENTS.md) for commands, conventions, and workflows.

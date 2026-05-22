# Web App - Code Structure

> **📂 This document explains the file/folder structure** within the web app.

---

## 📁 Directory Structure

```
apps/web/
├── public/                     # Static assets
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [locale]/           # Internationalized routes
│   │   └── globals.css         # Global styles
│   ├── api/                    # 🌟 API Communication Layer
│   ├── app-shell/              # Global chrome, layout, sidebars, overlays
│   ├── features/               # Business feature folders
│   ├── i18n/                   # I18n configuration
│   ├── providers/              # App-wide React providers
│   └── shared/                 # Cross-feature components/hooks/lib/types
├── middleware.ts               # next-intl middleware
├── next.config.ts              # Next.js configuration
├── components.json             # shadcn configuration
├── package.json                # Dependencies
└── README.md                   # This file
```

---

## 🎯 Key Design Choices

### API Layer (`src/api/`)
Instead of a shared package, the API client is co-located within the app to allow for faster iteration and app-specific error handling. All calls to the Rust backend go through this layer.

### Feature Ownership (`src/features/`)
Business UI is grouped by feature. A feature owns its local components, hooks,
stores, helpers, and types unless they are genuinely shared by unrelated
features.

### Shared Code (`src/shared/`)
Shared code is intentionally narrow: reusable rendering components, cross-feature
hooks, platform helpers, preference stores, and domain types.

---

## 🔗 Related Documentation
- **Working Instructions**: [AGENTS.md](./AGENTS.md)
- **UI Components**: [../../packages/ui/AGENTS.md](../../packages/ui/AGENTS.md)
- **I18n Setup**: [../../packages/i18n/AGENTS.md](../../packages/i18n/AGENTS.md)

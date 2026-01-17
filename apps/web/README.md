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
│   ├── components/             # Local React components
│   ├── hooks/                  # Local React hooks
│   ├── types/                  # 🌟 TypeScript types
│   │   └── api.ts              # API Response/Request types
│   ├── api/                    # 🌟 API Communication Layer
│   │   └── client.ts           # Centralized API client
│   ├── i18n/                   # I18n configuration
│   └── lib/                    # Shared utilities
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

### Type Definition (`src/types/`)
`api.ts` serves as the frontend "Source of Truth" for the backend contract. When changing an Axum handler in `apps/api`, you must update the corresponding type here.

---

## 🔗 Related Documentation
- **Working Instructions**: [AGENTS.md](./AGENTS.md)
- **UI Components**: [../../packages/ui/AGENTS.md](../../packages/ui/AGENTS.md)
- **I18n Setup**: [../../packages/i18n/AGENTS.md](../../packages/i18n/AGENTS.md)

# UI Component Library - AGENTS.md

> **🎁 @workspace/ui**: Unified design system for ATMOS.

---

## Build And Test

- **Typecheck**: `cd packages/ui && bun run typecheck`
- **Add Component**: from repo root, `bunx --bun shadcn add <name> -c packages/ui` (or `cd packages/ui && bun run ui:add <name>`). `components.json` aliases are `@workspace/ui/...`, not `@/`.
- No build step — this package is compiled **inside the Next app**. `@/` is an app alias (`apps/web/src/*`), not a per-package alias. Shared UI code must import `@workspace/ui/lib/utils` (or a relative path), the same pattern as the official shadcn monorepo.

---

## 📁 Directory Structure

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── ui/              # Atomic shadcn components
│   │   ├── icons/           # Shared icons, including animated icons
│   │   ├── animate/         # Animation components
│   │   ├── websocket/       # WebSocket-related components
│   │   └── ai-elements/     # AI/AI chat elements
│   ├── utils/               # Utility functions
│   ├── styles/
│   │   └── globals.css      # Tailwind v4 theme tokens
│   ├── lib/                 # Library exports
│   └── assets/
│       └── fileicons/       # File type icons
├── postcss.config.mjs       # PostCSS configuration
└── package.json
```

---

## Coding Conventions

### Tailwind v4
- Uses pure CSS theme tokens in `src/styles/globals.css`

### Pure Components
- UI components should not have side effects or direct API calls

### Icons
- Put reusable icons in `src/components/icons/`
- Put animated icons in `src/components/icons/`, not `src/components/ui/`
- `src/components/ui/` is for composable UI primitives/components, not icon assets

---

## Safety Rails

### NEVER
- Add API calls or side effects to UI components
- Break semantic color variable conventions
- Add business logic to components

### ALWAYS
- Keep components atomic and reusable
- Use semantic CSS variables for theming
- Keep icon placement consistent: reusable icon files live under `src/components/icons/`
- Import other files in this package with `@workspace/ui/...` or a relative path. Do not use `@/` — Next/Turbopack has one import map per app and will resolve `@/` as `apps/web/src`.


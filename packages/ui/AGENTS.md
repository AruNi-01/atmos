# UI Component Library - AGENTS.md

> **🎁 @workspace/ui**: Unified design system for ATMOS.

---

## Build And Test

- **Typecheck**: `cd packages/ui && bun run typecheck`
- **Add Component**: `cd packages/ui && bun run ui:add` (shadcn CLI)
- No build step — this is a library package

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

## Floating / portaled primitives (desktop)

New **dialog, sheet, drawer, popover, menu, select, tooltip, hover-card**, or other **Portal** surfaces must use `usePortalContainer()` (see `portal-container.tsx`) so desktop can elevate them above native preview. Do not hard-require a desktop-only container — default remains document body for web.

→ Load full rules only when relevant: [agents/references/desktop-floating-ui.md](../../agents/references/desktop-floating-ui.md) (APP-052).

---

## Safety Rails

### NEVER
- Add API calls or side effects to UI components
- Break semantic color variable conventions
- Add business logic to components
- Assume CSS `z-index` alone stacks above desktop native preview (`WebContentsView`)

### ALWAYS
- Keep components atomic and reusable
- Use semantic CSS variables for theming
- Keep icon placement consistent: reusable icon files live under `src/components/icons/`
- Wire new floating portals through `usePortalContainer()` when adding primitives under `components/ui/`


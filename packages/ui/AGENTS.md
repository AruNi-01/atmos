# UI Component Library - AGENTS.md

> **🎁 @workspace/ui**: Unified design system for ATMOS.

---

## Build And Test

- **Typecheck**: `bun run --filter ui typecheck`
- **Add Component**: `bun run --filter ui ui:add` (shadcn CLI)
- No build step — this is a library package

---

## 📁 Directory Structure

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── ui/              # Atomic shadcn components
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

---

## Safety Rails

### NEVER
- Add API calls or side effects to UI components
- Break semantic color variable conventions
- Add business logic to components

### ALWAYS
- Keep components atomic and reusable
- Use semantic CSS variables for theming

---

## Compact Instructions

Preserve when compressing:
1. Components must remain pure (no API calls)
2. Theme tokens location (`src/styles/globals.css`)
3. Atomic component pattern

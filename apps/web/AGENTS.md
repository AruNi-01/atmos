# Web Application - AGENTS.md

> **💻 Main Workspace**: Primary Next.js web application for ATMOS.

---

## Build And Test

- **Dev**: `just dev-web` or `bun dev`
- **Build**: `bun build`
- **Test**: `bun test` (if applicable)
- **Lint**: `bun lint`
- **Typecheck**: `bun typecheck`

---

## 📁 Directory Structure

```
apps/web/
├── src/
│   ├── app/
│   │   └── [locale]/
│   │       ├── (app)/       # Main app routes
│   │       │   ├── terminals/
│   │       │   ├── workspace/
│   │       │   ├── agents/
│   │       │   ├── workspaces/
│   │       │   ├── project/
│   │       │   └── skills/
│   │       ├── api/         # API routes
│   │       └── layout.tsx
│   ├── components/
│   │   ├── layout/          # Layout components (sidebar, etc.)
│   │   ├── workspace/       # Workspace-specific components
│   │   ├── code-block/      # Code display components
│   │   ├── markdown/        # Markdown rendering
│   │   └── ui/              # Generic UI components (from @workspace/ui)
│   ├── types/               # TypeScript definitions
│   └── utils/               # Shared utilities
├── public/                  # Static assets
└── package.json
```

---

## Coding Conventions

### API Client & Types
- All API interaction logic lives in `src/api/`
- Use `src/types/api.ts` to define backend response shapes — these should strictly match Rust DTOs in `apps/api/src/api/dto.rs`
- Use centralized `client.ts` for all network requests to ensure consistent error handling

### Component Organization
- Generic UI components — consume from `@workspace/ui`
- Business-specific components (`ProjectList`, `WorkspaceTerminal`) — live in `src/components/`
- Loading icons — use `RotateCw` for static refresh/action icons; use `LoaderCircle` with `animate-spin` only for actively loading/spinning states.

### State Management
- Prefer server components and `fetch` for data fetching
- Use `hooks/` for client-side state logic

### Theme Adaptation (Light/Dark)
- **Semantic Colors**: ALWAYS use semantic CSS variables (`bg-background`, `text-muted-foreground`, `border-border`) instead of hardcoded colors (`bg-zinc-900`, `text-white`)
- **Standard Variables**:
  - Backgrounds: `bg-background`, `bg-sidebar`, `bg-muted`, `bg-accent`
  - Text: `text-foreground`, `text-muted-foreground`, `text-sidebar-foreground`
  - Borders: `border-border`, `border-sidebar-border`
- **Testing**: Verify all UI changes in **both** Light and Dark modes
- **Components**: For active/inactive states, use patterns that work in both modes (e.g., `data-[state=active]:bg-sidebar-accent`)

---

## Safety Rails

### NEVER
- Use `fetch()` or `axios()` directly inside feature components — use the `src/api/` layer
- Use hardcoded Tailwind colors like `bg-zinc-900` or `text-gray-500` for layout components
- Commit UI changes without testing in both Light and Dark modes

### ALWAYS
- Keep API types in sync with backend DTOs
- Check your UI changes in Light Mode before committing
- Use semantic CSS variables for theming


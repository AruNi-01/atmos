# Web Application - AGENTS.md

> **💻 Main Workspace**: The primary Next.js web application for ATMOS.

---

## 📁 Directory Structure

```
apps/web/
├── src/
│   ├── app/                 # Next.js App Router (Pages & Layouts)
│   ├── components/          # Web-specific UI components
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript definitions
│   │   └── api.ts           # 🌟 API DTO Type Alignment
│   ├── api/                 # 🌟 API Client Layer
│   │   └── client.ts        # Axios/Fetch wrapper
│   ├── lib/                 # Shared utilities
│   └── proxy.ts             # API Route Proxying
├── public/                  # Static assets
└── package.json
```

---

## 🛠 Working Guidelines

### 1. API Client & Types
- **Location**: All API interaction logic is in `src/api/`.
- **Type Safety**: Use `src/types/api.ts` to define the shape of backend responses. These should strictly match the Rust DTOs in `apps/api/src/api/dto.rs`.
- **Methodology**: Use the centralized `client.ts` for all network requests to ensure consistent error handling and header injection.

### 2. Component Organization
- Generic UI components should be consumed from `@workspace/ui`.
- Business-specific components (e.g., `ProjectList`, `WorkspaceTerminal`) should live in `src/components/`.

### 3. State Management
- Prefer server components and `fetch` for data fetching where possible.
- Use `hooks/` for client-side state logic.

### 4. Theme Adaptation (Light/Dark)
- **Semantic Colors**: ALWAYS use semantic CSS variables (e.g., `bg-background`, `text-muted-foreground`, `border-border`) instead of hardcoded colors (e.g., `bg-zinc-900`, `text-white`).
- **Standard Variables**:
  - Backgrounds: `bg-background`, `bg-sidebar`, `bg-muted`, `bg-accent`
  - Text: `text-foreground`, `text-muted-foreground`, `text-sidebar-foreground`
  - Borders: `border-border`, `border-sidebar-border`
- **Testing**: Verify all UI changes in **both** Light and Dark modes to ensure visibility and contrast.
- **Components**: For active/inactive states, use patterns that work in both modes (e.g., `data-[state=active]:bg-sidebar-accent` works better than hardcoding white/black).

---

## 🚦 Interaction Rules
- **DO**: Keep API types updated when backend DTOs change.
- **DO**: Check your UI changes in Light Mode before committing.
- **DON'T**: Manually use `fetch()` or `axios()` inside feature components. Use the `src/api/` layer.
- **DON'T**: Use hardcoded tailwind colors like `bg-zinc-900` or `text-gray-500` for layout components.

---

## 🚀 Commands
```bash
bun dev      # Start Next.js development server
bun build    # Build for production
```

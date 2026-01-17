# Web Application - AGENTS.md

> **💻 Main Workspace**: The primary Next.js web application for Vibe Habitat.

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

---

## 🚦 Interaction Rules
- **DO**: Keep API types updated when backend DTOs change.
- **DON'T**: Manually use `fetch()` or `axios()` inside feature components. Use the `src/api/` layer.

---

## 🚀 Commands
```bash
bun dev      # Start Next.js development server
bun build    # Build for production
```

# Shared Utilities - AGENTS.md

> **🎁 @workspace/shared**: Logic and hooks shared across the frontend ecosystem.

## Structure
- **Hooks (src/hooks/)**: Generic React hooks (e.g., `useAsync`, `useLocalStorage`).
- **Utils (src/utils/)**: Framework-agnostic helpers (e.g., `cn`, date formatting).
- **Types (src/types/)**: Shared frontend-only types.

## Working Patterns
- **Tree Shaking**: Ensure exports are clean to minimize bundle size.
- **Pure Functions**: Utils should be side-effect free.

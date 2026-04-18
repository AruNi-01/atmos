# Packages Directory - AGENTS.md

> **📦 Shared Capabilities**: Common UI, logic, and configurations.

---

## 📁 Shared Packages

| Package | Purpose | Namespace |
|---------|---------|-----------|
| **ui** | Component Library | `@workspace/ui` |
| **shared** | Utils & Hooks | `@atmos/shared` |
| **config** | TS/Lint configs | `@workspace/config` |
| **i18n** | Translations | `@workspace/i18n` |

---

## Build And Test

- **Install**: `bun install` (from root)
- **Typecheck**: `bun run --filter <package> typecheck`
- **UI Dev**: `bun run --filter ui typecheck` + `ui:add` for adding components

---

## Safety Rails

### NEVER
- Add API calls to `@workspace/ui` — must remain pure UI
- Put API clients in packages — they live in individual apps (e.g., `apps/web/src/api/`)
- Create circular dependencies between packages

### ALWAYS
- Depend on packages via `workspace:*` protocol
- Keep packages focused on their specific purpose

---

## Architecture Note

**Decentralized API Clients**: API clients and type definitions are co-located within individual applications. This allows apps to evolve their data requirements independently while maintaining a clear link to backend DTOs.


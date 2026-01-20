# Packages Directory - AGENTS.md

> **📦 Shared Capabilities**: Common UI, logic, and configurations.

---

## 📁 Shared Packages

| Package | Purpose | Standard Namespace |
|---------|---------|-------------------|
| **ui** | Component Library | `@workspace/ui` |
| **shared** | Utils & Hooks | `@atmos/shared` |
| **config** | TS/Lint configs | `@workspace/config` |
| **i18n** | Translations | `@workspace/i18n` |

---

## 🛠 Usage Standards

### 1. The `@workspace/ui` Package
- **Atomic components** only in `src/components/ui`.
- **NO API CALLS**: This package must remain pure UI.

### 2. The `@atmos/shared` Package
- Contains common logic and framework-agnostic utilities.

---

## 🚦 Architecture Note: API Clients
- **Decentralized API Clients**: Following the current architecture, API clients and Type definitions are co-located within individual applications (e.g., `apps/web/src/api/` and `apps/web/src/types/api.ts`).
- **Reasoning**: This allows apps to evolve their data requirements independently while maintaining a clear link to the backend DTOs.

---

## 🚦 Integration Rule
- Apps **MUST** depend on these packages via workspace protocol (`workspace:*`).

# Shared Utilities - AGENTS.md

> **🎁 @atmos/shared**: Logic and hooks shared across the frontend ecosystem.

---

## Build And Test

- **Typecheck**: `bun run --filter shared typecheck`
- No build step — this is a library package

---

## 📁 Directory Structure

```
packages/shared/
└── src/
    ├── hooks/               # Generic React hooks
    ├── utils/               # Framework-agnostic helpers
    └── lib.ts               # Module exports
```

---

## Coding Conventions

### Tree Shaking
- Ensure exports are clean to minimize bundle size

### Pure Functions
- Utils should be side-effect free

---

## Safety Rails

### NEVER
- Add framework-specific code to utils — keep them framework-agnostic
- Add API calls or side effects to utility functions

### ALWAYS
- Keep utilities pure and reusable
- Use tree-shaking-friendly exports

---

## Compact Instructions

Preserve when compressing:
1. Directory structure (hooks/, utils/, types/)
2. Framework-agnostic requirement for utils
3. Pure function requirement

# i18n Package - AGENTS.md

> **🌍 @workspace/i18n**: Shared internationalization configuration and navigation logic.

---

## Build And Test

- No build step — this is a configuration/library package
- Typecheck: `bun run --filter i18n typecheck`

---

## 📁 Directory Structure

```
packages/i18n/
└── src/
    ├── config.ts            # Locale definitions (locales, defaultLocale)
    ├── routing.ts           # Shared routing object (defineRouting)
    ├── navigation.ts        # Localized navigation utilities (Link, useRouter, etc.)
    ├── middleware.ts        # i18n middleware for Next.js
    └── index.ts             # Module exports
```

---

## Coding Conventions

### Middleware Usage
- Import `i18nMiddleware` from `@atmos/i18n/middleware`
- The `config` object with `matcher` must be defined **locally** in each app's middleware file (Next.js requires static analysis at build time)

### Navigation Components
- Use hooks and `Link` from `@atmos/i18n/navigation` instead of `next-intl/navigation` directly
- This enables type safety based on shared routing configuration

### App-Specific request.ts
- The `request.ts` file (loads translation JSON) remains **inside each application**
- Import types and config from this package

---

## Safety Rails

### NEVER
- Put translation JSON files here — they live in individual apps
- Define matcher config in this package — must be local to each app

### ALWAYS
- Use `@atmos/i18n/navigation` for type-safe routing
- Import `routing` and types from this package for app-specific `request.ts`


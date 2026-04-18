# Config Package - AGENTS.md

> **⚙️ @atmos/config**: Shared configuration files for TypeScript.

---

## Build And Test

- No build step — this is a configuration-only package
- Configured via `extends` in consuming app's `tsconfig.json`

---

## 📁 Directory Structure

```
packages/config/
└── typescript/
    └── nextjs.json          # Next.js TypeScript configuration
```

---

## Coding Conventions

### TypeScript Configuration
- Apps extend from `@atmos/config/typescript/nextjs`

### Migrated Configurations
The following have moved to `@workspace/ui`:
- PostCSS config → use `@workspace/ui/postcss.config`
- Styles → use `@workspace/ui/globals.css`
- Tailwind → v4 requires no config file

### ESLint
- ESLint configuration is managed by individual apps
- Typically uses `eslint-config-next`

---

## Safety Rails

### NEVER
- Put ESLint configs here — apps manage their own
- Put PostCSS/Tailwind configs here — they're in `@workspace/ui`

### ALWAYS
- Extend TypeScript config from `@atmos/config/typescript/nextjs`
- Keep this package focused on base TypeScript configuration


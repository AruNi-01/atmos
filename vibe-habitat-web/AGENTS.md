# AGENTS.md

## Build & Commands

```bash
bun install          # Install dependencies
bun dev              # Start dev server
bun build            # Production build
bun start            # Start production server
bun lint             # Run ESLint
```

## Code Style

- **Imports**: Use `@/` alias for internal imports (e.g., `@/components/ui/button`)
- **Types**: Enable `strict: true` in tsconfig; avoid `any`, use explicit types
- **Components**: Use `.tsx` files, `"use client"` for client components, export named components
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss`; use `cn()` utility from `@/lib/utils` for class merging
- **Variants**: Use `class-variance-authority` (cva) for component variants (see button.tsx)
- **State**: Use Zustand with persist middleware for client state
- **Formatting**: ESLint Next.js config enforced; no additional prettier config needed
- **Error Handling**: Handle errors explicitly; avoid empty catch blocks
- **Naming**: PascalCase for components, camelCase for functions/variables, kebab-case for file names

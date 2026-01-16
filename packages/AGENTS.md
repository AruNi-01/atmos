# Packages Directory

This directory contains shared packages that are used across different applications in the `apps/` directory.

## Structure

- **ui**: Reusable UI components (based on Shadcn UI), styles, and icons.
- **i18n**: Internationalization logic, routing configuration, and navigation utilities.
- **config**: Shared configurations (ESLint, Tailwind, TypeScript, etc.).
- **shared**: Shared utilities, hooks, and types.

## Usage

Packages are managed using Bun workspaces. To use a package in an app:

1.  Add the dependency to the app's `package.json`:
    ```json
    {
      "dependencies": {
        "@vibe-habitat/ui": "workspace:*",
        "@vibe-habitat/i18n": "workspace:*"
      }
    }
    ```

2.  Import components or utilities in your code:
    ```tsx
    import { Button } from "@vibe-habitat/ui";
    import { routing } from "@vibe-habitat/i18n/routing";
    ```

## Important Notes

### Tailwind CSS v4 Integration

When using UI components from `@vibe-habitat/ui` (or any other package with Tailwind classes) in a Next.js app (or any Tailwind v4 app), you **MUST** explicitly tell Tailwind to scan the package source files.

In your app's main CSS file (e.g., `apps/web/src/app/globals.css`), add a `@source` directive:

```css
@import "tailwindcss";

/* 
  Crucial: Tell Tailwind to scan the UI package for class names.
  Adjust the path if your directory structure differs.
*/
@source "../../../../packages/ui"; 

@import "tw-animate-css";
/* ... other imports ... */
```

**Why?**
Startups using Tailwind v4 rely on automatic content detection. If you don't add `@source`, Tailwind won't "see" that you are using classes like `bg-primary` or `p-4` inside `node_modules` (even in workspaces), and those styles will be missing (components will look transparent or unstyled).

# i18n Package

This package contains the shared internationalization configuration and navigation logic for the workspace.

## Purpose

- Centralize locale definitions (supported languages).
- Define shared routing logic (e.g., URL prefixes).
- Provide type-safe navigation hooks and components.

## Structure

- **`config.ts`**: Defines the supported locales (`locales`) and the default locale (`defaultLocale`).
- **`routing.ts`**: Exports the `routing` object created by `defineRouting`.
- **`navigation.ts`**: Exports localized navigation utilities: `Link`, `useRouter`, `usePathname`, `redirect`.

## Usage

### 1. In `middleware.ts` (App)

Import `i18nMiddleware` to create the middleware used in the `proxy` function (or default export).

**Note**: The `config` object with the `matcher` must be defined **locally** in the app's middleware file. It cannot be imported from a package because Next.js requires static analysis of the configuration at build time.

```ts
import type { NextRequest } from "next/server";
import { i18nMiddleware } from "@atmos/i18n/middleware";

export function proxy(request: NextRequest) {
  return i18nMiddleware(request);
}

export const config = {
  // Match all pathnames except for
  // - API routes
  // - Static files (images, etc.)
  // - _next (Next.js internals)
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

### 2. In Components

Use the hooks and `Link` component from this package instead of `next-intl/navigation` directly. This enables type safety based on your shared routing configuration.

```tsx
import { Link, useRouter } from "@atmos/i18n/navigation";

// ...
<Link href="/about">About</Link>
```

### 3. App-Specific `request.ts`

Note that the `request.ts` file (which loads the actual translation JSON files) typically usually remains **inside the application** (e.g., `apps/web/src/i18n/request.ts`). This is because the location and structure of translation files (`messages/*.json`) often vary between applications.

However, that `request.ts` should import types and config from here:

```ts
import { routing } from "@atmos/i18n/routing";
import { Locale } from "@atmos/i18n/config";
```

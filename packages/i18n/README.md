# I18n Package - Code Structure

> **📂 This document explains the file/folder structure** within the i18n package. For working instructions, see [AGENTS.md](./AGENTS.md).

---

## 📁 Directory Structure

```
packages/i18n/
├── src/
│   ├── config.ts               # Language configuration
│   ├── routing.ts              # Routing configuration
│   ├── navigation.ts           # Navigation utilities
│   ├── request.ts              # Server-side utilities
│   └── types.ts                # TypeScript types
│
├── package.json                # Package metadata
├── tsconfig.json               # TypeScript configuration
├── AGENTS.md                   # Working instructions
└── README.md                   # This file
```

---

## 📝 Core Files

### 1. Config (`src/config.ts`)

Language and locale configuration.

```typescript
// src/config.ts
export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};
```

**Usage**:
```tsx
import { locales, defaultLocale, localeNames } from "@atmos/i18n/config";

console.log(locales); // ["en", "zh"]
console.log(defaultLocale); // "en"
console.log(localeNames.zh); // "中文"
```

---

### 2. Routing (`src/routing.ts`)

next-intl routing configuration.

```typescript
// src/routing.ts
import { defineRouting } from "next-intl/routing";
import { locales, defaultLocale } from "./config";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed", // or "always"
});
```

**Usage in Middleware**:
```typescript
// middleware.ts
import { routing } from "@atmos/i18n/routing";
import createMiddleware from "next-intl/middleware";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
```

---

### 3. Navigation (`src/navigation.ts`)

Type-safe navigation utilities.

```typescript
// src/navigation.ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter } = 
  createNavigation(routing);
```

**Usage in Components**:
```tsx
import { Link, useRouter, usePathname } from "@atmos/i18n/navigation";

export function MyComponent() {
  const router = useRouter();
  const pathname = usePathname();
  
  return (
    <>
      <Link href="/about">About</Link>
      <button onClick={() => router.push("/contact")}>
        Contact
      </button>
      <p>Current path: {pathname}</p>
    </>
  );
}
```

---

### 4. Request (`src/request.ts`)

Server-side message loading.

```typescript
// src/request.ts
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validate locale
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

**Usage in Next.js Config**:
```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ... other config
};

export default nextConfig;
```

**Reference in App**:
```typescript
// i18n/request.ts (in app)
import request from "@atmos/i18n/request";
export default request;
```

---

### 5. Types (`src/types.ts`)

Shared TypeScript types.

```typescript
// src/types.ts
import type { locales } from "./config";

export type Locale = (typeof locales)[number];

export interface LocaleOption {
  code: Locale;
  name: string;
  flag: string;
}
```

---

## 🌐 Translation File Structure

Translation files are stored in each app's `messages/` directory:

```
apps/web/
├── messages/
│   ├── en.json
│   └── zh.json
```

**Example Translation File**:
```json
// messages/en.json
{
  "HomePage": {
    "title": "Welcome to ATMOS",
    "description": "AI-first workspace"
  },
  "Navigation": {
    "home": "Home",
    "about": "About",
    "contact": "Contact"
  }
}
```

```json
// messages/zh.json
{
  "HomePage": {
    "title": "欢迎来到 ATMOS",
    "description": "AI 优先的工作空间"
  },
  "Navigation": {
    "home": "首页",
    "about": "关于",
    "contact": "联系"
  }
}
```

---

## 🔄 Usage Patterns

### In Server Components

```tsx
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("HomePage");
  
  return <h1>{t("title")}</h1>;
}
```

### In Client Components

```tsx
"use client";
import { useTranslations } from "next-intl";

export function ClientComponent() {
  const t = useTranslations("HomePage");
  
  return <h1>{t("title")}</h1>;
}
```

### With Parameters

```json
// messages/en.json
{
  "greeting": "Hello, {name}!"
}
```

```tsx
const t = useTranslations();
t("greeting", { name: "Alice" }); // "Hello, Alice!"
```

---

## 📦 Package Exports

```json
{
  "name": "@atmos/i18n",
  "exports": {
    "./config": "./src/config.ts",
    "./routing": "./src/routing.ts",
    "./navigation": "./src/navigation.ts",
    "./request": "./src/request.ts",
    "./types": "./src/types.ts"
  }
}
```

---

## 🎯 Integration in Apps

### Step 1: Install Dependency

```json
// apps/web/package.json
{
  "dependencies": {
    "@atmos/i18n": "workspace:*",
    "next-intl": "^4.0.0"
  }
}
```

### Step 2: Create i18n Request Handler

```typescript
// apps/web/src/i18n/request.ts
import request from "@atmos/i18n/request";
export default request;
```

### Step 3: Configure Next.js

```typescript
// apps/web/next.config.ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
```

### Step 4: Setup Middleware

```typescript
// apps/web/middleware.ts
import { routing } from "@atmos/i18n/routing";
import createMiddleware from "next-intl/middleware";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
```

### Step 5: Create Localized Layout

```tsx
// apps/web/src/app/[locale]/layout.tsx
import { routing } from "@atmos/i18n/routing";
import { setRequestLocale } from "next-intl/server";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
```

---

## 🌍 Adding New Locales

### Step 1: Update Config

```typescript
// packages/i18n/src/config.ts
export const locales = ["en", "zh", "ja"] as const; // Add "ja"

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語", // Add Japanese
};
```

### Step 2: Create Translation File

```bash
# In each app
touch messages/ja.json
```

### Step 3: Add Translations

```json
// messages/ja.json
{
  "HomePage": {
    "title": "ATMOS へようこそ"
  }
}
```

---

## 📦 Dependencies

### Production Dependencies
- `next-intl`: Internationalization for Next.js

### Peer Dependencies
- `next`: Next.js framework
- `react`: React library

---

## 🔗 Related Documentation

- **Working Instructions**: [AGENTS.md](./AGENTS.md)
- **Package Overview**: [../AGENTS.md](../AGENTS.md)
- **Usage in Apps**: [../../apps/AGENTS.md](../../apps/AGENTS.md)
- **next-intl Docs**: https://next-intl-docs.vercel.app/

---

## 📚 Best Practices

1. **Namespace Translations**: Group related translations
2. **Type Safety**: Use TypeScript for translation keys
3. **Consistent Keys**: Use same structure across locales
4. **Fallback**: Always have English translations
5. **No Hardcoded Text**: All user-facing text should be translated

---

**For Development**: See [AGENTS.md](./AGENTS.md) for usage patterns and contribution guidelines.

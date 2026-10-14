# Docs Site - Code Structure

> **📂 This document explains the file/folder structure** within the documentation site. For working instructions, see [AGENTS.md](./AGENTS.md).

---

## 🎯 Purpose

Documentation site built with [Fumadocs](https://fumadocs.dev) for ATMOS.

---

## 📁 Directory Structure

```
apps/docs/
├── content/                    # MDX documentation files
│   └── docs/
│       ├── index.mdx
│       ├── getting-started.mdx
│       └── ...
│
├── public/                     # Static assets
│
├── src/
│   ├── app/
│   │   ├── (home)/             # Landing page route group
│   │   │   └── page.tsx
│   │   ├── docs/               # Documentation pages
│   │   │   ├── layout.tsx
│   │   │   └── [[...slug]]/
│   │   │       └── page.tsx
│   │   ├── api/
│   │   │   └── search/         # Search API endpoint
│   │   │       └── route.ts
│   │   └── globals.css
│   │
│   └── lib/
│       ├── source.ts           # Content source adapter
│       └── layout.shared.tsx   # Shared layout options
│
├── source.config.ts            # Fumadocs MDX config
├── next.config.ts              # Next.js configuration
├── tsconfig.json               # TypeScript configuration
├── package.json                # Dependencies
├── AGENTS.md                   # Working instructions
└── README.md                   # This file
```

---

## 📝 Key Files Explained

### `lib/source.ts`

Content source adapter that provides the `loader()` interface to access MDX content.

### `lib/layout.shared.tsx`

Shared options for layouts, optional but preferred to keep consistency.

### `source.config.ts`

Fumadocs MDX config where you can customize frontmatter schema and other options.

---

## 🗂 Route Structure

| Route                     | Description                    |
| ------------------------- | ------------------------------ |
| `app/(home)`              | Landing page and other pages   |
| `app/docs`                | Documentation layout and pages |
| `app/api/search/route.ts` | Search API endpoint            |

---

## 🚀 Quick Start

### Development

```bash
# From project root
bun dev:docs

# Or from this directory
bun dev
```

Open http://localhost:3002 with your browser to see the result.

---

## ✍️ Writing Documentation

### Create New Page

1. Add MDX file in `content/docs/`:

```bash
touch content/docs/my-new-page.mdx
```

2. Add frontmatter:

```mdx
---
title: My New Page
description: Page description
---

# My New Page

Content here...
```

3. The page will be automatically available at `/docs/my-new-page`

---

## 🔍 Search

Search functionality is provided by Fumadocs via the `/api/search` endpoint.

---

## 📦 Shared Dependencies

- `@workspace/ui` - Shared UI components
- `fumadocs-ui` - Fumadocs UI components
- `fumadocs-mdx` - MDX processing

---

## 🔗 Related Documentation

- **Working Instructions**: [AGENTS.md](./AGENTS.md)
- **Apps Overview**: [../AGENTS.md](../AGENTS.md)
- **Fumadocs Docs**: https://fumadocs.dev

---

## 📚 Learn More

Resources:

- [Next.js Documentation](https://nextjs.org/docs)
- [Fumadocs](https://fumadocs.dev)
- [Fumadocs MDX Introduction](https://fumadocs.dev/docs/mdx)

---

**For Development**: See [AGENTS.md](./AGENTS.md) for commands, conventions, and workflows.

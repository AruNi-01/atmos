# Frontend Integration Guide

This guide explains how to render an ATMOS Project Wiki in a frontend application. The Wiki's pure JSON + Markdown format makes integration straightforward with any modern framework.

## Overview

The frontend integration consists of four steps:
1. Read `_catalog.json` to obtain the navigation structure
2. Render a navigation tree from the catalog
3. Load and render Markdown documents on demand
4. Support Mermaid diagrams and code highlighting

---

## 1. Read Catalog Structure

```typescript
import fs from 'fs';
import path from 'path';

const catalogPath = path.join(process.cwd(), '.atmos/wiki/_catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
```

## 2. Render Navigation Tree

```tsx
function WikiNav({ catalog }: { catalog: CatalogItem[] }) {
  return (
    <nav>
      {catalog.map(item => (
        <NavItem key={item.id} item={item} />
      ))}
    </nav>
  );
}

function NavItem({ item }: { item: CatalogItem }) {
  return (
    <div>
      <Link href={`/wiki/${item.path}`}>{item.title}</Link>
      {item.children.length > 0 && (
        <ul>
          {item.children.map(child => (
            <NavItem key={child.id} item={child} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

## 3. Render Markdown Documents

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Mermaid } from 'mdx-mermaid/Mermaid';

function WikiPage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const lang = match ? match[1] : '';

          if (lang === 'mermaid') {
            return <Mermaid chart={String(children)} />;
          }

          return <code className={className} {...props}>{children}</code>;
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

## 4. Validate Catalog (Optional)

For build-time validation, use the zero-dependency scripts included in the skill:

```bash
# Bash + jq
bash scripts/validate_catalog.sh .atmos/wiki/_catalog.json

# Python3 stdlib
python3 scripts/validate_catalog.py .atmos/wiki/_catalog.json
```

For runtime validation in the frontend, a lightweight check can verify the catalog structure:

```typescript
function validateCatalog(catalog: any): boolean {
  if (!catalog.version || !catalog.project?.name || !Array.isArray(catalog.catalog)) {
    return false;
  }
  return catalog.catalog.length > 0;
}

const catalog = JSON.parse(fs.readFileSync('.atmos/wiki/_catalog.json', 'utf-8'));
if (!validateCatalog(catalog)) {
  console.error('Invalid catalog structure');
  return;
}
renderWiki(catalog);
```

---

## Recommended Libraries

| Purpose | Library | Notes |
|---------|---------|-------|
| Markdown Rendering | `react-markdown` + `remark-gfm` | Supports GFM tables, strikethrough, etc. |
| Mermaid Diagrams | `mermaid` or `mdx-mermaid` | Handle `language-mermaid` code blocks |
| Code Highlighting | `prism-react-renderer` or `highlight.js` | Syntax highlighting for code blocks |

## Key Considerations

- **Relative links**: Convert Markdown relative links (e.g., `../core/auth.md`) to frontend routes (e.g., `/wiki/core/auth`).
- **Mermaid rendering**: Ensure the Mermaid library is initialized before rendering diagrams. Lazy-load the library for performance.
- **Source links**: Code snippet source links (e.g., `> **Source**: [src/main.rs](...) `) can be rendered as clickable links to the repository or local file viewer.
- **Sorting**: Always sort catalog items by the `order` field when rendering navigation.

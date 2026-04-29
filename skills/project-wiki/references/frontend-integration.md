# Frontend Integration Guide

The frontend should treat `page_registry.json` as the primary contract.

## Read Order

1. Read `page_registry.json`
2. Build navigation from `navigation`
3. Resolve file paths from `pages[*].file`
4. Load Markdown pages on demand
5. Render `sources` and `evidence_refs` metadata from page frontmatter

## Compatibility

If a project only has legacy `_catalog.json`, the frontend may normalize it into the same internal shape, but new generation should target `page_registry.json`.

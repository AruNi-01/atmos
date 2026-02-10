/**
 * Utilities for Project Wiki: catalog parsing, heading extraction, slug generation.
 * Slug logic must match MarkdownRenderer heading ids for TOC anchor consistency.
 */
import BananaSlug, { slug } from "github-slugger";

export interface CatalogItem {
  id: string;
  title: string;
  path: string;
  order: number;
  file: string;
  children: CatalogItem[];
}

export interface CatalogData {
  version: string;
  generated_at: string;
  project: {
    name: string;
    description: string;
    repository?: string;
  };
  catalog: CatalogItem[];
}

export interface Heading {
  level: 2 | 3 | 4;
  text: string;
  id: string;
}

/** Flatten catalog into a list of leaf items (pages) with file paths, sorted by order */
export function flattenCatalog(catalog: CatalogItem[]): { id: string; title: string; file: string }[] {
  const result: { id: string; title: string; file: string }[] = [];

  function visit(items: CatalogItem[]) {
    const sorted = [...items].sort((a, b) => a.order - b.order);
    for (const item of sorted) {
      if (item.children.length === 0) {
        result.push({ id: item.id, title: item.title, file: item.file });
      } else {
        visit(item.children);
      }
    }
  }
  visit(catalog);
  return result;
}

/** Build a tree from catalog for sidebar navigation (includes both categories and leaves) */
export function buildCatalogTree(catalog: CatalogItem[]): CatalogItem[] {
  return [...catalog].sort((a, b) => a.order - b.order);
}

/** Slugify heading text to match rehype-slug / github-slugger output (no dedup) */
export function slugifyHeading(text: string): string {
  return slug(text);
}

/** Extract h2/h3/h4 headings from markdown for TOC. Uses GitHubSlugger for dedup. */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const slugger = new BananaSlug();

  const regex = /^(#{2,4})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const level = match[1].length as 2 | 3 | 4;
    const text = match[2].trim();
    const id = slugger.slug(text);
    headings.push({ level, text, id });
  }
  return headings;
}

/** Parse frontmatter from markdown content */
export interface ParsedFrontmatter {
  title?: string;
  path?: string;
  sources?: string[];
  updated_at?: string;
  [key: string]: unknown;
}

export function parseFrontmatter(markdown: string): {
  frontmatter: ParsedFrontmatter;
  body: string;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: markdown };
  }
  const [, raw, body] = match;
  const frontmatter: ParsedFrontmatter = {};
  if (raw) {
    for (const line of raw.split(/\r?\n/)) {
      const keyMatch = line.match(/^([a-z_]+):\s*(.*)$/);
      if (keyMatch) {
        const key = keyMatch[1];
        let val = keyMatch[2].trim();
        if (val.startsWith("[") && val.endsWith("]")) {
          try {
            (frontmatter as Record<string, unknown>)[key] = JSON.parse(val);
          } catch {
            (frontmatter as Record<string, unknown>)[key] = val;
          }
        } else if (val) {
          (frontmatter as Record<string, unknown>)[key] = val;
        }
      }
    }
    const sourcesMatch = raw.match(/sources:\r?\n((?:\s+-\s+[^\n]+\r?\n?)+)/);
    if (sourcesMatch) {
      const items = sourcesMatch[1].match(/-\s+(.+)/g)?.map((s) => s.replace(/^-\s+/, "").trim()) ?? [];
      frontmatter.sources = items;
    }
  }
  return { frontmatter, body };
}

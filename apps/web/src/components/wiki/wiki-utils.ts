/**
 * Utilities for Project Wiki: catalog parsing, heading extraction, slug generation.
 * Slug logic must match MarkdownRenderer heading ids for TOC anchor consistency.
 */
import BananaSlug, { slug } from "github-slugger";

export type WikiSection = "getting-started" | "deep-dive" | "specify-wiki";
export type WikiLevel = "beginner" | "intermediate" | "advanced";

export interface CatalogItem {
  id: string;
  title: string;
  path: string;
  order: number;
  file: string;
  children: CatalogItem[];
  /** Which major section: "getting-started" or "deep-dive" */
  section?: WikiSection;
  /** Difficulty level */
  level?: WikiLevel;
  /** Estimated reading time in minutes */
  reading_time?: number;
}

export interface CatalogData {
  version: string;
  generated_at: string;
  /** Git HEAD commit hash when wiki was generated (required for incremental updates; missing in legacy wikis) */
  commit_hash?: string;
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

/** Known top-level section ids for the two-part wiki structure */
const TOP_LEVEL_SECTION_IDS = new Set(["getting-started", "deep-dive", "specify-wiki"]);

/** Check if a catalog item is a top-level section header (not a navigable page) */
export function isTopLevelSection(item: CatalogItem): boolean {
  return TOP_LEVEL_SECTION_IDS.has(item.id) || item.section === item.id;
}

/** Raw item from JSON — may lack order/children (agent-generated flat catalogs) */
type RawCatalogItem = Partial<CatalogItem> & {
  id: string;
  title: string;
  path: string;
  file: string;
  section?: string;
  children?: RawCatalogItem[];
};

/** Detect if catalog is flat (agent didn't follow hierarchy). */
function isFlatCatalog(items: RawCatalogItem[]): boolean {
  if (items.length === 0) return false;
  const first = items[0];
  return !first.children && (first.section === "getting-started" || first.section === "deep-dive");
}

/** Normalize catalog: fix project-as-string, flat structure, missing order/children. */
export function normalizeCatalog(data: CatalogData): CatalogData {
  let d = data;

  // Agent sometimes writes project as string — convert to object
  const proj = d.project;
  if (typeof proj === "string") {
    d = { ...d, project: { name: proj, description: proj } };
  } else if (proj && typeof proj === "object" && (!proj.name || !proj.description)) {
    d = {
      ...d,
      project: {
        name: proj.name ?? "Project",
        description: proj.description ?? "Project documentation",
        repository: proj.repository,
      },
    };
  }

  const raw = d.catalog as unknown as RawCatalogItem[];
  if (!Array.isArray(raw) || raw.length === 0) return d;

  if (!isFlatCatalog(raw)) {
    // Already hierarchical — ensure order/children exist
    const ensure = (item: RawCatalogItem, idx: number): CatalogItem => ({
      id: item.id,
      title: item.title,
      path: item.path,
      order: typeof item.order === "number" ? item.order : idx,
      file: item.file,
      children: Array.isArray(item.children)
        ? item.children.map((c, i) => ensure(c, i))
        : [],
      section: item.section as CatalogItem["section"],
      level: item.level as CatalogItem["level"],
      reading_time: item.reading_time,
    });
    return {
      ...d,
      catalog: raw.map((item, i) => ensure(item, i)),
    };
  }

  // Flat → build tree by section
  const bySection = new Map<string, RawCatalogItem[]>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const sec = item.section ?? "getting-started";
    if (!bySection.has(sec)) bySection.set(sec, []);
    bySection.get(sec)!.push({ ...item, order: typeof item.order === "number" ? item.order : i });
  }

  const sectionOrder = ["getting-started", "deep-dive", "specify-wiki"];
  const catalog: CatalogItem[] = [];
  for (let si = 0; si < sectionOrder.length; si++) {
    const sec = sectionOrder[si];
    const items = bySection.get(sec);
    if (!items || items.length === 0) continue;

    const sectionTitle =
      sec === "getting-started"
        ? "Getting Started"
        : sec === "deep-dive"
          ? "Deep Dive"
          : "Specify Wiki";
    const sectionPath = sec === "getting-started" ? "getting-started" : sec;
    const indexFile = `${sectionPath}/index.md`;
    const hasIndex = items.some((i) => i.file === indexFile || i.path === sectionPath);

    const children: CatalogItem[] = items
      .filter((i) => i.file !== indexFile && i.path !== sectionPath)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item, idx) => ({
        id: item.id,
        title: item.title,
        path: item.path,
        order: idx,
        file: item.file,
        children: [] as CatalogItem[],
        section: item.section as CatalogItem["section"],
        level: item.level as CatalogItem["level"],
        reading_time: item.reading_time,
      }));

    catalog.push({
      id: sec,
      title: sectionTitle,
      path: sectionPath,
      order: si,
      file: hasIndex ? indexFile : children[0]?.file ?? indexFile,
      children,
      section: sec as CatalogItem["section"],
      level: "beginner",
      reading_time: 5,
    });
  }

  return { ...d, catalog };
}

/** Flatten catalog into a list of leaf items (pages) with file paths, sorted by order */
export function flattenCatalog(catalog: CatalogItem[]): { id: string; title: string; file: string }[] {
  const result: { id: string; title: string; file: string }[] = [];

  function visit(items: CatalogItem[]) {
    const sorted = [...items].sort((a, b) => a.order - b.order);
    for (const item of sorted) {
      const kids = item.children ?? [];
      if (kids.length === 0) {
        result.push({ id: item.id, title: item.title, file: item.file });
      } else {
        visit(kids);
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

export interface ResolvedWikiLink {
  slug: string;
  hash?: string;
}

/**
 * Resolve a relative markdown link (e.g. ./quick-start.md, ../deep-dive/core-engine/fs-git.md)
 * against the current wiki page. Returns { slug, hash? } or null if not a wiki-internal .md link.
 */
export function resolveWikiPath(currentPage: string, href: string): ResolvedWikiLink | null {
  const [pathPart, hashPart] = href.split("#");
  const trimmed = pathPart.trim();
  if (!trimmed.endsWith(".md")) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("//")) {
    return null;
  }
  const currentDir = currentPage.includes("/") ? currentPage.replace(/\/[^/]*$/, "") + "/" : "";
  const combined = currentDir + trimmed;
  const segments = combined.split("/").filter(Boolean);
  const result: string[] = [];
  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      result.pop();
      continue;
    }
    result.push(seg);
  }
  const slug = result.join("/").replace(/\.md$/, "");
  return slug ? { slug, hash: hashPart || undefined } : null;
}

/** Parse frontmatter from markdown content */
export interface ParsedFrontmatter {
  title?: string;
  path?: string;
  sources?: string[];
  updated_at?: string;
  section?: WikiSection;
  level?: WikiLevel;
  reading_time?: number;
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
        const val = keyMatch[2].trim();
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

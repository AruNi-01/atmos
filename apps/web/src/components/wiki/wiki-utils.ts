/**
 * Utilities for Project Wiki: page registry parsing, legacy catalog normalization,
 * heading extraction, slug generation.
 */
import BananaSlug, { slug } from "github-slugger";

export type WikiSection = "getting-started" | "deep-dive" | "specify-wiki";
export type WikiLevel = "beginner" | "intermediate" | "advanced";
export type WikiPageKind =
  | "overview"
  | "architecture"
  | "module"
  | "workflow"
  | "decision"
  | "integration"
  | "topic"
  | (string & {});
export type WikiAudience =
  | "newcomer"
  | "contributor"
  | "maintainer"
  | "operator"
  | "mixed"
  | (string & {});

export interface CatalogItem {
  id: string;
  title: string;
  path: string;
  order: number;
  file: string;
  children: CatalogItem[];
  page_id?: string;
  kind?: WikiPageKind;
  audience?: WikiAudience;
  section?: WikiSection;
  level?: WikiLevel;
  reading_time?: number;
  summary?: string;
}

export interface WikiPageRecord {
  id: string;
  title: string;
  slug?: string;
  file: string;
  kind: WikiPageKind;
  audience: WikiAudience;
  summary?: string;
  sources: string[];
  evidence_refs: string[];
  updated_at?: string;
  level?: WikiLevel;
  reading_time?: number;
}

export interface CatalogData {
  version: string;
  generated_at: string;
  commit_hash?: string;
  project: {
    name: string;
    description: string;
    repository?: string;
  };
  navigation: CatalogItem[];
  pages: WikiPageRecord[];
  /**
   * Legacy compatibility: callers still expect `catalog`.
   * Keep it as an alias of `navigation`.
   */
  catalog: CatalogItem[];
  format?: "page-registry" | "legacy-catalog";
}

export interface Heading {
  level: 2 | 3 | 4;
  text: string;
  id: string;
}

type RawCatalogItem = Omit<
  Partial<CatalogItem>,
  "children" | "kind" | "audience" | "section"
> & {
  id: string;
  title: string;
  path?: string;
  file?: string;
  section?: string;
  page_id?: string;
  kind?: string;
  audience?: string;
  children?: RawCatalogItem[];
};

type RawPageRecord = Partial<WikiPageRecord> & {
  id: string;
  title: string;
  file: string;
  kind?: string;
  audience?: string;
  sources?: string[];
  evidence_refs?: string[];
};

type RawCatalogData = Partial<CatalogData> & {
  project?: string | CatalogData["project"];
  catalog?: RawCatalogItem[];
  navigation?: RawCatalogItem[];
  pages?: RawPageRecord[];
};

const TOP_LEVEL_SECTION_IDS = new Set(["getting-started", "deep-dive", "specify-wiki"]);

export function isTopLevelSection(item: CatalogItem): boolean {
  return (
    item.children.length > 0 &&
    (!item.page_id || TOP_LEVEL_SECTION_IDS.has(item.id) || item.section === item.id)
  );
}

function normalizeProject(project: RawCatalogData["project"]): CatalogData["project"] {
  if (typeof project === "string") {
    return { name: project, description: project };
  }

  return {
    name: project?.name ?? "Project",
    description: project?.description ?? "Project documentation",
    repository: project?.repository,
  };
}

function pageSlugFromFile(file: string, fallback: string): string {
  return (file || fallback).replace(/\.md$/, "");
}

function normalizePageRecord(page: RawPageRecord, index: number): WikiPageRecord {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug ?? pageSlugFromFile(page.file, page.id),
    file: page.file,
    kind: (page.kind ?? "topic") as WikiPageKind,
    audience: (page.audience ?? "mixed") as WikiAudience,
    summary: page.summary,
    sources: Array.isArray(page.sources) ? page.sources : [],
    evidence_refs: Array.isArray(page.evidence_refs) ? page.evidence_refs : [],
    updated_at: page.updated_at,
    level: page.level as WikiLevel | undefined,
    reading_time:
      typeof page.reading_time === "number" ? page.reading_time : undefined,
  };
}

function normalizeNavigationItem(
  item: RawCatalogItem,
  pagesById: Map<string, WikiPageRecord>,
  index: number
): CatalogItem {
  const page = item.page_id ? pagesById.get(item.page_id) : undefined;
  const file = item.file ?? page?.file ?? "";
  return {
    id: item.id,
    title: item.title,
    path: item.path ?? page?.slug ?? pageSlugFromFile(file, item.id),
    order: typeof item.order === "number" ? item.order : index,
    file,
    page_id: item.page_id ?? page?.id,
    kind: ((item.kind as WikiPageKind | undefined) ?? page?.kind) as WikiPageKind | undefined,
    audience:
      ((item.audience as WikiAudience | undefined) ?? page?.audience) as
        | WikiAudience
        | undefined,
    section: item.section as WikiSection | undefined,
    level: item.level as WikiLevel | undefined,
    reading_time:
      typeof item.reading_time === "number"
        ? item.reading_time
        : page?.reading_time,
    summary: item.summary ?? page?.summary,
    children: Array.isArray(item.children)
      ? item.children.map((child, childIndex) =>
          normalizeNavigationItem(child, pagesById, childIndex)
        )
      : [],
  };
}

function normalizePageRegistry(data: RawCatalogData): CatalogData {
  const pages = Array.isArray(data.pages)
    ? data.pages.map(normalizePageRecord)
    : [];
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const navigation = Array.isArray(data.navigation)
    ? data.navigation.map((item, index) =>
        normalizeNavigationItem(item, pagesById, index)
      )
    : [];

  return {
    version: data.version ?? "3.0",
    generated_at: data.generated_at ?? new Date(0).toISOString(),
    commit_hash: data.commit_hash,
    project: normalizeProject(data.project),
    navigation,
    pages,
    catalog: navigation,
    format: "page-registry",
  };
}

function isFlatLegacyCatalog(items: RawCatalogItem[]): boolean {
  if (items.length === 0) return false;
  return !items[0].children && !!items[0].section;
}

function ensureLegacyCatalogItem(item: RawCatalogItem, index: number): CatalogItem {
  const file = item.file ?? `${item.path ?? item.id}.md`;
  return {
    id: item.id,
    title: item.title,
    path: item.path ?? pageSlugFromFile(file, item.id),
    order: typeof item.order === "number" ? item.order : index,
    file,
    children: Array.isArray(item.children)
      ? item.children.map((child, childIndex) =>
          ensureLegacyCatalogItem(child, childIndex)
        )
      : [],
    section: item.section as WikiSection | undefined,
    level: item.level as WikiLevel | undefined,
    reading_time:
      typeof item.reading_time === "number" ? item.reading_time : undefined,
  };
}

function buildLegacyPageRecords(navigation: CatalogItem[]): WikiPageRecord[] {
  const pages: WikiPageRecord[] = [];
  const visit = (items: CatalogItem[]) => {
    for (const item of items) {
      if (item.file) {
        pages.push({
          id: item.id,
          title: item.title,
          slug: item.path,
          file: item.file,
          kind:
            item.section === "getting-started"
              ? "overview"
              : item.section === "deep-dive"
                ? "module"
                : "topic",
          audience:
            item.level === "beginner"
              ? "newcomer"
              : item.level === "advanced"
                ? "maintainer"
                : "mixed",
          summary: item.summary,
          sources: [],
          evidence_refs: [],
          level: item.level,
          reading_time: item.reading_time,
        });
      }
      if (item.children.length > 0) {
        visit(item.children);
      }
    }
  };
  visit(navigation);
  return pages;
}

function normalizeLegacyCatalog(data: RawCatalogData): CatalogData {
  const raw = Array.isArray(data.catalog) ? data.catalog : [];
  let navigation: CatalogItem[];

  if (isFlatLegacyCatalog(raw)) {
    const bySection = new Map<string, RawCatalogItem[]>();
    for (const item of raw) {
      const section = item.section ?? "getting-started";
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section)!.push(item);
    }

    const sectionOrder = ["getting-started", "deep-dive", "specify-wiki"];
    navigation = sectionOrder
      .filter((section) => bySection.has(section))
      .map((section, index) => {
        const children = bySection
          .get(section)!
          .map((item, childIndex) => ensureLegacyCatalogItem(item, childIndex))
          .sort((a, b) => a.order - b.order);
        return {
          id: section,
          title:
            section === "getting-started"
              ? "Getting Started"
              : section === "deep-dive"
                ? "Deep Dive"
                : "Specify Wiki",
          path: section,
          order: index,
          file: "",
          section: section as WikiSection,
          level: "beginner",
          children,
        };
      });
  } else {
    navigation = raw.map((item, index) => ensureLegacyCatalogItem(item, index));
  }

  const pages = buildLegacyPageRecords(navigation);
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const normalizedNavigation = navigation.map((item, index) =>
    normalizeNavigationItem(
      {
        id: item.id,
        title: item.title,
        path: item.path,
        file: item.file,
        order: item.order,
        page_id: pagesById.has(item.id) ? item.id : undefined,
        kind: item.kind,
        audience: item.audience,
        section: item.section,
        level: item.level,
        reading_time: item.reading_time,
        summary: item.summary,
        children: item.children as unknown as RawCatalogItem[],
      },
      pagesById,
      index
    )
  );

  return {
    version: data.version ?? "2.0",
    generated_at: data.generated_at ?? new Date(0).toISOString(),
    commit_hash: data.commit_hash,
    project: normalizeProject(data.project),
    navigation: normalizedNavigation,
    pages,
    catalog: normalizedNavigation,
    format: "legacy-catalog",
  };
}

export function normalizeCatalog(data: RawCatalogData): CatalogData {
  if (Array.isArray(data.navigation) || Array.isArray(data.pages)) {
    return normalizePageRegistry(data);
  }
  return normalizeLegacyCatalog(data);
}

export function flattenCatalog(
  catalog: CatalogItem[]
): { id: string; title: string; file: string }[] {
  const result: { id: string; title: string; file: string }[] = [];

  function visit(items: CatalogItem[]) {
    const sorted = [...items].sort((a, b) => a.order - b.order);
    for (const item of sorted) {
      if (item.file) {
        result.push({ id: item.id, title: item.title, file: item.file });
      }
      if (item.children.length > 0) {
        visit(item.children);
      }
    }
  }

  visit(catalog);
  return result;
}

export function buildCatalogTree(catalog: CatalogItem[]): CatalogItem[] {
  return [...catalog].sort((a, b) => a.order - b.order);
}

export function slugifyHeading(text: string): string {
  return slug(text);
}

export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const slugger = new BananaSlug();
  const regex = /^(#{2,4})\s+(.+)$/gm;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const level = match[1].length as 2 | 3 | 4;
    const text = match[2].trim();
    headings.push({ level, text, id: slugger.slug(text) });
  }

  return headings;
}

export interface ResolvedWikiLink {
  slug: string;
  hash?: string;
}

export function resolveWikiPath(
  currentPage: string,
  href: string
): ResolvedWikiLink | null {
  const [pathPart, hashPart] = href.split("#");
  const trimmed = pathPart.trim();
  if (!trimmed.endsWith(".md")) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("//")) {
    return null;
  }

  const currentDir = currentPage.includes("/")
    ? `${currentPage.replace(/\/[^/]*$/, "")}/`
    : "";
  const combined = `${currentDir}${trimmed}`;
  const segments = combined.split("/").filter(Boolean);
  const result: string[] = [];

  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      result.pop();
      continue;
    }
    result.push(segment);
  }

  const slugValue = result.join("/").replace(/\.md$/, "");
  return slugValue ? { slug: slugValue, hash: hashPart || undefined } : null;
}

export interface ParsedFrontmatter {
  page_id?: string;
  title?: string;
  path?: string;
  kind?: WikiPageKind;
  audience?: WikiAudience;
  sources?: string[];
  evidence_refs?: string[];
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
  let currentArrayKey: "sources" | "evidence_refs" | null = null;

  for (const line of raw.split(/\r?\n/)) {
    if (currentArrayKey && /^\s+-\s+/.test(line)) {
      const value = line.replace(/^\s+-\s+/, "").trim();
      frontmatter[currentArrayKey] = [
        ...(frontmatter[currentArrayKey] ?? []),
        value,
      ];
      continue;
    }

    currentArrayKey = null;
    const keyMatch = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const key = keyMatch[1];
    const value = keyMatch[2].trim();
    if ((key === "sources" || key === "evidence_refs") && value === "") {
      frontmatter[key] = [];
      currentArrayKey = key;
      continue;
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      try {
        (frontmatter as Record<string, unknown>)[key] = JSON.parse(value);
      } catch {
        (frontmatter as Record<string, unknown>)[key] = value;
      }
    } else if (value) {
      (frontmatter as Record<string, unknown>)[key] = value;
    }
  }

  return { frontmatter, body };
}

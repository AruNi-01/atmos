export interface ResolvedMarkdownLink {
  slug: string;
  hash?: string;
}

/**
 * Resolve a relative markdown link against the current markdown page.
 * Returns null for external links and non-markdown links.
 */
export function resolveRelativeMarkdownPath(
  currentPage: string,
  href: string,
): ResolvedMarkdownLink | null {
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

export const MD_LIVE_UNTITLED_PREFIX = "untitled:";

export function isUntitledMarkdownPath(path: string): boolean {
  return path.startsWith(MD_LIVE_UNTITLED_PREFIX) && path.toLowerCase().endsWith(".md");
}

export function isReviewMarkdownPath(path: string): boolean {
  return path.includes("/.atmos/reviews/");
}

export function isMdxPath(path: string, fileName?: string): boolean {
  const name = (fileName ?? path.split("/").pop() ?? "").toLowerCase();
  return name.endsWith(".mdx");
}

/** Live-eligible: untitled notes or authoring `.md`, excluding reviews and `.mdx`. */
export function isLiveEligibleMarkdownPath(
  path: string,
  options?: { fileName?: string; language?: string },
): boolean {
  if (isUntitledMarkdownPath(path)) return true;
  if (isReviewMarkdownPath(path)) return false;
  if (isMdxPath(path, options?.fileName)) return false;
  const name = (options?.fileName ?? path.split("/").pop() ?? "").toLowerCase();
  const language = options?.language?.toLowerCase();
  return language === "markdown" || name.endsWith(".md");
}

export function createUntitledMarkdownPath(fileName: string): string {
  return `${MD_LIVE_UNTITLED_PREFIX}${fileName}`;
}

export function untitledMarkdownFileName(path: string): string {
  if (!isUntitledMarkdownPath(path)) return "";
  return path.slice(MD_LIVE_UNTITLED_PREFIX.length);
}

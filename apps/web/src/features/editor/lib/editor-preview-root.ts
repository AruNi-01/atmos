/** Unique per open file so keep-alive editors do not share one TOC scroller. */
export function editorPreviewRootDomId(filePath: string): string {
  const slug = filePath.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `editor-preview-root-${slug}` : "editor-preview-root";
}

/** Outline / find / Live placeholder bind only to the focused file tab. */
export function markdownTocShouldMountForFile(
  activePath: string | null | undefined,
  filePath: string,
): boolean {
  return Boolean(activePath) && activePath === filePath;
}

export function joinWorktreePath(directory: string, fileName: string): string {
  const dir = directory.replace(/\/+$/, "") || "/";
  const name = fileName.trim();
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

export function ensureMarkdownExtension(fileName: string): string {
  const trimmed = fileName.trim();
  if (trimmed.toLowerCase().endsWith(".md")) return trimmed;
  return `${trimmed}.md`;
}

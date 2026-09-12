import { createUntitledMarkdownPath } from "@/features/md-live/lib/md-live-paths";

export function automationMdLivePath(
  kind: "instructions" | "memory",
  options?: { guid?: string | null; diskPath?: string | null },
): string {
  if (kind === "memory" && options?.diskPath) return options.diskPath;
  const name = options?.guid
    ? `automation-${options.guid}-${kind}.md`
    : `automation-${kind}.md`;
  return createUntitledMarkdownPath(name);
}

/**
 * Shared AppShot / Desktop Use context.md builders (no OS side effects).
 */

export type DesktopUseFrontmost = {
  appName: string;
  windowTitle: string | null;
  bundleId: string | null;
  processId: number | null;
  windowId: string | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
};

export function buildAppshotContextMarkdownFromParts(input: {
  frontmost: DesktopUseFrontmost;
  treeMarkdown: string;
  quality: string;
  warnings: string[];
}): string {
  const { frontmost, treeMarkdown, quality, warnings } = input;
  const lines = [
    "# Appshot Context",
    "",
    `- App: ${frontmost.appName}`,
  ];
  if (frontmost.windowTitle) {
    lines.push(`- Window: ${frontmost.windowTitle}`);
  }
  if (frontmost.bundleId) {
    lines.push(`- Bundle ID: ${frontmost.bundleId}`);
  }
  if (frontmost.processId != null) {
    lines.push(`- Process ID: ${frontmost.processId}`);
  }
  if (
    frontmost.x != null &&
    frontmost.y != null &&
    frontmost.width != null &&
    frontmost.height != null
  ) {
    lines.push(
      `- Bounds: ${frontmost.x},${frontmost.y} ${frontmost.width}×${frontmost.height}`,
    );
  }
  lines.push(`- Quality: ${quality}`);
  lines.push(`- Source: Desktop Use inspect`);
  lines.push("", "## UI structure", "");
  lines.push(treeMarkdown.trim() || "Accessibility tree unavailable.");
  if (warnings.length) {
    lines.push("", "## Warnings");
    for (const w of warnings) lines.push(`- ${w}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Legacy thin context (meta only) — kept for tests / fallback. */
export function buildAppshotContextMarkdown(
  frontmost: DesktopUseFrontmost,
  warnings: string[],
): string {
  return buildAppshotContextMarkdownFromParts({
    frontmost,
    treeMarkdown: "Accessibility tree unavailable.",
    quality: "metadata_only",
    warnings,
  });
}

export const MERMAID_VIEW_MODES = ["ascii", "source", "preview"] as const;

export type MermaidViewMode = (typeof MERMAID_VIEW_MODES)[number];

export function isMermaidFenceLanguage(language: string | null | undefined): boolean {
  return language?.trim().toLowerCase() === "mermaid";
}

export function mermaidCopyContent(
  mode: MermaidViewMode,
  code: string,
  asciiText: string | null,
): string {
  if (mode === "ascii" && asciiText) return asciiText;
  return code;
}

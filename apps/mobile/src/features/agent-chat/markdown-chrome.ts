/**
 * Streamdown heading scale (`text-3xl` … `text-sm`, `font-semibold`).
 * Answer text is `text-sm` (14/20). Headings keep their own line box.
 * A body line height of 20 clips the 30px h1.
 */
export const agentChatHeadingScale = {
  h1: { fontSize: 30, lineHeight: 36 },
  h2: { fontSize: 24, lineHeight: 32 },
  h3: { fontSize: 20, lineHeight: 28 },
  h4: { fontSize: 18, lineHeight: 28 },
  h5: { fontSize: 16, lineHeight: 24 },
  h6: { fontSize: 14, lineHeight: 20 },
} as const;

export function agentChatHeadingStyle(color: string) {
  const shared = { color, fontWeight: "600", marginBottom: 8, marginTop: 0 };
  return {
    h1: { ...shared, ...agentChatHeadingScale.h1 },
    h2: { ...shared, ...agentChatHeadingScale.h2 },
    h3: { ...shared, ...agentChatHeadingScale.h3 },
    h4: { ...shared, ...agentChatHeadingScale.h4 },
    h5: { ...shared, ...agentChatHeadingScale.h5 },
    h6: { ...shared, ...agentChatHeadingScale.h6 },
  };
}

/** Zinc chrome from web `markdown-table.ts` and inline `MarkdownCodeBlock`. */
export function agentChatMarkdownChrome(isDark: boolean) {
  if (isDark) {
    return {
      headerBackground: "#27272a",
      headerText: "#d4d4d8",
      bodyText: "#a1a1aa",
      border: "#3f3f46",
      row: "#000000",
      codeBackground: "#27272a",
      codeText: "#e4e4e7",
    };
  }
  return {
    headerBackground: "#f4f4f5",
    headerText: "#3f3f46",
    bodyText: "#52525b",
    border: "#e4e4e7",
    row: "#f4f4f6",
    codeBackground: "#f4f4f5",
    codeText: "#27272a",
  };
}

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

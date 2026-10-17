import { chatMutedForeground } from "./chat-ink";

/**
 * Streamdown heading scale (`text-3xl` … `text-sm`, `font-semibold`).
 * Every level is `mt-6 mb-2`. Answer text is `text-sm` (14/20).
 * Headings keep their own line box. A body line height of 20 clips the 30px h1.
 * A message that opens on a heading still gets this top spacer. Web clears it
 * with `[&>*:first-child]:mt-0`, and the native renderer has no first-child flag.
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
  const shared = { color, fontWeight: "600", marginBottom: 8, marginTop: 24 };
  return {
    h1: { ...shared, ...agentChatHeadingScale.h1 },
    h2: { ...shared, ...agentChatHeadingScale.h2 },
    h3: { ...shared, ...agentChatHeadingScale.h3 },
    h4: { ...shared, ...agentChatHeadingScale.h4 },
    h5: { ...shared, ...agentChatHeadingScale.h5 },
    h6: { ...shared, ...agentChatHeadingScale.h6 },
  };
}

/**
 * `MarkdownRenderer` heading classes: `text-2xl` through `text-base`,
 * `font-semibold`. h5 and h6 keep the body size and `prose-headings:my-2`.
 * A leading heading still keeps its top margin.
 */
export function agentChatRendererHeadingStyle(
  color: string,
  bodyFontSize: number,
  bodyLineHeight: number,
) {
  const shared = { color, fontWeight: "600" };
  return {
    h1: { ...shared, fontSize: 24, lineHeight: 32, marginBottom: 12, marginTop: 24 },
    h2: { ...shared, fontSize: 20, lineHeight: 28, marginBottom: 10, marginTop: 20 },
    h3: { ...shared, fontSize: 18, lineHeight: 28, marginBottom: 8, marginTop: 16 },
    h4: { ...shared, fontSize: 16, lineHeight: 24, marginBottom: 6, marginTop: 12 },
    h5: {
      ...shared,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      marginBottom: 8,
      marginTop: 8,
    },
    h6: {
      ...shared,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
      marginBottom: 8,
      marginTop: 8,
    },
  };
}

export type AgentChatProseKind = "tool" | "plan" | "approval";

/**
 * Tool markdown is `prose-p:my-1`, `prose-ul:my-1`, and `prose-li:my-0`, with
 * fences pulled in to `my-2`. A plan document uses `my-1.5` and
 * `prose-li:my-0.5`, and keeps the fence `my-4`. The approval plan matches
 * that type and uses the permission card's fence `my-2`.
 */
export function agentChatProseMetrics(kind: AgentChatProseKind): {
  codeBlockMargin: number;
  itemSpacing: number;
  listMargin: number;
  paragraphMargin: number;
} {
  if (kind === "tool") {
    return { codeBlockMargin: 8, itemSpacing: 0, listMargin: 4, paragraphMargin: 4 };
  }
  if (kind === "approval") {
    return { codeBlockMargin: 8, itemSpacing: 2, listMargin: 6, paragraphMargin: 6 };
  }
  return { codeBlockMargin: 16, itemSpacing: 2, listMargin: 6, paragraphMargin: 6 };
}

/**
 * Tailwind preflight zeros `p` and `ul` margins. Streamdown list items are
 * `py-1`. Agent fences and tables use `my-4`, and fence text is `text-sm leading-5`.
 * Fence and table frames use web `rounded-lg` (`--radius`, 10px).
 */
/**
 * Web reasoning `[&_p]:my-1`, then `mt-0` on the first paragraph and `mb-0` on
 * the last. A block that opens the document still receives its top margin, so
 * thinking paragraphs keep this gap on the bottom only. The body's 4px pad is
 * the first line's offset, later paragraphs keep a 4px gap, and the native
 * view still drops the last block's bottom margin.
 */
export const THINKING_PARAGRAPH_MARGIN = 4;

/**
 * Streamdown blockquote: `my-4 border-l-4 border-muted-foreground/30 pl-4 text-muted-foreground`.
 * The native indent is the border plus `gapWidth`, so `pl-4` is the gap.
 * Italic stays off: the quote style has no italic flag.
 */
export const BLOCKQUOTE_MARGIN = 16;
export const BLOCKQUOTE_BORDER = 4;
export const BLOCKQUOTE_GAP = 16;

export function agentChatBlockquote(isDark: boolean): {
  backgroundColor: string;
  borderColor: string;
  borderRadius: number;
  borderWidth: number;
  color: string;
  gapWidth: number;
  marginBottom: number;
  marginTop: number;
} {
  return {
    backgroundColor: "transparent",
    borderColor: isDark ? "rgba(159, 159, 169, 0.3)" : "rgba(113, 113, 123, 0.3)",
    borderRadius: 0,
    borderWidth: BLOCKQUOTE_BORDER,
    color: chatMutedForeground(isDark),
    gapWidth: BLOCKQUOTE_GAP,
    marginBottom: BLOCKQUOTE_MARGIN,
    marginTop: BLOCKQUOTE_MARGIN,
  };
}

/**
 * Streamdown rule: `my-6 border-border`. `--border` is black or white at 10%.
 * A leading rule still keeps the top margin. Web clears the first block.
 */
export const THEMATIC_BREAK_MARGIN = 24;

export function agentChatThematicBreak(isDark: boolean): {
  color: string;
  height: number;
  marginBottom: number;
  marginTop: number;
} {
  return {
    color: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
    height: 1,
    marginBottom: THEMATIC_BREAK_MARGIN,
    marginTop: THEMATIC_BREAK_MARGIN,
  };
}

/**
 * Streamdown link: `font-medium text-primary underline`.
 * `--primary` is `oklch(0.21 0.006 285.885)` / `oklch(0.92 0.004 286.32)`.
 * The native link style has no weight, so medium stays off.
 */
export function agentChatLinkColor(isDark: boolean): string {
  return isDark ? "#e4e4e7" : "#18181b";
}

export const agentChatBlockMetrics = {
  paragraph: { marginTop: 0, marginBottom: 0 },
  list: { marginTop: 0, marginBottom: 0, itemSpacing: 8 },
  codeBlock: { marginTop: 16, marginBottom: 16, fontSize: 14, lineHeight: 20, borderRadius: 10 },
  table: { marginTop: 16, marginBottom: 16, borderRadius: 10 },
} as const;

/**
 * Zinc table chrome from `markdown-table.ts`, inline code from `MarkdownCodeBlock`,
 * and the fenced frame from `CodeBlock` (`bg-neutral-200/40` / `dark:bg-neutral-800/70`).
 * Dark header and border are those alphas composited on black. Inline code has no border.
 * Fence syntax colors follow web Shiki `github-light` / `github-dark`.
 * The native fence paints this frame, then a page-colored code pane (`h-9` header,
 * 12px code padding) in the enriched-markdown patch.
 */
export function agentChatMarkdownChrome(isDark: boolean) {
  if (isDark) {
    return {
      headerBackground: "#1f1f22",
      headerText: "#d4d4d8",
      bodyText: "#a1a1aa",
      border: "#202023",
      row: "#000000",
      codeBackground: "#27272a",
      codeText: "#e4e4e7",
      codeBorder: "rgba(0,0,0,0)",
      fenceBackground: "#1b1b1b",
      fenceBorder: "#262626",
      fenceText: "#e6edf3",
      syntax: {
        keyword: "#ff7b72",
        string: "#a5d6ff",
        number: "#79c0ff",
        constant: "#79c0ff",
        comment: "#8b949e",
        function: "#d2a8ff",
        type: "#ffa657",
        property: "#79c0ff",
        tag: "#7ee787",
        attribute: "#79c0ff",
      },
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
    codeBorder: "rgba(0,0,0,0)",
    fenceBackground: "#eeeeef",
    fenceBorder: "#e5e5e5",
    fenceText: "#1f2328",
    syntax: {
      keyword: "#cf222e",
      string: "#0a3069",
      number: "#0550ae",
      constant: "#0550ae",
      comment: "#6e7781",
      function: "#8250df",
      type: "#953800",
      property: "#0550ae",
      tag: "#116329",
      attribute: "#0550ae",
    },
  };
}

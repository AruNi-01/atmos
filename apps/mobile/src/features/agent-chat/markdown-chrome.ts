import { chatMutedForeground } from "./chat-ink";

/**
 * Streamdown heading scale (`text-3xl` … `text-sm`, `font-semibold`).
 * Every level is `mt-6 mb-2`. Tailwind 4 `space-y-4` is `:where()`, so it
 * does not override either side. A heading after a fence keeps a 24px gap.
 * The bottom is 8px. A paragraph under it stays 8px. A fence, quote, or rule
 * collapses its own top with that 8px. Answer text is `text-sm` (14/20).
 * Headings keep their own line box. A body line height of 20 clips the 30px
 * h1. A heading that opens the message drops that top spacer. Web clears it
 * with `first:mt-0` and `[&>*:first-child]:mt-0`. Later headings keep the 24px.
 */
export const agentChatHeadingScale = {
  h1: { fontSize: 30, lineHeight: 36 },
  h2: { fontSize: 24, lineHeight: 32 },
  h3: { fontSize: 20, lineHeight: 28 },
  h4: { fontSize: 18, lineHeight: 28 },
  h5: { fontSize: 16, lineHeight: 24 },
  h6: { fontSize: 14, lineHeight: 20 },
} as const;

export function agentChatHeadingStyle(color: string, marginBottom = 8) {
  const shared = { color, fontWeight: "600", marginBottom, marginTop: 24 };
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
 * The native renderer drops the opening spacer. Later headings keep marginTop.
 * Tool h1 and h2 are `tracking-tight` on web. This style has no letter-spacing
 * field, so that tracking stays on web.
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
  tableMargin: number;
} {
  if (kind === "tool") {
    // `[&_.not-prose]:my-2` pulls fences and tables in to 8px.
    return {
      codeBlockMargin: 8,
      itemSpacing: 0,
      listMargin: 4,
      paragraphMargin: 4,
      tableMargin: 8,
    };
  }
  if (kind === "approval") {
    return {
      codeBlockMargin: 8,
      itemSpacing: 2,
      listMargin: 6,
      paragraphMargin: 6,
      tableMargin: 8,
    };
  }
  return {
    codeBlockMargin: 16,
    itemSpacing: 2,
    listMargin: 6,
    paragraphMargin: 6,
    tableMargin: 16,
  };
}

/**
 * Streamdown's root is `space-y-4` (16px between blocks). Paragraphs have no
 * margin of their own. A leading paragraph still receives `marginTop` through
 * `applyBlockSpacingBefore`, so this gap sits on the bottom only. A fence or
 * table is `my-4`. The first one clears its top. A later one keeps only the
 * part of that 16px that exceeds the previous block. A list's first item pad
 * stays 4px and still stacks; the bottom also carries the 16px because the
 * following paragraph has no top margin. A list that ends the message still
 * drops that bottom margin. Fence text is `text-sm leading-5`. Fence and
 * table frames use web `rounded-lg` (`--radius`, 10px). Table cells keep
 * horizontal rules only; the last row has none, and the frame is the edge.
 */
export const STREAMDOWN_BLOCK_GAP = 16;
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
 * Both sides are 16px. The top collapses with the previous block, and a quote
 * that opens the message clears it. The quote font is italic. The style object
 * has no fontStyle field, so the native font builder sets it.
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
 * Tool, plan, and approval quotes are Tailwind typography on `prose-sm`.
 * The rail stays 4px. Ink is `--tw-prose-quotes` (gray-900 / gray-100) and the
 * border is `--tw-prose-quote-borders` (gray-200 / gray-700). Those oklch
 * stops are `#101828` / `#f3f4f6` and `#e5e7eb` / `#364153`. Weight is 500.
 * `padding-inline-start` is `em(20, 18)` of the quote face. Answer quotes stay
 * on the Streamdown rail above. The curly quotation marks are `::before` and
 * `::after`, so they stay on web.
 */
export const PROSE_QUOTE_LIGHT = "#101828";
export const PROSE_QUOTE_DARK = "#f3f4f6";
export const PROSE_QUOTE_BORDER_LIGHT = "#e5e7eb";
export const PROSE_QUOTE_BORDER_DARK = "#364153";

export function agentChatProseBlockquote(
  isDark: boolean,
  fontSize: number,
): {
  borderColor: string;
  color: string;
  fontWeight: string;
  gapWidth: number;
  marginBottom: number;
  marginTop: number;
} {
  // `prose-sm` quote margin is `em(24, 18)` of the quote face.
  const margin = (24 / 18) * fontSize;
  return {
    borderColor: isDark ? PROSE_QUOTE_BORDER_DARK : PROSE_QUOTE_BORDER_LIGHT,
    color: isDark ? PROSE_QUOTE_DARK : PROSE_QUOTE_LIGHT,
    fontWeight: "500",
    gapWidth: (20 / 18) * fontSize,
    marginBottom: margin,
    marginTop: margin,
  };
}

/**
 * Tailwind typography body ink on tool, plan, and approval markdown.
 * Headings stay `--foreground` because `MarkdownRenderer` sets `text-foreground`
 * on those tags. Body is gray-700 / gray-300, strong and links are gray-900 /
 * white, discs are gray-300 / gray-600, and numbers are gray-500 / gray-400.
 */
export const PROSE_BODY_LIGHT = "#364153";
export const PROSE_BODY_DARK = "#d1d5dc";
export const PROSE_BOLD_LIGHT = "#101828";
export const PROSE_BOLD_DARK = "#ffffff";
export const PROSE_BULLET_LIGHT = "#d1d5dc";
export const PROSE_BULLET_DARK = "#4a5565";
export const PROSE_COUNTER_LIGHT = "#6a7282";
export const PROSE_COUNTER_DARK = "#99a1af";

/**
 * Typography `prose-sm` lists keep the marker outside the text. The list pad is
 * `em(22, 14)` and each item adds `em(6, 14)`. A nested list repeats that pair.
 * The disc is centered on the list pad, so it sits half its width into the item
 * pad. Answer lists stay `list-inside` and do not use this column. Task rows
 * ignore it: web sets `pl-0` and `gap-2` after the checkbox.
 */
export function agentChatProseListLayout(fontSize: number): {
  gapWidth: number;
  marginLeft: number;
  markerMinWidth: number;
} {
  const listPad = (22 / 14) * fontSize;
  const itemPad = (6 / 14) * fontSize;
  return {
    gapWidth: itemPad,
    marginLeft: listPad + itemPad,
    markerMinWidth: listPad,
  };
}

export function agentChatProseInk(isDark: boolean): {
  body: string;
  bold: string;
  bullet: string;
  counter: string;
  link: string;
} {
  if (isDark) {
    return {
      body: PROSE_BODY_DARK,
      bold: PROSE_BOLD_DARK,
      bullet: PROSE_BULLET_DARK,
      counter: PROSE_COUNTER_DARK,
      link: PROSE_BOLD_DARK,
    };
  }
  return {
    body: PROSE_BODY_LIGHT,
    bold: PROSE_BOLD_LIGHT,
    bullet: PROSE_BULLET_LIGHT,
    counter: PROSE_COUNTER_LIGHT,
    link: PROSE_BOLD_LIGHT,
  };
}

/**
 * Streamdown rule: `my-6 border-border`. `--border` is black or white at 10%.
 * The rule attachment adds its top margin on top of the previous block. The
 * configured top is 8px, so a paragraph's 16px makes 24. After a heading the
 * renderer raises that top until the gap is 24. A list's 20px plus this 8px
 * stays 28. The native renderer clears a leading rule's top margin and a
 * trailing rule's bottom margin when the top is the smaller side, matching
 * `[&>*:first-child]:mt-0` and `[&>*:last-child]:mb-0`. Tool prose sets both
 * sides to 24px, and those stay.
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
    marginTop: THEMATIC_BREAK_MARGIN - STREAMDOWN_BLOCK_GAP,
  };
}

/**
 * Streamdown link: `font-medium text-primary underline`.
 * `--primary` is `oklch(0.21 0.006 285.885)` / `oklch(0.92 0.004 286.32)`.
 * The link style has no weight field, so the renderer asks for weight 500.
 * Inline code and a semibold run keep their own face. Strong is font-semibold.
 */
export function agentChatLinkColor(isDark: boolean): string {
  return isDark ? "#e4e4e7" : "#18181b";
}

/**
 * Web `CodeBlockContent` collapses at `max-h-96`. `0` keeps the native fence at
 * its full height so a tool fence can grow when its expand control opens.
 */
export const ANSWER_FENCE_MAX_HEIGHT = 384;

/**
 * `.atmos-markdown-table` cells set `line-height: 1.625` on 14px type.
 * `text-sm` alone is 20px. The table rule wins, so a cell line is 22.75px.
 */
export const TABLE_LINE_HEIGHT = 14 * 1.625;
/** Short tool prose is `text-sm leading-relaxed`. */
export const TOOL_PROSE_LINE_HEIGHT = 14 * 1.625;
/** Tool, plan, and approval markdown are `text-[13px] leading-relaxed`. */
export const TOOL_MARKDOWN_LINE_HEIGHT = 13 * 1.625;

export const agentChatBlockMetrics = {
  paragraph: { marginTop: 0, marginBottom: STREAMDOWN_BLOCK_GAP },
  list: { marginTop: 4, marginBottom: 4 + STREAMDOWN_BLOCK_GAP, itemSpacing: 8 },
  codeBlock: {
    marginTop: STREAMDOWN_BLOCK_GAP,
    marginBottom: STREAMDOWN_BLOCK_GAP,
    fontSize: 14,
    lineHeight: 20,
    borderRadius: 10,
  },
  table: { marginTop: STREAMDOWN_BLOCK_GAP, marginBottom: STREAMDOWN_BLOCK_GAP, borderRadius: 10 },
} as const;

/**
 * Zinc table chrome from `markdown-table.ts`. Header text is `font-semibold`;
 * the native cell config asks for weight 600 instead of the bold trait.
 * Inline code comes from `MarkdownCodeBlock`,
 * and the fenced frame from `CodeBlock` (`bg-neutral-200/40` / `dark:bg-neutral-800/70`).
 * Dark header and border are those alphas composited on black. Inline code has no border.
 * Web paints inline code zinc-100 (`#f4f4f5`) on a white page. The phone page is
 * `#f4f4f6`, so that token disappears. Light chips use zinc-200 (`#e4e4e7`).
 * The header band is the same step below the phone page as zinc-100 is below
 * white (11, 11, 10), so the zinc-200 rule stays darker than the band.
 * Dark stays zinc-800 on black.
 * Fence syntax colors follow web Shiki `github-light` / `github-dark`.
 * The native fence paints this frame, then a page-colored code pane (`h-9` header,
 * 16px across and 12px down) in the enriched-markdown patch.
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
    headerBackground: "#e9e9ec",
    headerText: "#3f3f46",
    bodyText: "#52525b",
    border: "#e4e4e7",
    row: "#f4f4f6",
    codeBackground: "#e4e4e7",
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

import { useMemo } from "react";
import { Linking } from "react-native";
import { StreamdownText } from "react-native-streamdown";
import type { MarkdownStyle } from "react-native-enriched-markdown";
import { useMobileTheme } from "@/theme/theme-store";
import { chatForeground, chatMutedForeground } from "./chat-ink";
import { chipCompleteHttpUrls, HTTP_CHIP_LINK_VARIANT, httpChipTarget } from "./http-link-chip";
import {
  BLOCKQUOTE_MARGIN,
  STREAMDOWN_BLOCK_GAP,
  THINKING_PARAGRAPH_MARGIN,
  THEMATIC_BREAK_MARGIN,
  ANSWER_FENCE_MAX_HEIGHT,
  TABLE_LINE_HEIGHT,
  agentChatBlockMetrics,
  agentChatBlockquote,
  agentChatProseBlockquote,
  agentChatProseInk,
  agentChatProseListLayout,
  agentChatHeadingStyle,
  agentChatLinkColor,
  agentChatMarkdownChrome,
  agentChatProseMetrics,
  agentChatRendererHeadingStyle,
  agentChatThematicBreak,
  type AgentChatProseKind,
} from "./markdown-chrome";

function openHttpLink(url: string) {
  const target = httpChipTarget(url) ?? url;
  if (target.startsWith("https://") || target.startsWith("http://")) {
    void Linking.openURL(target);
  }
}

export function AgentChatMarkdown({
  text,
  tone = "body",
  fontSize,
  lineHeight,
  chipHttpUrls = false,
  codeBlockMargin,
  codeBlockMaxHeight = ANSWER_FENCE_MAX_HEIGHT,
  codeBlockLineStart = 1,
  prose,
}: {
  text: string;
  tone?: "body" | "thinking";
  /** Overrides the tone default. Omitted body text stays 16 / 22. */
  fontSize?: number;
  lineHeight?: number;
  /** Answer and thinking only. Matches web's hostname chip for complete http URLs. */
  chipHttpUrls?: boolean;
  /** Tool fences use web's `my-2` (8). Answer fences keep 16px below the block. */
  codeBlockMargin?: number;
  /**
   * Pane cap passed to the native fence. Answers use `max-h-96`. Tool code
   * fences pass `0` because their expand control removes a React clip.
   */
  codeBlockMaxHeight?: number;
  /**
   * First gutter number. A read slice passes the file line. Web's
   * `--shiki-line-offset` is this value minus 1.
   */
  codeBlockLineStart?: number;
  /** Tool and plan bodies use `MarkdownRenderer` spacing. Answers stay on streamdown. */
  prose?: AgentChatProseKind;
}) {
  const theme = useMobileTheme();
  const markdownStyle = useMemo<MarkdownStyle>(() => {
    const proseColor =
      tone === "thinking" ? chatMutedForeground(theme.isDark) : chatForeground(theme.isDark);
    const resolvedFontSize = fontSize ?? (tone === "thinking" ? 15 : 16);
    const resolvedLineHeight = lineHeight ?? (tone === "thinking" ? 21 : 22);
    const proseMetrics = prose ? agentChatProseMetrics(prose) : null;
    const proseInk = proseMetrics ? agentChatProseInk(theme.isDark) : null;
    const bodyColor = proseInk?.body ?? proseColor;
    // Answer text follows streamdown `space-y-4`. Thinking and tool prose keep
    // a margin on both sides, because their paragraph gap is not that 16px.
    const symmetricBlockMargin = Boolean(proseMetrics) || tone === "thinking";
    const headings = proseMetrics
      ? agentChatRendererHeadingStyle(proseColor, resolvedFontSize, resolvedLineHeight)
      : agentChatHeadingStyle(proseColor);
    const chrome = agentChatMarkdownChrome(theme.isDark);
    const fenceMargin = codeBlockMargin ?? proseMetrics?.codeBlockMargin;

    return {
      paragraph: {
        color: bodyColor,
        fontSize: resolvedFontSize,
        lineHeight: resolvedLineHeight,
        ...(proseMetrics
          ? {
              marginBottom: proseMetrics.paragraphMargin,
              marginTop: proseMetrics.paragraphMargin,
            }
          : agentChatBlockMetrics.paragraph),
        ...(tone === "thinking" && !proseMetrics
          ? { marginBottom: THINKING_PARAGRAPH_MARGIN, marginTop: 0 }
          : {}),
      },
      ...headings,
      blockquote: {
        ...agentChatBlockquote(theme.isDark),
        ...(symmetricBlockMargin
          ? { marginBottom: BLOCKQUOTE_MARGIN, marginTop: BLOCKQUOTE_MARGIN }
          : {}),
        ...(proseMetrics ? agentChatProseBlockquote(theme.isDark, resolvedFontSize) : {}),
        fontSize: resolvedFontSize,
        lineHeight: resolvedLineHeight,
      },
      list: {
        // Streamdown lists are `list-inside`. The disc's left edge is the
        // text edge; `gapWidth` is the space before the words. A marker
        // minimum would park that 5px disc at the right of a wide column.
        // Ordered labels use the width of the digits they draw (`1.`, `10.`).
        // `marginLeft` is the nested-level indent (`[li_&]:pl-6`).
        // Tool lists replace that with the typography outside-marker column.
        bulletColor: proseInk?.bullet ?? proseColor,
        bulletSize: 5,
        color: bodyColor,
        fontSize: resolvedFontSize,
        gapWidth: 8,
        lineHeight: resolvedLineHeight,
        marginLeft: 24,
        markerColor: proseInk?.counter ?? proseColor,
        // `list-decimal` inherits the item weight. The library default is 500.
        markerFontWeight: "normal",
        ...(proseMetrics
          ? {
              ...agentChatProseListLayout(resolvedFontSize),
              itemSpacing: proseMetrics.itemSpacing,
              marginBottom: proseMetrics.listMargin,
              marginTop: proseMetrics.listMargin,
            }
          : tone === "thinking"
            ? // `py-1` is the 4px pad. `space-y-4` is the 16px bottom. The top pad
              // still stacks on a paragraph's 4px.
              { itemSpacing: 8, marginBottom: 4 + STREAMDOWN_BLOCK_GAP, marginTop: 4 }
            : agentChatBlockMetrics.list),
      },
      code: {
        backgroundColor: chrome.codeBackground,
        borderColor: chrome.codeBorder,
        color: chrome.codeText,
        fontFamily: "Menlo",
        fontSize: 13,
      },
      codeBlock: {
        backgroundColor: chrome.fenceBackground,
        borderColor: chrome.fenceBorder,
        borderWidth: 1,
        color: chrome.fenceText,
        fontFamily: "Menlo",
        syntaxColors: chrome.syntax,
        ...agentChatBlockMetrics.codeBlock,
        lineNumberStart: codeBlockLineStart,
        maxHeight: codeBlockMaxHeight,
        ...(fenceMargin == null
          ? tone === "thinking"
            ? { marginBottom: 16, marginTop: 16 }
            : {}
          : { marginTop: fenceMargin, marginBottom: fenceMargin }),
      },
      image: {
        // Streamdown images are `max-w-full rounded-lg`. This app's `--radius`
        // is 10px. Height 0 keeps a narrower bitmap at its own width and fits
        // a wider one to the line. The library default is a 200px box.
        // Tool markdown clears the 16px bottom margin. `MarkdownRenderer` sets
        // `prose-img:m-0` and `[&_img]:m-0`.
        borderRadius: agentChatBlockMetrics.codeBlock.borderRadius,
        height: 0,
        ...(proseMetrics ? { marginBottom: 0, marginTop: 0 } : {}),
      },
      link: {
        color: proseInk?.link ?? agentChatLinkColor(theme.isDark),
        underline: true,
      },
      ...(proseInk ? { strong: { color: proseInk.bold } } : {}),
      // `<del>` draws its line in `currentColor`. The library default is gray-400.
      strikethrough: {
        color: bodyColor,
      },
      ...(chipHttpUrls
        ? {
            linkVariants: {
              [HTTP_CHIP_LINK_VARIANT]: {
                backgroundColor: theme.colors.cardSubtle,
                color: theme.colors.label,
                underline: false,
              },
            },
          }
        : {}),
      thematicBreak: {
        ...agentChatThematicBreak(theme.isDark),
        // Tool prose is `my-6` on both sides. Answer and thinking rules keep the
        // 8px top so a short previous block can grow it to 24px.
        ...(proseMetrics
          ? { marginBottom: THEMATIC_BREAK_MARGIN, marginTop: THEMATIC_BREAK_MARGIN }
          : {}),
      },
      table: {
        borderColor: chrome.border,
        borderWidth: 1,
        cellPaddingHorizontal: 16,
        cellPaddingVertical: 10,
        color: chrome.bodyText,
        fontSize: 14,
        headerBackgroundColor: chrome.headerBackground,
        headerTextColor: chrome.headerText,
        lineHeight: TABLE_LINE_HEIGHT,
        rowEvenBackgroundColor: chrome.row,
        rowOddBackgroundColor: chrome.row,
        ...agentChatBlockMetrics.table,
        ...(proseMetrics
          ? { marginBottom: proseMetrics.tableMargin, marginTop: proseMetrics.tableMargin }
          : symmetricBlockMargin
            ? { marginBottom: 16, marginTop: 16 }
            : {}),
      },
    };
  }, [
    chipHttpUrls,
    codeBlockLineStart,
    codeBlockMargin,
    codeBlockMaxHeight,
    fontSize,
    lineHeight,
    prose,
    theme,
    tone,
  ]);

  const markdown = useMemo(
    () => (chipHttpUrls ? chipCompleteHttpUrls(text) : text),
    [chipHttpUrls, text],
  );

  if (markdown.length === 0) return null;

  return (
    <StreamdownText
      // Tool prose keeps the last block's bottom margin. Answers clear it.
      allowTrailingMargin={prose != null}
      enableTaskListItemToggle={false}
      flavor="github"
      markdown={markdown}
      markdownStyle={markdownStyle}
      onLinkPress={({ url }) => openHttpLink(url)}
    />
  );
}

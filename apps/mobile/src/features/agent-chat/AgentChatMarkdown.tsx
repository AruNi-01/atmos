import { useMemo } from "react";
import { Linking } from "react-native";
import { StreamdownText } from "react-native-streamdown";
import type { MarkdownStyle } from "react-native-enriched-markdown";
import { useMobileTheme } from "@/theme/theme-store";
import { chatForeground, chatMutedForeground } from "./chat-ink";
import { chipCompleteHttpUrls, HTTP_CHIP_LINK_VARIANT, httpChipTarget } from "./http-link-chip";
import {
  BLOCKQUOTE_MARGIN,
  THINKING_PARAGRAPH_MARGIN,
  THEMATIC_BREAK_MARGIN,
  ANSWER_FENCE_MAX_HEIGHT,
  TABLE_LINE_HEIGHT,
  agentChatBlockMetrics,
  agentChatBlockquote,
  agentChatProseBlockquote,
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
    // Answer text follows streamdown `space-y-4`. Thinking and tool prose keep
    // a margin on both sides, because their paragraph gap is not that 16px.
    const symmetricBlockMargin = Boolean(proseMetrics) || tone === "thinking";
    const headings = proseMetrics
      ? agentChatRendererHeadingStyle(proseColor, resolvedFontSize, resolvedLineHeight)
      : agentChatHeadingStyle(proseColor, tone === "thinking" ? 8 : 16);
    const chrome = agentChatMarkdownChrome(theme.isDark);
    const fenceMargin = codeBlockMargin ?? proseMetrics?.codeBlockMargin;

    return {
      paragraph: {
        color: proseColor,
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
        bulletColor: proseColor,
        bulletSize: 5,
        color: proseColor,
        fontSize: resolvedFontSize,
        gapWidth: 8,
        lineHeight: resolvedLineHeight,
        marginLeft: 24,
        markerColor: proseColor,
        // `list-decimal` inherits the item weight. The library default is 500.
        markerFontWeight: "normal",
        ...(proseMetrics
          ? {
              itemSpacing: proseMetrics.itemSpacing,
              marginBottom: proseMetrics.listMargin,
              marginTop: proseMetrics.listMargin,
            }
          : tone === "thinking"
            ? { itemSpacing: 8, marginBottom: 4, marginTop: 4 }
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
        borderRadius: agentChatBlockMetrics.codeBlock.borderRadius,
        height: 0,
      },
      link: {
        color: agentChatLinkColor(theme.isDark),
        underline: true,
      },
      // `<del>` draws its line in `currentColor`. The library default is gray-400.
      strikethrough: {
        color: proseColor,
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
        ...(symmetricBlockMargin
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
        ...(symmetricBlockMargin ? { marginBottom: 16, marginTop: 16 } : {}),
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
      enableTaskListItemToggle={false}
      flavor="github"
      markdown={markdown}
      markdownStyle={markdownStyle}
      onLinkPress={({ url }) => openHttpLink(url)}
    />
  );
}

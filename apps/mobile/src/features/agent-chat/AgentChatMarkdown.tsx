import { useMemo } from "react";
import { Linking } from "react-native";
import { StreamdownText } from "react-native-streamdown";
import type { MarkdownStyle } from "react-native-enriched-markdown";
import { useMobileTheme } from "@/theme/theme-store";
import { chipCompleteHttpUrls, HTTP_CHIP_LINK_VARIANT, httpChipTarget } from "./http-link-chip";
import {
  THINKING_PARAGRAPH_MARGIN,
  agentChatBlockMetrics,
  agentChatBlockquote,
  agentChatHeadingStyle,
  agentChatMarkdownChrome,
  agentChatThematicBreak,
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
}: {
  text: string;
  tone?: "body" | "thinking";
  /** Overrides the tone default. Omitted body text stays 16 / 22. */
  fontSize?: number;
  lineHeight?: number;
  /** Answer and thinking only. Matches web's hostname chip for complete http URLs. */
  chipHttpUrls?: boolean;
  /** Tool fences use web's `my-2` (8). Answer fences keep `my-4`. */
  codeBlockMargin?: number;
}) {
  const theme = useMobileTheme();
  const markdownStyle = useMemo<MarkdownStyle>(() => {
    const proseColor = tone === "thinking" ? theme.colors.secondaryLabel : theme.colors.label;
    const resolvedFontSize = fontSize ?? (tone === "thinking" ? 15 : 16);
    const resolvedLineHeight = lineHeight ?? (tone === "thinking" ? 21 : 22);
    const headings = agentChatHeadingStyle(proseColor);
    const chrome = agentChatMarkdownChrome(theme.isDark);

    return {
      paragraph: {
        color: proseColor,
        fontSize: resolvedFontSize,
        lineHeight: resolvedLineHeight,
        ...agentChatBlockMetrics.paragraph,
        ...(tone === "thinking"
          ? { marginBottom: THINKING_PARAGRAPH_MARGIN, marginTop: THINKING_PARAGRAPH_MARGIN }
          : {}),
      },
      ...headings,
      blockquote: {
        ...agentChatBlockquote(theme.isDark),
        fontSize: resolvedFontSize,
        lineHeight: resolvedLineHeight,
      },
      list: {
        // Web streamdown lists are `list-inside list-disc`. The default disc
        // sat on the text with no marker column, so the item reads as a
        // hanging bullet. Indent the line and keep the disc inside that column.
        bulletColor: proseColor,
        bulletSize: 5,
        color: proseColor,
        fontSize: resolvedFontSize,
        gapWidth: 8,
        lineHeight: resolvedLineHeight,
        marginLeft: 24,
        markerColor: proseColor,
        markerMinWidth: 18,
        ...agentChatBlockMetrics.list,
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
        ...(codeBlockMargin == null
          ? {}
          : { marginTop: codeBlockMargin, marginBottom: codeBlockMargin }),
      },
      link: {
        color: theme.colors.accent,
        underline: true,
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
      thematicBreak: agentChatThematicBreak(theme.isDark),
      table: {
        borderColor: chrome.border,
        borderWidth: 1,
        cellPaddingHorizontal: 16,
        cellPaddingVertical: 10,
        color: chrome.bodyText,
        fontSize: 14,
        headerBackgroundColor: chrome.headerBackground,
        headerTextColor: chrome.headerText,
        lineHeight: 20,
        rowEvenBackgroundColor: chrome.row,
        rowOddBackgroundColor: chrome.row,
        ...agentChatBlockMetrics.table,
      },
    };
  }, [chipHttpUrls, codeBlockMargin, fontSize, lineHeight, theme, tone]);

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

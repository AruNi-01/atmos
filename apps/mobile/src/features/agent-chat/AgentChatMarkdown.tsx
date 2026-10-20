import { useMemo } from "react";
import { Linking } from "react-native";
import { StreamdownText } from "react-native-streamdown";
import type { MarkdownStyle } from "react-native-enriched-markdown";
import { useMobileTheme } from "@/theme/theme-store";
import {
  agentChatBlockMetrics,
  agentChatCardHeadingStyle,
  agentChatCardListBlock,
  agentChatCardListMetrics,
  agentChatHeadingStyle,
  agentChatMarkdownChrome,
} from "./markdown-chrome";

function openHttpLink(url: string) {
  if (url.startsWith("https://") || url.startsWith("http://")) {
    void Linking.openURL(url);
  }
}

export function AgentChatMarkdown({
  text,
  tone = "body",
  variant = "prose",
  fontSize,
  lineHeight,
}: {
  text: string;
  tone?: "body" | "thinking";
  /** Card markdown uses the 14/500 title scale and a shared list indent. */
  variant?: "prose" | "card";
  /** Overrides the tone default. Omitted body text stays 16 / 22. */
  fontSize?: number;
  lineHeight?: number;
}) {
  const theme = useMobileTheme();
  const markdownStyle = useMemo<MarkdownStyle>(() => {
    const proseColor = tone === "thinking" ? theme.colors.secondaryLabel : theme.colors.label;
    const resolvedFontSize = fontSize ?? (tone === "thinking" ? 15 : 16);
    const resolvedLineHeight = lineHeight ?? (tone === "thinking" ? 21 : 22);
    const headings =
      variant === "card"
        ? agentChatCardHeadingStyle(proseColor)
        : agentChatHeadingStyle(proseColor);
    const chrome = agentChatMarkdownChrome(theme.isDark);

    return {
      paragraph: {
        color: proseColor,
        fontSize: resolvedFontSize,
        lineHeight: resolvedLineHeight,
        ...agentChatBlockMetrics.paragraph,
      },
      ...headings,
      blockquote: {
        backgroundColor: theme.colors.cardSubtle,
        borderColor: theme.colors.glassBorder,
        borderWidth: 3,
        color: proseColor,
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
        gapWidth: variant === "card" ? agentChatCardListMetrics.gapWidth : 8,
        lineHeight: resolvedLineHeight,
        marginLeft: variant === "card" ? agentChatCardListMetrics.marginLeft : 24,
        markerColor: proseColor,
        markerMinWidth: variant === "card" ? agentChatCardListMetrics.markerMinWidth : 18,
        ...(variant === "card" ? agentChatCardListBlock : agentChatBlockMetrics.list),
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
      },
      link: {
        color: theme.colors.accent,
        underline: true,
      },
      thematicBreak: {
        color: theme.colors.separator,
        height: 1,
      },
      table: {
        borderColor: chrome.border,
        borderRadius: 8,
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
  }, [fontSize, lineHeight, theme, tone, variant]);

  if (text.length === 0) return null;

  return (
    <StreamdownText
      enableTaskListItemToggle={false}
      flavor="github"
      markdown={text}
      markdownStyle={markdownStyle}
      onLinkPress={({ url }) => openHttpLink(url)}
    />
  );
}

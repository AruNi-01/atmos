import { useMemo } from "react";
import { Linking } from "react-native";
import { StreamdownText } from "react-native-streamdown";
import type { MarkdownStyle } from "react-native-enriched-markdown";
import { useMobileTheme } from "@/theme/theme-store";
import { agentChatHeadingStyle, agentChatMarkdownChrome } from "./markdown-chrome";

function openHttpLink(url: string) {
  if (url.startsWith("https://") || url.startsWith("http://")) {
    void Linking.openURL(url);
  }
}

export function AgentChatMarkdown({
  text,
  tone = "body",
  fontSize,
  lineHeight,
}: {
  text: string;
  tone?: "body" | "thinking";
  /** Overrides the tone default. Omitted body text stays 16 / 22. */
  fontSize?: number;
  lineHeight?: number;
}) {
  const theme = useMobileTheme();
  const markdownStyle = useMemo<MarkdownStyle>(() => {
    const proseColor = tone === "thinking" ? theme.colors.secondaryLabel : theme.colors.label;
    const resolvedFontSize = fontSize ?? (tone === "thinking" ? 15 : 16);
    const resolvedLineHeight = lineHeight ?? (tone === "thinking" ? 21 : 22);
    const headings = agentChatHeadingStyle(proseColor);
    const chrome = agentChatMarkdownChrome(theme.isDark);

    return {
      paragraph: { color: proseColor, fontSize: resolvedFontSize, lineHeight: resolvedLineHeight },
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
        gapWidth: 8,
        lineHeight: resolvedLineHeight,
        marginLeft: 24,
        markerColor: proseColor,
        markerMinWidth: 18,
      },
      code: {
        backgroundColor: chrome.codeBackground,
        borderColor: chrome.codeBackground,
        color: chrome.codeText,
        fontFamily: "Menlo",
        fontSize: 13,
      },
      codeBlock: {
        backgroundColor: theme.colors.cardSubtle,
        borderColor: theme.colors.glassBorder,
        borderRadius: 12,
        borderWidth: 1,
        color: theme.colors.label,
        fontFamily: "Menlo",
        fontSize: 13,
        lineHeight: 18,
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
      },
    };
  }, [fontSize, lineHeight, theme, tone]);

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

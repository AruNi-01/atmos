import { useMemo } from "react";
import { Linking } from "react-native";
import { StreamdownText } from "react-native-streamdown";
import type { MarkdownStyle } from "react-native-enriched-markdown";
import { useMobileTheme } from "@/theme/theme-store";

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
    const heading = { color: proseColor, lineHeight: resolvedLineHeight };

    return {
      paragraph: { color: proseColor, fontSize: resolvedFontSize, lineHeight: resolvedLineHeight },
      h1: heading,
      h2: heading,
      h3: heading,
      h4: heading,
      h5: heading,
      h6: heading,
      blockquote: {
        backgroundColor: theme.colors.cardSubtle,
        borderColor: theme.colors.glassBorder,
        borderWidth: 3,
        color: proseColor,
        fontSize: resolvedFontSize,
        lineHeight: resolvedLineHeight,
      },
      list: {
        bulletColor: proseColor,
        color: proseColor,
        fontSize: resolvedFontSize,
        lineHeight: resolvedLineHeight,
        markerColor: proseColor,
      },
      code: {
        backgroundColor: theme.colors.cardSubtle,
        color: theme.colors.label,
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

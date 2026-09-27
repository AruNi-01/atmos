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
}: {
  text: string;
  tone?: "body" | "thinking";
}) {
  const theme = useMobileTheme();
  const markdownStyle = useMemo<MarkdownStyle>(() => {
    const proseColor = tone === "thinking" ? theme.colors.secondaryLabel : theme.colors.label;
    const fontSize = tone === "thinking" ? 15 : 16;
    const lineHeight = tone === "thinking" ? 21 : 22;
    const heading = { color: proseColor, lineHeight };

    return {
      paragraph: { color: proseColor, fontSize, lineHeight },
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
        fontSize,
        lineHeight,
      },
      list: {
        bulletColor: proseColor,
        color: proseColor,
        fontSize,
        lineHeight,
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
  }, [theme, tone]);

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

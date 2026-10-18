// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  BLOCKQUOTE_BORDER,
  BLOCKQUOTE_GAP,
  BLOCKQUOTE_MARGIN,
  ANSWER_FENCE_MAX_HEIGHT,
  TABLE_LINE_HEIGHT,
  TOOL_MARKDOWN_LINE_HEIGHT,
  TOOL_PROSE_LINE_HEIGHT,
  STREAMDOWN_BLOCK_GAP,
  THINKING_PARAGRAPH_MARGIN,
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
  THEMATIC_BREAK_MARGIN,
} from "./markdown-chrome";

/** Same RGB step as `from` → `to`, applied to `page`. */
function steppedFill(from: string, to: string, page: string): string {
  const channels = (hex: string) =>
    [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const [fromRgb, toRgb, pageRgb] = [from, to, page].map((hex) => channels(hex.slice(1)));
  const next = pageRgb.map((channel, index) => channel + toRgb[index]! - fromRgb[index]!);
  return `#${next.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

describe("agent chat markdown chrome", () => {
  test("uses zinc table and inline-code colors instead of the library defaults", () => {
    const light = agentChatMarkdownChrome(false);
    const dark = agentChatMarkdownChrome(true);

    expect(light.codeBackground).toBe("#e4e4e7");
    expect(light.codeBackground).not.toBe("#f4f4f6");
    expect(light.codeText).toBe("#27272a");
    expect(light.codeBorder).toBe("rgba(0,0,0,0)");
    expect(light.headerBackground).toBe(steppedFill("#ffffff", "#f4f4f5", "#f4f4f6"));
    expect(light.headerBackground).toBe("#e9e9ec");
    expect(light.border).toBe("#e4e4e7");
    expect(light.row).toBe("#f4f4f6");
    expect(light.fenceBackground).toBe("#eeeeef");
    expect(light.fenceBorder).toBe("#e5e5e5");
    expect(light.syntax.keyword).toBe("#cf222e");
    expect(dark.codeBackground).toBe("#27272a");
    expect(dark.codeText).toBe("#e4e4e7");
    expect(dark.codeBorder).toBe("rgba(0,0,0,0)");
    expect(dark.row).not.toBe("#ffffff");
    expect(dark.headerBackground).toBe("#1f1f22");
    expect(dark.border).toBe("#202023");
    expect(dark.bodyText).toBe("#a1a1aa");
    expect(dark.fenceBackground).toBe("#1b1b1b");
    expect(dark.fenceBorder).toBe("#262626");
    expect(dark.syntax.keyword).toBe("#ff7b72");
    expect(light.codeBackground).not.toBe("#FDF2F4");
    expect(dark.codeBorder).not.toBe("#F8D7DA");
  });

  test("keeps streamdown heading line boxes taller than the glyphs", () => {
    const headings = agentChatHeadingStyle("#111112");
    expect(headings.h1).toEqual({
      color: "#111112",
      fontSize: 30,
      fontWeight: "600",
      lineHeight: 36,
      marginBottom: 16,
      marginTop: 24,
    });
    expect(agentChatHeadingStyle("#111112", 8).h1.marginBottom).toBe(8);
    expect(headings.h2.lineHeight).toBe(32);
    expect(headings.h6).toMatchObject({ fontSize: 14, lineHeight: 20 });
    const renderer = agentChatRendererHeadingStyle("#111112", 13, 21);
    expect(renderer.h1).toEqual({
      color: "#111112",
      fontSize: 24,
      fontWeight: "600",
      lineHeight: 32,
      marginBottom: 12,
      marginTop: 24,
    });
    expect(renderer.h2).toMatchObject({
      fontSize: 20,
      lineHeight: 28,
      marginTop: 20,
      marginBottom: 10,
    });
    expect(renderer.h4).toMatchObject({
      fontSize: 16,
      lineHeight: 24,
      marginTop: 12,
      marginBottom: 6,
    });
    expect(renderer.h6).toMatchObject({
      fontSize: 13,
      lineHeight: 21,
      marginTop: 8,
      marginBottom: 8,
    });
    expect(agentChatProseMetrics("tool")).toEqual({
      codeBlockMargin: 8,
      itemSpacing: 0,
      listMargin: 4,
      paragraphMargin: 4,
      tableMargin: 8,
    });
    expect(agentChatProseMetrics("plan")).toEqual({
      codeBlockMargin: 16,
      itemSpacing: 2,
      listMargin: 6,
      paragraphMargin: 6,
      tableMargin: 16,
    });
    expect(agentChatProseMetrics("approval").codeBlockMargin).toBe(8);
    expect(agentChatProseMetrics("approval").paragraphMargin).toBe(6);
    expect(agentChatProseMetrics("approval").tableMargin).toBe(8);
    for (const heading of Object.values(headings)) {
      expect(heading.lineHeight).toBeGreaterThanOrEqual(heading.fontSize);
    }
  });

  test("matches web block margins", () => {
    expect(STREAMDOWN_BLOCK_GAP).toBe(16);
    expect(agentChatBlockMetrics.paragraph).toEqual({
      marginTop: 0,
      marginBottom: STREAMDOWN_BLOCK_GAP,
    });
    expect(THINKING_PARAGRAPH_MARGIN).toBe(4);
    expect(agentChatBlockMetrics.list).toEqual({
      marginTop: 4,
      marginBottom: 4 + STREAMDOWN_BLOCK_GAP,
      itemSpacing: 8,
    });
    expect(ANSWER_FENCE_MAX_HEIGHT).toBe(384);
    expect(agentChatBlockMetrics.codeBlock).toMatchObject({
      marginTop: 0,
      marginBottom: STREAMDOWN_BLOCK_GAP,
      fontSize: 14,
      lineHeight: 20,
      borderRadius: 10,
    });
    expect(agentChatBlockMetrics.table).toEqual({
      marginTop: 0,
      marginBottom: STREAMDOWN_BLOCK_GAP,
      borderRadius: 10,
    });
    expect(TABLE_LINE_HEIGHT).toBe(22.75);
    expect(TOOL_PROSE_LINE_HEIGHT).toBe(22.75);
    expect(TOOL_MARKDOWN_LINE_HEIGHT).toBe(21.125);
    const markdown = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "AgentChatMarkdown.tsx"),
      "utf8",
    );
    expect(markdown).toContain("lineHeight: TABLE_LINE_HEIGHT");
    expect(markdown).toContain("marginBottom: THINKING_PARAGRAPH_MARGIN, marginTop: 0");
    expect(markdown).not.toContain("marginTop: THINKING_PARAGRAPH_MARGIN");
    expect(markdown).toContain("marginBottom: BLOCKQUOTE_MARGIN, marginTop: BLOCKQUOTE_MARGIN");
    expect(markdown).toContain(
      "marginBottom: THEMATIC_BREAK_MARGIN, marginTop: THEMATIC_BREAK_MARGIN",
    );
    expect(markdown).toContain("codeBlockMaxHeight = ANSWER_FENCE_MAX_HEIGHT");
    expect(markdown).toContain("maxHeight: codeBlockMaxHeight");
    expect(markdown).toContain("codeBlockLineStart = 1");
    expect(markdown).toContain("lineNumberStart: codeBlockLineStart");
    expect(markdown).toContain("marginLeft: 24");
    expect(markdown).toContain("gapWidth: 8");
    expect(markdown).toContain('markerFontWeight: "normal"');
    expect(markdown).toContain("borderRadius: agentChatBlockMetrics.codeBlock.borderRadius");
    expect(markdown).toContain("Streamdown images are `max-w-full rounded-lg`");
    const imageStyle = markdown.slice(markdown.indexOf("image:"), markdown.indexOf("link:"));
    expect(imageStyle).toContain("height: 0");
    expect(imageStyle).toContain("proseMetrics ? { marginBottom: 0, marginTop: 0 }");
    expect(markdown.split("height: 0").length).toBe(2);
    expect(markdown).not.toContain("markerMinWidth");
    expect(markdown).toContain("{ itemSpacing: 8, marginBottom: 4, marginTop: 4 }");
    expect(markdown).toContain("{ marginBottom: 16, marginTop: 16 }");
    expect(markdown).toContain('tone === "thinking"');
    expect(markdown).toContain("agentChatProseMetrics(prose)");
    expect(markdown).toContain("allowTrailingMargin={prose != null}");
    expect(markdown).toContain("agentChatRendererHeadingStyle");
    expect(markdown).toContain('agentChatHeadingStyle(proseColor, tone === "thinking" ? 8 : 16)');
    expect(markdown).toContain("chatForeground(theme.isDark)");
    expect(markdown).toContain("chatMutedForeground(theme.isDark)");
    expect(BLOCKQUOTE_MARGIN).toBe(16);
    expect(BLOCKQUOTE_BORDER).toBe(4);
    expect(BLOCKQUOTE_GAP).toBe(16);
    expect(agentChatBlockquote(false)).toEqual({
      backgroundColor: "transparent",
      borderColor: "rgba(113, 113, 123, 0.3)",
      borderRadius: 0,
      borderWidth: 4,
      color: "#71717b",
      gapWidth: 16,
      marginBottom: 16,
      marginTop: 0,
    });
    expect(agentChatBlockquote(true).borderColor).toBe("rgba(159, 159, 169, 0.3)");
    expect(agentChatBlockquote(true).color).toBe("#9f9fa9");
    expect(agentChatProseBlockquote(false, 13)).toEqual({
      borderColor: "#e5e7eb",
      color: "#101828",
      fontWeight: "500",
      gapWidth: (20 / 18) * 13,
      marginBottom: (24 / 18) * 13,
      marginTop: (24 / 18) * 13,
    });
    expect(agentChatProseBlockquote(true, 13).borderColor).toBe("#364153");
    expect(agentChatProseBlockquote(true, 13).color).toBe("#f3f4f6");
    expect(agentChatProseInk(false)).toEqual({
      body: "#364153",
      bold: "#101828",
      bullet: "#d1d5dc",
      counter: "#6a7282",
      link: "#101828",
    });
    expect(agentChatProseInk(true)).toEqual({
      body: "#d1d5dc",
      bold: "#ffffff",
      bullet: "#4a5565",
      counter: "#99a1af",
      link: "#ffffff",
    });
    expect(agentChatProseListLayout(13)).toEqual({
      gapWidth: (6 / 14) * 13,
      marginLeft: 26,
      markerMinWidth: (22 / 14) * 13,
    });
    expect(markdown).toContain("...agentChatProseListLayout(resolvedFontSize)");
    expect(markdown).toContain("const bodyColor = proseInk?.body ?? proseColor");
    expect(markdown).toContain("bulletColor: proseInk?.bullet ?? proseColor");
    expect(markdown).toContain("markerColor: proseInk?.counter ?? proseColor");
    const quote = markdown.slice(markdown.indexOf("blockquote:"), markdown.indexOf("list:"));
    expect(quote).toContain("agentChatBlockquote(theme.isDark)");
    expect(quote).toContain(
      "proseMetrics ? agentChatProseBlockquote(theme.isDark, resolvedFontSize)",
    );
    expect(quote).not.toContain("glassBorder");
    expect(quote).not.toContain("cardSubtle");
    expect(THEMATIC_BREAK_MARGIN).toBe(24);
    expect(agentChatThematicBreak(false)).toEqual({
      color: "rgba(0, 0, 0, 0.1)",
      height: 1,
      marginBottom: 24,
      marginTop: 8,
    });
    expect(agentChatThematicBreak(true).color).toBe("rgba(255, 255, 255, 0.1)");
    expect(markdown).toContain("...agentChatThematicBreak(theme.isDark)");
    expect(markdown).not.toContain("theme.colors.separator");
    expect(agentChatLinkColor(false)).toBe("#18181b");
    expect(agentChatLinkColor(true)).toBe("#e4e4e7");
    const link = markdown.slice(markdown.indexOf("link: {"), markdown.indexOf("strikethrough:"));
    expect(link).toContain("agentChatLinkColor(theme.isDark)");
    expect(link).toContain("underline: true");
    expect(link).not.toContain("theme.colors.accent");
    const strike = markdown.slice(
      markdown.indexOf("strikethrough:"),
      markdown.indexOf("thematicBreak:"),
    );
    expect(strike).toContain("color: bodyColor");
    expect(markdown).toContain("strong: { color: proseInk.bold }");
    const table = markdown.slice(
      markdown.indexOf("table: {"),
      markdown.indexOf("const markdown ="),
    );
    expect(table).toContain("agentChatBlockMetrics.table");
    expect(table).not.toContain("borderRadius:");
  });
});

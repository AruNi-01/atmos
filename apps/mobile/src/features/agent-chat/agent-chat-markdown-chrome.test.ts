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
  THINKING_PARAGRAPH_MARGIN,
  agentChatBlockMetrics,
  agentChatBlockquote,
  agentChatHeadingStyle,
  agentChatMarkdownChrome,
  agentChatThematicBreak,
  THEMATIC_BREAK_MARGIN,
} from "./markdown-chrome";

describe("agent chat markdown chrome", () => {
  test("uses zinc table and inline-code colors instead of the library defaults", () => {
    const light = agentChatMarkdownChrome(false);
    const dark = agentChatMarkdownChrome(true);

    expect(light.codeBackground).toBe("#f4f4f5");
    expect(light.codeText).toBe("#27272a");
    expect(light.codeBorder).toBe("rgba(0,0,0,0)");
    expect(light.headerBackground).toBe("#f4f4f5");
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
      marginBottom: 8,
      marginTop: 24,
    });
    expect(headings.h2.lineHeight).toBe(32);
    expect(headings.h6).toMatchObject({ fontSize: 14, lineHeight: 20 });
    for (const heading of Object.values(headings)) {
      expect(heading.lineHeight).toBeGreaterThanOrEqual(heading.fontSize);
    }
  });

  test("matches web block margins", () => {
    expect(agentChatBlockMetrics.paragraph).toEqual({ marginTop: 0, marginBottom: 0 });
    expect(THINKING_PARAGRAPH_MARGIN).toBe(4);
    expect(agentChatBlockMetrics.list).toEqual({ marginTop: 0, marginBottom: 0, itemSpacing: 8 });
    expect(agentChatBlockMetrics.codeBlock).toMatchObject({
      marginTop: 16,
      marginBottom: 16,
      fontSize: 14,
      lineHeight: 20,
      borderRadius: 10,
    });
    expect(agentChatBlockMetrics.table).toEqual({
      marginTop: 16,
      marginBottom: 16,
      borderRadius: 10,
    });
    const markdown = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "AgentChatMarkdown.tsx"),
      "utf8",
    );
    expect(markdown).toContain("THINKING_PARAGRAPH_MARGIN");
    expect(markdown).toContain('tone === "thinking"');
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
      marginTop: 16,
    });
    expect(agentChatBlockquote(true).borderColor).toBe("rgba(159, 159, 169, 0.3)");
    expect(agentChatBlockquote(true).color).toBe("#9f9fa9");
    const quote = markdown.slice(markdown.indexOf("blockquote:"), markdown.indexOf("list:"));
    expect(quote).toContain("agentChatBlockquote(theme.isDark)");
    expect(quote).not.toContain("glassBorder");
    expect(quote).not.toContain("cardSubtle");
    expect(THEMATIC_BREAK_MARGIN).toBe(24);
    expect(agentChatThematicBreak(false)).toEqual({
      color: "rgba(0, 0, 0, 0.1)",
      height: 1,
      marginBottom: 24,
      marginTop: 24,
    });
    expect(agentChatThematicBreak(true).color).toBe("rgba(255, 255, 255, 0.1)");
    expect(markdown).toContain("thematicBreak: agentChatThematicBreak(theme.isDark)");
    expect(markdown).not.toContain("theme.colors.separator");
    const table = markdown.slice(
      markdown.indexOf("table: {"),
      markdown.indexOf("const markdown ="),
    );
    expect(table).toContain("agentChatBlockMetrics.table");
    expect(table).not.toContain("borderRadius:");
  });
});

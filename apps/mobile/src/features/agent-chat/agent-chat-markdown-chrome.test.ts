// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  agentChatBlockMetrics,
  agentChatHeadingStyle,
  agentChatMarkdownChrome,
} from "./markdown-chrome";

describe("agent chat markdown chrome", () => {
  test("uses zinc table and inline-code colors instead of the library defaults", () => {
    const light = agentChatMarkdownChrome(false);
    const dark = agentChatMarkdownChrome(true);

    expect(light.codeBackground).toBe("#f4f4f5");
    expect(light.codeText).toBe("#27272a");
    expect(light.headerBackground).toBe("#f4f4f5");
    expect(light.row).toBe("#f4f4f6");
    expect(dark.codeBackground).toBe("#27272a");
    expect(dark.codeText).toBe("#e4e4e7");
    expect(dark.row).not.toBe("#ffffff");
    expect(dark.headerBackground).toBe("#27272a");
    expect(dark.bodyText).toBe("#a1a1aa");
  });

  test("keeps streamdown heading line boxes taller than the glyphs", () => {
    const headings = agentChatHeadingStyle("#111112");
    expect(headings.h1).toEqual({
      color: "#111112",
      fontSize: 30,
      fontWeight: "600",
      lineHeight: 36,
      marginBottom: 8,
      marginTop: 0,
    });
    expect(headings.h2.lineHeight).toBe(32);
    expect(headings.h6).toMatchObject({ fontSize: 14, lineHeight: 20 });
    for (const heading of Object.values(headings)) {
      expect(heading.lineHeight).toBeGreaterThanOrEqual(heading.fontSize);
    }
  });

  test("matches web block margins", () => {
    expect(agentChatBlockMetrics.paragraph).toEqual({ marginTop: 0, marginBottom: 0 });
    expect(agentChatBlockMetrics.list).toEqual({ marginTop: 0, marginBottom: 0, itemSpacing: 8 });
    expect(agentChatBlockMetrics.codeBlock).toMatchObject({
      marginTop: 16,
      marginBottom: 16,
      fontSize: 14,
      lineHeight: 20,
      borderRadius: 8,
    });
    expect(agentChatBlockMetrics.table).toEqual({ marginTop: 16, marginBottom: 16 });
  });
});

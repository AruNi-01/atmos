// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  agentChatBlockMetrics,
  agentChatHeadingScale,
  agentChatHeadingStyle,
  agentChatMarkdownChrome,
} from "./markdown-chrome";

const workspace = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("agent chat markdown chrome", () => {
  test("uses zinc table and inline-code colors instead of the library defaults", () => {
    const light = agentChatMarkdownChrome(false);
    const dark = agentChatMarkdownChrome(true);

    expect(light.codeBackground).toBe("#e4e4e7");
    expect(light.codeBackground).not.toBe("#f4f4f5");
    expect(light.codeBackground).not.toBe("#f4f4f6");
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
      marginTop: 0,
    });
    expect(headings.h2.lineHeight).toBe(32);
    expect(headings.h6).toMatchObject({ fontSize: 14, lineHeight: 20 });
    for (const heading of Object.values(headings)) {
      expect(heading.lineHeight).toBeGreaterThanOrEqual(heading.fontSize);
    }
  });

  test("agent answers follow Streamdown text-3xl, not MarkdownRenderer text-2xl", () => {
    const partView = readFileSync(
      join(workspace, "apps/web/src/features/agent/components/AgentPartView.tsx"),
      "utf8",
    );
    const renderer = readFileSync(
      join(workspace, "apps/web/src/shared/components/markdown/MarkdownRenderer.tsx"),
      "utf8",
    );
    const chrome = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "markdown-chrome.ts"),
      "utf8",
    );
    expect(partView).toContain("MessageResponse");
    expect(partView).not.toContain("MarkdownRenderer");
    expect(renderer).toContain("text-2xl font-semibold");
    expect(renderer).toContain("text-xl font-semibold");
    expect(chrome).toContain("Streamdown heading scale");
    expect(agentChatHeadingScale).toEqual({
      h1: { fontSize: 30, lineHeight: 36 },
      h2: { fontSize: 24, lineHeight: 32 },
      h3: { fontSize: 20, lineHeight: 28 },
      h4: { fontSize: 18, lineHeight: 28 },
      h5: { fontSize: 16, lineHeight: 24 },
      h6: { fontSize: 14, lineHeight: 20 },
    });
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

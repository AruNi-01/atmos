// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  chipCompleteHttpUrls,
  completeHttpUrl,
  HTTP_CHIP_HREF_PREFIX,
  httpChipTarget,
} from "./http-link-chip";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

function chip(url: string): string {
  const normalized = new URL(url).toString();
  return `[${new URL(normalized).hostname.replace(/^www\./i, "")}](${HTTP_CHIP_HREF_PREFIX}${normalized})`;
}

describe("complete http chips", () => {
  test("uses the hostname and keeps www on the href", () => {
    expect(chipCompleteHttpUrls("see https://www.example.com/docs please")).toBe(
      `see ${chip("https://www.example.com/docs")} please`,
    );
  });

  test("leaves trailing punctuation outside the chip", () => {
    expect(chipCompleteHttpUrls("https://example.com/a, thanks")).toBe(
      `${chip("https://example.com/a")}, thanks`,
    );
    expect(chipCompleteHttpUrls("https://example.com.")).toBe(`${chip("https://example.com")}.`);
  });

  test("chips localhost and an ipv4 host", () => {
    expect(chipCompleteHttpUrls("http://localhost:3000/x")).toBe(chip("http://localhost:3000/x"));
    expect(chipCompleteHttpUrls("http://127.0.0.1/a")).toBe(chip("http://127.0.0.1/a"));
  });

  test("does not chip an incomplete host", () => {
    expect(completeHttpUrl("https://ex")).toBeNull();
    expect(completeHttpUrl("streamdown:incomplete-link")).toBeNull();
    expect(chipCompleteHttpUrls("still https://ex today")).toBe("still https://ex today");
    expect(chipCompleteHttpUrls("[docs](https://ex)")).toBe("[docs](https://ex)");
  });

  test("rewrites a complete markdown link and an angle autolink", () => {
    expect(chipCompleteHttpUrls("[docs](https://example.com/a)")).toBe(
      chip("https://example.com/a"),
    );
    expect(chipCompleteHttpUrls('[docs](https://example.com/a "Read")')).toBe(
      chip("https://example.com/a"),
    );
    expect(chipCompleteHttpUrls("<https://example.com/docs>")).toBe(
      chip("https://example.com/docs"),
    );
  });

  test("leaves code, images, and reference definitions unchanged", () => {
    const fenced = "```\nhttps://example.com\n```\n";
    const indented = "\n    https://example.com\n";
    const reference = "[ref]: https://example.com/a\n";
    expect(chipCompleteHttpUrls("use `https://example.com` now")).toBe(
      "use `https://example.com` now",
    );
    expect(chipCompleteHttpUrls(fenced)).toBe(fenced);
    expect(chipCompleteHttpUrls("~~~\nhttps://example.com/a\n~~~\n")).toBe(
      "~~~\nhttps://example.com/a\n~~~\n",
    );
    expect(chipCompleteHttpUrls("```\nhttps://example.com")).toBe("```\nhttps://example.com");
    expect(chipCompleteHttpUrls("```\ncode\n```\nsee https://example.com/after")).toBe(
      `\`\`\`\ncode\n\`\`\`\nsee ${chip("https://example.com/after")}`,
    );
    expect(chipCompleteHttpUrls(indented)).toBe(indented);
    expect(chipCompleteHttpUrls("![shot](https://example.com/a.png)")).toBe(
      "![shot](https://example.com/a.png)",
    );
    expect(chipCompleteHttpUrls(reference)).toBe(reference);
  });

  test("keeps a paren that the bare-url rule strips inside an angle destination", () => {
    const href = `${HTTP_CHIP_HREF_PREFIX}https://en.wikipedia.org/wiki/Rust_(programming_language`;
    expect(chipCompleteHttpUrls("https://en.wikipedia.org/wiki/Rust_(programming_language)")).toBe(
      `[en.wikipedia.org](<${href}>))`,
    );
    expect(httpChipTarget(href)).toBe("https://en.wikipedia.org/wiki/Rust_(programming_language");
  });

  test("is stable when run again and opens the real url", () => {
    const once = chipCompleteHttpUrls("see https://example.com/docs");
    expect(chipCompleteHttpUrls(once)).toBe(once);
    expect(httpChipTarget(`${HTTP_CHIP_HREF_PREFIX}https://example.com/docs`)).toBe(
      "https://example.com/docs",
    );
    expect(httpChipTarget("https://example.com/docs")).toBeNull();
    expect(httpChipTarget(`${HTTP_CHIP_HREF_PREFIX}javascript:alert(1)`)).toBeNull();
  });

  test("answer and thinking chip; tool, plan, and permission markdown do not", () => {
    expect(read("answer-text.tsx")).toContain("chipHttpUrls");
    expect(read("thinking-block.tsx")).toContain("chipHttpUrls");
    expect(read("AgentChatMarkdown.tsx")).toContain("HTTP_CHIP_LINK_VARIANT");
    expect(read("AgentChatMarkdown.tsx")).toContain("httpChipTarget");
    for (const file of [
      "tool-body.tsx",
      "cards/plan-card.tsx",
      "AgentChatPermissionCard.tsx",
      "historic-permission.tsx",
    ]) {
      expect(read(file)).not.toContain("chipHttpUrls");
    }
  });
});

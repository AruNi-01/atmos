import { describe, expect, test } from "bun:test";
import {
  formatMdLiveSerializedMarkdown,
  stringifyMdLiveDetails,
} from "./markdown-stringify";

describe("formatMdLiveSerializedMarkdown", () => {
  test("drops standalone empty-paragraph br sentinels", () => {
    expect(
      formatMdLiveSerializedMarkdown("# Agent Hooks 设计\n\n<br />\n\n## 目标\n"),
    ).toBe("# Agent Hooks 设计\n\n## 目标\n");
  });

  test("turns empty table cells into empty cells instead of br", () => {
    const source = `| 状态 | 含义 |\n| --- | --- |\n| \`idle\` | <br /> |\n| <br /> | Agent 空闲 |\n`;
    expect(formatMdLiveSerializedMarkdown(source)).toBe(
      `| 状态 | 含义 |\n| --- | --- |\n| \`idle\` | |\n| | Agent 空闲 |\n`,
    );
  });

  test("drops br-only list items and expands one-dash delimiter rows", () => {
    expect(formatMdLiveSerializedMarkdown("- <br />\n")).toBe("- \n");
    expect(formatMdLiveSerializedMarkdown("| 状态 | 含义 |\n| - | - |\n| a | b |\n")).toBe(
      "| 状态 | 含义 |\n| --- | --- |\n| a | b |\n",
    );
  });

  test("strips empty inline-code placeholders", () => {
    expect(formatMdLiveSerializedMarkdown("hi `\u200B` there\n")).toBe("hi  there\n");
    expect(formatMdLiveSerializedMarkdown("`fo\u200Bo`\n")).toBe("`foo`\n");
  });

  test("does not rewrite br inside fenced code", () => {
    const source = "```html\n<br />\n```\n";
    expect(formatMdLiveSerializedMarkdown(source)).toBe(source);
  });
});

describe("stringifyMdLiveDetails", () => {
  test("escapes summary text so it cannot re-open html tags", () => {
    const markdown = stringifyMdLiveDetails(
      {
        type: "details",
        children: [{ type: "detailsSummary", value: "<script>x" }],
      },
      null,
      {
        containerPhrasing: (node) => (typeof node.value === "string" ? node.value : ""),
        containerFlow: () => "",
      },
      {},
    );
    expect(markdown).toContain("<summary>&lt;script&gt;x</summary>");
    expect(markdown).not.toContain("<script");
  });
});

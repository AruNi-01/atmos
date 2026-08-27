import { describe, expect, test } from "bun:test";
import { mdLivePlaceholderCopyKey } from "./placeholder";
import type { Node } from "@milkdown/kit/prose/model";

function node(name: string, attrs: Record<string, unknown> = {}): Node {
  return { type: { name }, attrs } as Node;
}

describe("mdLivePlaceholderCopyKey", () => {
  test("uses empty-line hint for a focused paragraph", () => {
    expect(mdLivePlaceholderCopyKey(node("paragraph"), null)).toBe("placeholderEmptyLine");
  });

  test("uses block names for headings, toggle, lists, quote, and code", () => {
    expect(mdLivePlaceholderCopyKey(node("heading", { level: 1 }), null)).toBe("slashHeading1");
    expect(mdLivePlaceholderCopyKey(node("heading", { level: 3 }), null)).toBe("slashHeading3");
    expect(mdLivePlaceholderCopyKey(node("details_summary"), null)).toBe("slashToggle");
    expect(mdLivePlaceholderCopyKey(node("code_block"), null)).toBe("slashCode");
    expect(mdLivePlaceholderCopyKey(node("paragraph"), node("blockquote"))).toBe("slashQuote");
    expect(mdLivePlaceholderCopyKey(node("paragraph"), node("list_item", { listType: "bullet" }))).toBe(
      "slashBulletList",
    );
    expect(mdLivePlaceholderCopyKey(node("paragraph"), node("list_item", { listType: "ordered" }))).toBe(
      "slashOrderedList",
    );
    expect(
      mdLivePlaceholderCopyKey(node("paragraph"), node("list_item", { taskMarker: " ", checked: false })),
    ).toBe("slashTaskList");
    expect(mdLivePlaceholderCopyKey(node("paragraph"), node("table_cell"))).toBe("slashTable");
  });
});

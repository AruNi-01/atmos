import { describe, expect, test } from "bun:test";
import { mdLivePlaceholderCopyKey, mdLivePlaceholderTravel } from "./placeholder";
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

describe("mdLivePlaceholderTravel", () => {
  test("points down when the caret moves down and scales heading into body text", () => {
    expect(mdLivePlaceholderTravel(40, 180, 32, 14)).toEqual({
      dir: 1,
      startScale: Math.min(2.4, 32 / 14),
    });
  });

  test("points up when the caret moves up and grows body text into a heading", () => {
    const travel = mdLivePlaceholderTravel(180, 40, 14, 32);
    expect(travel.dir).toBe(-1);
    expect(travel.startScale).toBeCloseTo(14 / 32);
  });

  test("stays in place when only the block type changes on the same line", () => {
    expect(mdLivePlaceholderTravel(80, 80.4, 14, 14).dir).toBe(0);
  });
});

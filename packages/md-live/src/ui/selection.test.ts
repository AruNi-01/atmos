import { describe, expect, test } from "bun:test";
import {
  mdLiveBlockKindId,
  mdLiveUnifyBlockKindId,
  shouldShowMdLiveSelectionToolbar,
} from "./selection";
import { mdLiveMarkdownHeadingLevelOf } from "./types";

describe("shouldShowMdLiveSelectionToolbar", () => {
  const ready = {
    pointerSelecting: false,
    selectionEmpty: false,
    selectedText: "hello",
    editable: true,
    editorFocused: true,
    tooltipFocused: false,
  };

  test("shows after a completed non-empty selection", () => {
    expect(shouldShowMdLiveSelectionToolbar(ready)).toBe(true);
  });

  test("hides while the pointer is still dragging a selection", () => {
    expect(shouldShowMdLiveSelectionToolbar({ ...ready, pointerSelecting: true })).toBe(false);
  });

  test("hides when the editor is unfocused and the toolbar is not focused", () => {
    expect(shouldShowMdLiveSelectionToolbar({ ...ready, editorFocused: false, tooltipFocused: false })).toBe(false);
  });
});

describe("mdLiveBlockKindId", () => {
  test("maps heading, code, quote, lists, and paragraph", () => {
    expect(mdLiveBlockKindId({ type: { name: "heading" }, attrs: { level: 2 } }, null)).toBe("h2");
    expect(mdLiveBlockKindId({ type: { name: "heading" }, attrs: { level: 5 } }, null)).toBe("h5");
    expect(mdLiveBlockKindId({ type: { name: "heading" }, attrs: { level: 6 } }, null)).toBe("h6");
    expect(mdLiveBlockKindId({ type: { name: "code_block" }, attrs: {} }, null)).toBe("code");
    expect(
      mdLiveBlockKindId(
        { type: { name: "paragraph" }, attrs: {} },
        { type: { name: "blockquote" }, attrs: {} },
      ),
    ).toBe("quote");
    expect(
      mdLiveBlockKindId(
        { type: { name: "paragraph" }, attrs: {} },
        { type: { name: "list_item" }, attrs: { listType: "bullet" } },
      ),
    ).toBe("ul");
    expect(
      mdLiveBlockKindId(
        { type: { name: "paragraph" }, attrs: {} },
        { type: { name: "list_item" }, attrs: { listType: "ordered" } },
      ),
    ).toBe("ol");
    expect(
      mdLiveBlockKindId(
        { type: { name: "paragraph" }, attrs: {} },
        { type: { name: "list_item" }, attrs: { taskMarker: " " } },
      ),
    ).toBe("todo");
    expect(mdLiveBlockKindId({ type: { name: "paragraph" }, attrs: {} }, null)).toBe("paragraph");
  });
});

describe("mdLiveMarkdownHeadingLevelOf", () => {
  test("accepts commonmark 1–6 and rejects slash-only extras", () => {
    expect(mdLiveMarkdownHeadingLevelOf(1)).toBe(1);
    expect(mdLiveMarkdownHeadingLevelOf(5)).toBe(5);
    expect(mdLiveMarkdownHeadingLevelOf(6)).toBe(6);
    expect(mdLiveMarkdownHeadingLevelOf(0)).toBeNull();
    expect(mdLiveMarkdownHeadingLevelOf(7)).toBeNull();
    expect(mdLiveMarkdownHeadingLevelOf("5")).toBe(5);
  });
});

describe("mdLiveUnifyBlockKindId", () => {
  test("keeps a uniform kind and drops mixed selections", () => {
    expect(mdLiveUnifyBlockKindId(["h2", "h2"])).toBe("h2");
    expect(mdLiveUnifyBlockKindId(["h2", "paragraph"])).toBeNull();
    expect(mdLiveUnifyBlockKindId([])).toBeNull();
  });
});

import { describe, expect, test } from "bun:test";
import { applyMdLiveEditOp, isMdLiveMutatingTool, splitMarkdownStreamChunks } from "./apply";
import { mdLivePopoverAnchorStyle } from "./anchor";

describe("md-live edit ops", () => {
  test("replace_selection only mutates the selected span", () => {
    const next = applyMdLiveEditOp(
      { markdown: "alpha bravo charlie", selectionStart: 6, selectionEnd: 11 },
      { type: "replace_selection", markdown: "BETA" },
    );
    expect(next).toBe("alpha BETA charlie");
  });

  test("insert writes at the cursor without touching the rest", () => {
    const next = applyMdLiveEditOp(
      { markdown: "hello world", selectionStart: 5, selectionEnd: 5 },
      { type: "insert", markdown: " there" },
    );
    expect(next).toBe("hello there world");
  });

  test("replace_document replaces the whole buffer", () => {
    const next = applyMdLiveEditOp(
      { markdown: "old", selectionStart: 0, selectionEnd: 3 },
      { type: "replace_document", markdown: "# New" },
    );
    expect(next).toBe("# New");
  });

  test("only explicit edit tools are mutating", () => {
    expect(isMdLiveMutatingTool("md_live_replace_selection")).toBe(true);
    expect(isMdLiveMutatingTool("md_live_insert")).toBe(true);
    expect(isMdLiveMutatingTool("md_live_replace_document")).toBe(true);
    expect(isMdLiveMutatingTool("md_live_get")).toBe(false);
    expect(isMdLiveMutatingTool("fs_write")).toBe(false);
    expect(isMdLiveMutatingTool("shell")).toBe(false);
  });

  test("stream chunks keep the full payload", () => {
    expect(splitMarkdownStreamChunks("abcdefgh", 3)).toEqual(["abc", "def", "gh"]);
    expect(splitMarkdownStreamChunks("")).toEqual([]);
  });
});

describe("md-live popover anchor", () => {
  test("anchors to the bottom-right of the selection", () => {
    const style = mdLivePopoverAnchorStyle(
      { left: 400, top: 80, right: 520, bottom: 110, width: 120, height: 30 },
      280,
      8,
      1280,
    );
    expect(style.top).toBe(118);
    expect(style.left).toBe(240);
  });

  test("clamps to the viewport instead of jumping off-screen", () => {
    const style = mdLivePopoverAnchorStyle(
      { left: 20, top: 40, right: 80, bottom: 70, width: 60, height: 30 },
      360,
      8,
      400,
    );
    expect(style.top).toBe(78);
    expect(style.left).toBe(8);
  });
});

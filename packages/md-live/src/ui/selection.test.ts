import { describe, expect, test } from "bun:test";
import { shouldShowMdLiveSelectionToolbar } from "./selection";

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

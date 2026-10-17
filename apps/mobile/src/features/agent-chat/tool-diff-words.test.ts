import { describe, expect, test } from "bun:test";
import {
  TOOL_DIFF_WORD_ADD_DARK,
  TOOL_DIFF_WORD_ADD_LIGHT,
  TOOL_DIFF_WORD_DEL_DARK,
  TOOL_DIFF_WORD_DEL_LIGHT,
  TOOL_DIFF_WORD_MAX,
  TOOL_DIFF_WORD_RADIUS,
  TOOL_DIFF_TAB_SIZE,
  toolDiffExpandTabs,
  toolDiffLineWordPieces,
  toolDiffVisiblePieces,
  toolDiffWordFill,
  toolDiffWordPieces,
} from "./tool-diff-words";

function changedText(pieces: { text: string; changed: boolean }[] | null | undefined): string {
  return (pieces ?? [])
    .filter((piece) => piece.changed)
    .map((piece) => piece.text)
    .join("");
}

describe("tool diff word marks", () => {
  test("marks the changed word and keeps the shared prefix", () => {
    const pieces = toolDiffWordPieces("hello world", "hello there");
    expect(pieces?.deletion.map((piece) => piece.text).join("")).toBe("hello world");
    expect(pieces?.addition.map((piece) => piece.text).join("")).toBe("hello there");
    expect(changedText(pieces?.deletion)).toBe("world");
    expect(changedText(pieces?.addition)).toBe("there");
    expect(pieces?.deletion[0]).toEqual({ text: "hello ", changed: false });
  });

  test("swallows a one-character unchanged token into the changed run", () => {
    const pieces = toolDiffWordPieces("a-b+c", "a+b-c");
    expect(pieces?.deletion.map((piece) => piece.text).join("")).toBe("a-b+c");
    expect(pieces?.addition.map((piece) => piece.text).join("")).toBe("a+b-c");
    expect(changedText(pieces?.deletion)).toBe("-b+");
    expect(changedText(pieces?.addition)).toBe("b-");
  });

  test("leaves a line longer than 1000 characters unmarked", () => {
    const long = "a".repeat(TOOL_DIFF_WORD_MAX + 1);
    expect(toolDiffWordPieces(long, `${long}b`)).toBeNull();
  });

  test("zips a change run by index and stops at context", () => {
    const pieces = toolDiffLineWordPieces([
      { op: "del", text: "hello world" },
      { op: "del", text: "only old" },
      { op: "add", text: "hello there" },
      { op: "ctx", text: "kept" },
      { op: "del", text: "tail" },
    ]);
    expect(changedText(pieces[0])).toBe("world");
    expect(pieces[1]).toBeNull();
    expect(changedText(pieces[2])).toBe("there");
    expect(pieces[3]).toBeNull();
    expect(pieces[4]).toBeNull();
  });

  test("expands tabs to Pierre's stop of 2 and carries the column across pieces", () => {
    expect(TOOL_DIFF_TAB_SIZE).toBe(2);
    expect(toolDiffExpandTabs("\tfoo").text).toBe("  foo");
    expect(toolDiffExpandTabs("a\tb").text).toBe("a b");
    expect(toolDiffExpandTabs("ab\tc").text).toBe("ab  c");
    expect(toolDiffExpandTabs("\t\t").text).toBe("    ");
    const visible = toolDiffVisiblePieces(
      [
        { text: "a\t", changed: false },
        { text: "b", changed: true },
      ],
      "a\tb",
    );
    expect(visible.map((piece) => piece.text)).toEqual(["a ", "b"]);
    expect(visible[1]?.changed).toBe(true);
    expect(toolDiffVisiblePieces(null, "")).toEqual([{ text: " ", changed: false }]);
    expect(toolDiffVisiblePieces(null, "keep").map((piece) => piece.text)).toEqual(["keep"]);
  });

  test("uses Pierre's emphasis alpha on the addition and deletion bases", () => {
    expect(toolDiffWordFill("add", false)).toBe(TOOL_DIFF_WORD_ADD_LIGHT);
    expect(toolDiffWordFill("add", true)).toBe(TOOL_DIFF_WORD_ADD_DARK);
    expect(toolDiffWordFill("del", false)).toBe(TOOL_DIFF_WORD_DEL_LIGHT);
    expect(toolDiffWordFill("del", true)).toBe(TOOL_DIFF_WORD_DEL_DARK);
    expect(TOOL_DIFF_WORD_ADD_LIGHT).toBe("rgba(7, 196, 128, 0.15)");
    expect(TOOL_DIFF_WORD_ADD_DARK).toBe("rgba(96, 209, 153, 0.2)");
    expect(TOOL_DIFF_WORD_DEL_LIGHT).toBe("rgba(255, 46, 63, 0.15)");
    expect(TOOL_DIFF_WORD_DEL_DARK).toBe("rgba(255, 103, 98, 0.2)");
    expect(TOOL_DIFF_WORD_RADIUS).toBe(3);
  });
});

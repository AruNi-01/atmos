import { describe, expect, test } from "bun:test";
import { ensureMarkdownExtension, joinWorktreePath } from "../md-live-save-as";

describe("md-live save as helpers", () => {
  test("joins directory and file name", () => {
    expect(joinWorktreePath("/repo", "Untitled.md")).toBe("/repo/Untitled.md");
    expect(joinWorktreePath("/repo/", "Untitled-1.md")).toBe("/repo/Untitled-1.md");
  });

  test("adds .md when omitted", () => {
    expect(ensureMarkdownExtension("notes")).toBe("notes.md");
    expect(ensureMarkdownExtension("Untitled.md")).toBe("Untitled.md");
  });
});

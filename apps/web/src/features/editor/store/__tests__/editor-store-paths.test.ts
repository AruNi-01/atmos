import { describe, expect, test } from "bun:test";
import {
  getEditorDisplayPath,
  getEditorSourcePath,
  getFileNameFromPath,
} from "@/features/editor/store/editor-store-paths";

describe("getEditorDisplayPath", () => {
  test("strips the untitled scheme for tab tooltips", () => {
    expect(getEditorDisplayPath("untitled:Untitled.md")).toBe("Untitled.md");
    expect(getEditorDisplayPath("untitled:Untitled 2.md")).toBe("Untitled 2.md");
    expect(getFileNameFromPath("untitled:Untitled.md")).toBe("Untitled.md");
  });

  test("keeps real paths and still unwraps editor schemes", () => {
    expect(getEditorDisplayPath("/repo/src/a.ts")).toBe("/repo/src/a.ts");
    expect(getEditorDisplayPath("review-diff://abc/src/a.ts")).toBe("src/a.ts");
    expect(getEditorSourcePath("untitled:Untitled.md")).toBe("untitled:Untitled.md");
  });
});

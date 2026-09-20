import { describe, expect, test } from "bun:test";
import { nextUntitledMarkdownName } from "./untitled";

describe("nextUntitledMarkdownName", () => {
  test("uses Untitled.md when free", () => {
    expect(nextUntitledMarkdownName(["README.md"])).toBe("Untitled.md");
  });

  test("increments Untitled-1 then Untitled-2 on collision", () => {
    expect(nextUntitledMarkdownName(["Untitled.md"])).toBe("Untitled-1.md");
    expect(nextUntitledMarkdownName(["Untitled.md", "Untitled-1.md"])).toBe("Untitled-2.md");
  });
});

// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { createInlineDiff } from "./diff";

describe("createInlineDiff", () => {
  test("marks modified lines with stable old and new line numbers", () => {
    const lines = createInlineDiff("alpha\nbeta\ngamma", "alpha\nbeta changed\ngamma\nomega");

    expect(lines).toEqual([
      { kind: "context", content: "alpha", oldLineNumber: 1, newLineNumber: 1 },
      { kind: "removed", content: "beta", oldLineNumber: 2 },
      { kind: "added", content: "beta changed", newLineNumber: 2 },
      { kind: "context", content: "gamma", oldLineNumber: 3, newLineNumber: 3 },
      { kind: "added", content: "omega", newLineNumber: 4 },
    ]);
  });

  test("keeps inserted blocks readable between unchanged context lines", () => {
    const lines = createInlineDiff("one\nfour", "one\ntwo\nthree\nfour");

    expect(lines.map((line) => line.kind)).toEqual(["context", "added", "added", "context"]);
    expect(lines.map((line) => line.content)).toEqual(["one", "two", "three", "four"]);
    expect(lines[1]?.newLineNumber).toBe(2);
    expect(lines[2]?.newLineNumber).toBe(3);
  });
});

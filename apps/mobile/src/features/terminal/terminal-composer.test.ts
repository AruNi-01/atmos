// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { terminalComposerInput } from "./terminal-composer";

describe("terminal composer input", () => {
  test("submits a trimmed line and ignores blank text", () => {
    expect(terminalComposerInput("  ls -la  ")).toBe("ls -la\r");
    expect(terminalComposerInput(" \n ")).toBeNull();
  });

  test("wraps multiline text as a bracketed paste and submits it", () => {
    expect(terminalComposerInput("first\nsecond")).toBe("\u001b[200~first\rsecond\u001b[201~\r");
  });
});

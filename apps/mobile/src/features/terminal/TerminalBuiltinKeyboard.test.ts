// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "TerminalBuiltinKeyboard.tsx"),
  "utf8",
);

describe("TerminalBuiltinKeyboard combo mode copy", () => {
  test("uses English Combo mode, not Chinese hardcodes", () => {
    expect(source).toContain('accessibilityLabel="Combo mode"');
    expect(source).toContain("Combo mode");
    expect(source).not.toContain("组合键模式");
  });
});

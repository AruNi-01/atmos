// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "expo-ui-button-modifiers.ts"),
  "utf8",
);

describe("expo UI stretch frame", () => {
  test("maxWidth survives JSON unlike Number.POSITIVE_INFINITY", () => {
    expect(JSON.stringify({ maxWidth: Number.POSITIVE_INFINITY })).toBe('{"maxWidth":null}');
    expect(JSON.parse(JSON.stringify({ maxWidth: 1_000_000 }))).toEqual({ maxWidth: 1_000_000 });
    expect(source).toContain("export const EXPO_UI_FRAME_INFINITY = 1_000_000");
    expect(source).toContain("maxWidth: EXPO_UI_FRAME_INFINITY");
    expect(source).not.toContain("maxWidth: Number.POSITIVE_INFINITY");
  });
});

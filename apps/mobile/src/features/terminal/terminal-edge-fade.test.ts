// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { shortcutEdgeFade, TERMINAL_SHORTCUT_BAR_COLOR } from "./terminal-edge-fade";

describe("shortcut edge fade", () => {
  test("fades both edges from the bar color into transparent", () => {
    const left = shortcutEdgeFade("left");
    const right = shortcutEdgeFade("right");

    expect(TERMINAL_SHORTCUT_BAR_COLOR).toBe("#2c2c2e");
    expect(left).toBe("linear-gradient(to right, #2c2c2e 0%, rgba(44, 44, 46, 0) 100%)");
    expect(right).toBe("linear-gradient(to left, #2c2c2e 0%, rgba(44, 44, 46, 0) 100%)");
    expect(left).not.toContain("#09090b");
    expect(right).not.toContain("#09090b");
  });
});

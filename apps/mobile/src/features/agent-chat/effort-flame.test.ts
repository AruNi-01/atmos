// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { createEffortFlame } from "./effort-flame";

describe("createEffortFlame", () => {
  test("paints a full frame without throwing", () => {
    const flame = createEffortFlame(48, 16);
    const frame = flame.paint(0.4, 0.016, false);
    expect(frame.length).toBe(48 * 16 * 4);
    expect(frame[3]).toBe(255);
  });
});

// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { userMetaHeightMotion, userMetaItemMotion } from "./user-message-meta";

describe("user message meta motion", () => {
  test("opens the clip immediately and closes it after the css delay", () => {
    expect(userMetaHeightMotion(true)).toEqual({ delay: 0, duration: 280 });
    expect(userMetaHeightMotion(false)).toEqual({ delay: 50, duration: 200 });
  });

  test("staggers the open items and drops the stagger on close", () => {
    expect(userMetaItemMotion(true, 0)).toEqual({ delay: 30, opacityMs: 220, translateMs: 280 });
    expect(userMetaItemMotion(true, 1)).toEqual({ delay: 70, opacityMs: 220, translateMs: 280 });
    expect(userMetaItemMotion(false, 0)).toEqual({ delay: 0, opacityMs: 140, translateMs: 180 });
    expect(userMetaItemMotion(false, 1)).toEqual({ delay: 0, opacityMs: 140, translateMs: 180 });
  });
});

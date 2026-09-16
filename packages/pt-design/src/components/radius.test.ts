import { describe, expect, test } from "bun:test";
import {
  parseRadiusToken,
  PT_RADIUS_DEFAULT,
  radiusChoiceOf,
  radiusHandlePx,
  radiusHandleRoundness,
  radiusInnerPx,
  resolveRadiusChoice,
} from "./radius";

describe("radius tokens", () => {
  test("small matches the current sketch handle and inner chrome", () => {
    expect(PT_RADIUS_DEFAULT).toBe("sm");
    expect(radiusInnerPx("sm")).toBe(3);
    expect(radiusHandlePx("sm")).toBe(12);
    expect(radiusHandleRoundness("sm")).toEqual({ type: 3, value: 12 });
    expect(radiusInnerPx("none")).toBe(0);
    expect(radiusHandlePx("none")).toBe(0);
  });

  test("missing or default follows the global token", () => {
    expect(radiusChoiceOf(undefined)).toBe("default");
    expect(radiusChoiceOf("huge")).toBe("default");
    expect(resolveRadiusChoice(undefined, "lg")).toBe("lg");
    expect(resolveRadiusChoice("default", "md")).toBe("md");
    expect(resolveRadiusChoice("none", "lg")).toBe("none");
    expect(parseRadiusToken("md")).toBe("md");
    expect(parseRadiusToken("nope")).toBe("sm");
  });
});

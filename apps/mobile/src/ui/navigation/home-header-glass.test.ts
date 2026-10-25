// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { darkColors, lightColors } from "@/theme/colors";
import { isOpaqueGlassTint } from "./home-header-glass";

describe("header glass tint", () => {
  test("treats the dark label as a glass fill and keeps the light label", () => {
    expect(isOpaqueGlassTint(darkColors.label)).toBe(true);
    expect(isOpaqueGlassTint(lightColors.label)).toBe(false);
  });

  test("does not treat secondary ink or an unknown color as a glass fill", () => {
    expect(isOpaqueGlassTint(darkColors.secondaryLabel)).toBe(false);
    expect(isOpaqueGlassTint(lightColors.secondaryLabel)).toBe(false);
    expect(isOpaqueGlassTint("label")).toBe(false);
  });
});

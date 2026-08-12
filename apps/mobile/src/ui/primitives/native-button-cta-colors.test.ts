// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { darkColors, lightColors } from "@/theme/colors";
import { getNativeButtonCtaColors } from "@/ui/primitives/native-button-cta-colors";

describe("mobile CTA button colors", () => {
  test("uses dark fill with light label in both color schemes", () => {
    for (const colors of [lightColors, darkColors]) {
      const cta = getNativeButtonCtaColors("default", colors);
      expect(cta.background).toBe(colors.ctaFill);
      expect(cta.text).toBe(colors.ctaLabel);
      expect(cta.background).not.toBe(cta.text);
    }
  });

  test("swaps CTA colors for inverse tone", () => {
    const cta = getNativeButtonCtaColors("inverse", darkColors);
    expect(cta.background).toBe(darkColors.ctaLabel);
    expect(cta.text).toBe(darkColors.ctaFill);
  });
});

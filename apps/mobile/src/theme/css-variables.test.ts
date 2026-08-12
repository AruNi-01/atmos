// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { lightColors } from "./colors";
import {
  getMobileColorCssVariables,
  getMobileCssVariables,
  mobileColorKeyToCssVar,
  mobileLightCssVariables,
} from "./css-variables";

describe("mobile css variables", () => {
  test("maps every color token to a css variable", () => {
    const cssVars = getMobileColorCssVariables(lightColors);

    for (const [key, value] of Object.entries(lightColors)) {
      expect(cssVars[mobileColorKeyToCssVar(key as keyof typeof lightColors)]).toBe(value);
    }
  });

  test("light defaults match colors.ts", () => {
    for (const [key, value] of Object.entries(lightColors)) {
      expect(mobileLightCssVariables[mobileColorKeyToCssVar(key as keyof typeof lightColors)]).toBe(value);
    }
  });

  test("dark scheme overrides color variables only", () => {
    const darkVars = getMobileCssVariables("dark");
    expect(darkVars["--color-background"]).toBe("#000000");
    expect(darkVars["--spacing-screen-x"]).toBe("18px");
  });
});

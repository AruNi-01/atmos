// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { lightColors } from "./colors";
import {
  getMobileColorCssVariables,
  getMobileCssVariables,
  getMobileLayoutCssVariables,
  mobileColorKeyToCssVar,
  mobileLightCssVariables,
} from "./css-variables";
import { mobileGeneratedThemeSnapshot } from "./generated-theme.snapshot";

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

  test("layout css variables match spacing, radii, typography, and pressed tokens", () => {
    const layoutVars = getMobileLayoutCssVariables();
    expect(layoutVars["--spacing-screen-x"]).toBe("18px");
    expect(layoutVars["--radius-card"]).toBe("24px");
    expect(layoutVars["--font-size-body"]).toBe("14px");
    expect(layoutVars["--font-size-hero-title"]).toBe("28px");
    expect(layoutVars["--font-size-hero-subtitle"]).toBe("16px");
    expect(layoutVars["--font-size-body-small"]).toBe("13px");
    expect(layoutVars["--font-size-mono-code"]).toBe("12px");
    expect(layoutVars["--letter-spacing-hero-title"]).toBe("-0.4px");
    expect(layoutVars["--opacity-pressed-control"]).toBe("0.72");
  });

  test("generated theme snapshot matches getMobileCssVariables(light)", () => {
    expect(mobileGeneratedThemeSnapshot).toEqual(getMobileCssVariables("light"));
  });
});

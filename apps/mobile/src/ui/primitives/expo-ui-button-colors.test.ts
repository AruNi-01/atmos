// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { darkColors, lightColors } from "@/theme/colors";
import { resolveExpoUiButtonColors } from "@/ui/primitives/expo-ui-button-colors";

describe("resolveExpoUiButtonColors", () => {
  it("uses ctaFill/ctaLabel for filled default", () => {
    for (const colors of [lightColors, darkColors]) {
      const resolved = resolveExpoUiButtonColors({
        colors,
        disabled: false,
        tone: "default",
        variant: "filled",
      });
      expect(resolved.backgroundColor).toBe(colors.ctaFill);
      expect(resolved.labelColor).toBe(colors.ctaLabel);
      expect(resolved.seedColor).toBe(colors.ctaFill);
      expect(resolved.borderWidth).toBe(0);
    }
  });

  it("uses controlBorder + label for outlined default", () => {
    const resolved = resolveExpoUiButtonColors({
      colors: lightColors,
      disabled: false,
      tone: "default",
      variant: "outlined",
    });
    expect(resolved.backgroundColor).toBe(lightColors.control);
    expect(resolved.borderColor).toBe(lightColors.controlBorder);
    expect(resolved.labelColor).toBe(lightColors.label);
    expect(resolved.seedColor).toBe(lightColors.label);
    expect(resolved.borderWidth).toBe(1);
  });

  it("uses red tokens for danger tone", () => {
    const resolved = resolveExpoUiButtonColors({
      colors: darkColors,
      disabled: false,
      tone: "danger",
      variant: "outlined",
    });
    expect(resolved.backgroundColor).toBe(darkColors.redSurface);
    expect(resolved.borderColor).toBe(darkColors.redBorder);
    expect(resolved.labelColor).toBe(darkColors.red);
    expect(resolved.seedColor).toBe(darkColors.red);
  });

  it("softens colors when disabled", () => {
    const filled = resolveExpoUiButtonColors({
      colors: lightColors,
      disabled: true,
      tone: "default",
      variant: "filled",
    });
    expect(filled.backgroundColor).toBe(lightColors.controlDisabled);
    expect(filled.labelColor).toBe(lightColors.tertiaryLabel);
    expect(filled.seedColor).toBe(lightColors.tertiaryLabel);

    const outlined = resolveExpoUiButtonColors({
      colors: lightColors,
      disabled: true,
      tone: "danger",
      variant: "outlined",
    });
    expect(outlined.labelColor).toBe(lightColors.tertiaryLabel);
    expect(outlined.borderWidth).toBe(1);
  });
});

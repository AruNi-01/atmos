// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { lightColors } from "@/theme/colors";
import {
  expoUiDangerStyle,
  expoUiPrimaryStyle,
  expoUiSecondaryStyle,
} from "./expo-ui-button-styles";

describe("expoUi button styles (pure Expo UI)", () => {
  it("primary is filled + cta seed, size only", () => {
    const look = expoUiPrimaryStyle(lightColors);
    expect(look.variant).toBe("filled");
    expect(look.seedColor).toBe(lightColors.ctaFill);
    expect(look.style).toEqual({ height: 52 });
    expect(look.style.backgroundColor).toBeUndefined();
    expect(look.style.borderWidth).toBeUndefined();
  });

  it("secondary is outlined + label seed (native chrome)", () => {
    const look = expoUiSecondaryStyle(lightColors);
    expect(look.variant).toBe("outlined");
    expect(look.seedColor).toBe(lightColors.label);
    expect(look.style).toEqual({ height: 52 });
  });

  it("danger is outlined + red seed", () => {
    const look = expoUiDangerStyle(lightColors);
    expect(look.variant).toBe("outlined");
    expect(look.seedColor).toBe(lightColors.red);
  });

  it("disabled only dims seedColor", () => {
    expect(expoUiPrimaryStyle(lightColors, true).seedColor).toBe(
      lightColors.tertiaryLabel,
    );
    expect(expoUiSecondaryStyle(lightColors, true).variant).toBe("outlined");
  });
});

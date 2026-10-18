// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const captured: Array<{ label?: string; modifiers?: unknown; onPress?: unknown }> = [];
const platform = { OS: "ios" };

mock.module("react-native", () => ({
  AccessibilityInfo: {
    addEventListener: () => ({ remove: () => undefined }),
  },
  Platform: platform,
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));

mock.module("@/theme/theme-store", () => ({
  useMobileTheme: () => ({
    colorScheme: "light",
    colors: {
      label: "#111111",
      red: "#ff3b30",
      tertiaryLabel: "#8e8e93",
    },
  }),
}));

mock.module("expo-glass-effect", () => ({
  isGlassEffectAPIAvailable: () => true,
  isLiquidGlassAvailable: () => true,
}));

mock.module("@expo/ui/swift-ui/modifiers", () => ({
  buttonStyle: (style: string) => ({ type: "buttonStyle", style }),
  controlSize: (size: string) => ({ type: "controlSize", size }),
  disabled: (value: boolean) => ({ type: "disabled", value }),
  font: (params: unknown) => ({ type: "font", params }),
  glassEffect: (params: unknown) => ({ type: "glassEffect", params }),
  opacity: (value: number) => ({ type: "opacity", value }),
  padding: (params: unknown) => ({ type: "padding", params }),
}));

mock.module("@expo/ui/swift-ui", () => ({
  Host: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-host": "" }, children),
  HStack: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-hstack": "" }, children),
  Button: (props: { label?: string; modifiers?: unknown; onPress?: unknown }) => {
    captured.push(props);
    return createElement("button", { type: "button" }, props.label);
  },
}));

mock.module("@expo/ui", () => ({
  Host: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Button: (props: { label?: string }) => createElement("button", { type: "button" }, props.label),
}));

const {
  GLASS_CHIP_DISABLED_OPACITY,
  GLASS_CHIP_FONT_SIZE,
  GLASS_CHIP_PADDING,
  GlassActionButtons,
  GlassTextButton,
  iosGlassChipModifiers,
} = await import("../../ui/primitives/glass-action-buttons");

describe("iosGlassChipModifiers", () => {
  test("liquid glass chips are mini, padded like the old fill, and only slightly dim when disabled", () => {
    const enabled = iosGlassChipModifiers({ isDisabled: false, useLiquidGlass: true });
    const disabledChip = iosGlassChipModifiers({ isDisabled: true, useLiquidGlass: true });
    expect(enabled).toContainEqual({ type: "buttonStyle", style: "plain" });
    expect(enabled).toContainEqual({ type: "controlSize", size: "mini" });
    expect(enabled).toContainEqual({ type: "padding", params: GLASS_CHIP_PADDING });
    expect(enabled).toContainEqual({
      type: "glassEffect",
      params: { glass: { interactive: true, variant: "regular" }, shape: "capsule" },
    });
    expect(enabled).toContainEqual({
      type: "font",
      params: { size: GLASS_CHIP_FONT_SIZE, weight: "semibold" },
    });
    expect(enabled).toContainEqual({ type: "opacity", value: 1 });
    expect(disabledChip).toContainEqual({ type: "opacity", value: GLASS_CHIP_DISABLED_OPACITY });
    expect(GLASS_CHIP_DISABLED_OPACITY).toBeGreaterThan(0.4);
    expect(GLASS_CHIP_DISABLED_OPACITY).toBeLessThan(0.7);
    expect(GLASS_CHIP_PADDING).toEqual({ horizontal: 12, vertical: 8 });
  });

  test("Reduce Transparency uses bordered, not glassEffect", () => {
    const fallback = iosGlassChipModifiers({ isDisabled: false, useLiquidGlass: false });
    expect(fallback).toContainEqual({ type: "buttonStyle", style: "bordered" });
    expect(fallback.some((item) => item.type === "glassEffect")).toBe(false);
  });
});

describe("GlassTextButton render", () => {
  test("renders the iOS chip with disabled=true without throwing (prop must not shadow modifiers)", () => {
    platform.OS = "ios";
    captured.length = 0;
    const html = renderToStaticMarkup(
      createElement(GlassTextButton, {
        disabled: true,
        label: "Move down",
        onPress: () => undefined,
      }),
    );
    expect(html).toContain("Move down");
    expect(captured).toHaveLength(1);
    expect(captured[0]?.onPress).toBeUndefined();
    const modifiers = captured[0]?.modifiers as Array<{ type: string; value?: number }>;
    expect(modifiers.some((item) => item.type === "disabled")).toBe(false);
    expect(modifiers).toContainEqual({ type: "opacity", value: GLASS_CHIP_DISABLED_OPACITY });
    expect(modifiers).toContainEqual({ type: "buttonStyle", style: "plain" });
  });

  test("GlassActionButtons still calls the disabled modifier, not a shadowed prop", () => {
    platform.OS = "ios";
    captured.length = 0;
    const html = renderToStaticMarkup(
      createElement(GlassActionButtons, {
        actions: [
          { disabled: true, label: "Turn off", onPress: () => undefined },
          { label: "Publish", onPress: () => undefined },
        ],
      }),
    );
    expect(html).toContain("Turn off");
    expect(html).toContain("Publish");
    expect(captured).toHaveLength(2);
    expect(captured[0]?.modifiers).toContainEqual({ type: "disabled", value: true });
    expect(captured[1]?.modifiers).toContainEqual({ type: "disabled", value: false });
  });
});

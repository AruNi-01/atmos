// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom server types are not installed for the mobile app
import { renderToStaticMarkup } from "react-dom/server";
import "@/test-support/mobile-render-mock";

const captured: Array<{
  label?: string;
  modifiers?: unknown;
  onPress?: unknown;
  role?: string;
}> = [];

mock.module("expo-glass-effect", () => ({
  isGlassEffectAPIAvailable: () => true,
  isLiquidGlassAvailable: () => true,
}));

mock.module("@expo/ui/swift-ui/modifiers", () => ({
  background: (color: string, shape?: unknown) => ({ type: "background", color, shape }),
  buttonStyle: (style: string) => ({ type: "buttonStyle", style }),
  controlSize: (size: string) => ({ type: "controlSize", size }),
  disabled: (value: boolean) => ({ type: "disabled", value }),
  font: (params: unknown) => ({ type: "font", params }),
  foregroundStyle: (style: string) => ({ type: "foregroundStyle", style }),
  glassEffect: (params: unknown) => ({ type: "glassEffect", params }),
  opacity: (value: number) => ({ type: "opacity", value }),
  padding: (params: unknown) => ({ type: "padding", params }),
  shapes: { capsule: () => ({ shape: "capsule" }) },
  tint: (color: string) => ({ type: "tint", color }),
}));

mock.module("@expo/ui/swift-ui", () => ({
  Host: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-host": "" }, children),
  HStack: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-hstack": "" }, children),
  Button: (props: { label?: string; modifiers?: unknown; onPress?: unknown; role?: string }) => {
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
  GLASS_CHIP_HEIGHT,
  GLASS_CHIP_HOST_STYLE,
  GLASS_CHIP_PADDING,
  GlassActionButtons,
  GlassTextButton,
  iosGlassChipModifiers,
} = await import("../../ui/primitives/glass-action-buttons");

describe("iosGlassChipModifiers", () => {
  test("liquid glass chips are mini, padded like the old fill, and only slightly dim when disabled", () => {
    const enabled = iosGlassChipModifiers({
      fillColor: "#f8f8f9",
      inkColor: "#111111",
      isDisabled: false,
      useLiquidGlass: true,
    });
    const disabledChip = iosGlassChipModifiers({
      fillColor: "#f8f8f9",
      inkColor: "#111111",
      isDisabled: true,
      useLiquidGlass: true,
    });
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
    expect(GLASS_CHIP_HEIGHT).toBe(33);
    expect(GLASS_CHIP_HOST_STYLE).toEqual({
      height: 33,
      justifyContent: "center",
    });
    expect("marginTop" in GLASS_CHIP_HOST_STYLE).toBe(false);
    expect("marginBottom" in GLASS_CHIP_HOST_STYLE).toBe(false);
  });

  test("ghost chips use medium weight and muted ink", () => {
    const ghost = iosGlassChipModifiers({
      fillColor: "#f8f8f9",
      inkColor: "#52525b",
      isDisabled: false,
      isGhost: true,
      useLiquidGlass: true,
    });
    expect(ghost).toContainEqual({
      type: "font",
      params: { size: GLASS_CHIP_FONT_SIZE, weight: "medium" },
    });
    expect(ghost).toContainEqual({ type: "foregroundStyle", style: "#52525b" });
    expect(ghost).toContainEqual({
      type: "glassEffect",
      params: { glass: { interactive: true, variant: "regular" }, shape: "capsule" },
    });
  });

  test("Reduce Transparency uses neutral fill and label ink, not system bordered tint", () => {
    const fallback = iosGlassChipModifiers({
      fillColor: "#f8f8f9",
      inkColor: "#111111",
      isDisabled: false,
      useLiquidGlass: false,
    });
    expect(fallback).toContainEqual({ type: "buttonStyle", style: "plain" });
    expect(fallback).not.toContainEqual({ type: "buttonStyle", style: "bordered" });
    expect(fallback).toContainEqual({ type: "foregroundStyle", style: "#111111" });
    expect(fallback).toContainEqual({ type: "tint", color: "#111111" });
    expect(fallback).toContainEqual({
      type: "background",
      color: "#f8f8f9",
      shape: { shape: "capsule" },
    });
    expect(fallback.some((item) => item.type === "glassEffect")).toBe(false);
  });

  test("Delete fallback keeps semantic red ink on a neutral capsule", () => {
    const fallback = iosGlassChipModifiers({
      fillColor: "#f8f8f9",
      inkColor: "#ff3b30",
      isDisabled: false,
      useLiquidGlass: false,
    });
    expect(fallback).toContainEqual({ type: "foregroundStyle", style: "#ff3b30" });
    expect(fallback).toContainEqual({ type: "tint", color: "#ff3b30" });
    expect(fallback).toContainEqual({
      type: "background",
      color: "#f8f8f9",
      shape: { shape: "capsule" },
    });
  });
});

describe("GlassTextButton render", () => {
  test("renders the iOS chip with disabled=true without throwing (prop must not shadow modifiers)", () => {
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
    expect(html).toContain("data-disabled");
  });

  test("iOS chips pass the role prop through to the Button", () => {
    captured.length = 0;
    renderToStaticMarkup(
      createElement(GlassTextButton, {
        disabled: true,
        label: "Allow",
        onPress: () => undefined,
        role: "destructive",
      }),
    );
    expect(captured[0]).toMatchObject({ label: "Allow" });
    expect((captured[0] as { role?: string }).role).toBe("destructive");
  });

  test("iOS chips default role to default when omitted", () => {
    captured.length = 0;
    const html = renderToStaticMarkup(
      createElement(GlassTextButton, {
        disabled: true,
        label: "Allow",
        onPress: () => undefined,
      }),
    );
    expect((captured[0] as { role?: string }).role).toBe("default");
    expect(html).toContain("data-disabled");
  });

  test("GlassActionButtons still calls the disabled modifier, not a shadowed prop", () => {
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

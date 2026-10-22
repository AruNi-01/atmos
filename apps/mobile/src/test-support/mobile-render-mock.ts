// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { mock } from "bun:test";
import { createElement, type ReactNode } from "react";

/**
 * One React Native stand-in for every render test. `mock.module` keeps the
 * first registration for the whole process, so a smaller mock that happens to
 * load first drops `StyleSheet` or `AccessibilityInfo` for the files after it.
 */
export const mobileRenderColors = {
  card: "#ffffff",
  control: "#f8f8f9",
  green: "#16a34a",
  label: "#111111",
  red: "#ff3b30",
  secondaryLabel: "#52525b",
  sheetBackground: "#f8f8f9",
  tertiaryLabel: "#8e8e93",
};

function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  if (style && typeof style === "object") return style as Record<string, unknown>;
  return {};
}

mock.module("react-native", () => ({
  AccessibilityInfo: {
    addEventListener: () => ({ remove: () => undefined }),
    isReduceMotionEnabled: () => Promise.resolve(false),
    isReduceTransparencyEnabled: () => Promise.resolve(false),
  },
  Platform: { OS: "ios" },
  Pressable: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
    createElement(
      "button",
      { "data-bg": flatStyle(style).backgroundColor, type: "button" },
      children,
    ),
  StyleSheet: {
    absoluteFill: {},
    create: <T>(styles: T) => styles,
    hairlineWidth: 1,
  },
  Text: ({
    accessibilityLabel,
    children,
    style,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
    style?: unknown;
  }) =>
    createElement(
      "span",
      {
        "data-accessibility-label": accessibilityLabel,
        "data-color": flatStyle(style).color,
      },
      children,
    ),
  View: ({
    accessibilityLabel,
    accessibilityState,
    children,
    style,
    testID,
  }: {
    accessibilityLabel?: string;
    accessibilityState?: { disabled?: boolean };
    children?: ReactNode;
    style?: unknown;
    testID?: string;
  }) =>
    createElement(
      "div",
      {
        "aria-label": accessibilityLabel,
        "data-bg": flatStyle(style).backgroundColor,
        "data-disabled": accessibilityState?.disabled ? "true" : undefined,
        "data-testid": testID,
      },
      children,
    ),
}));

mock.module("@/theme/theme-store", () => ({
  useMobileTheme: () => ({
    colorScheme: "light",
    colors: mobileRenderColors,
    isDark: false,
  }),
}));

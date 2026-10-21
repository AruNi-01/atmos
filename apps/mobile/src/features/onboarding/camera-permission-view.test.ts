// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom server types are not installed for the mobile app
import { renderToStaticMarkup } from "react-dom/server";

const SHEET = "#f8f8f9";

function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  if (style && typeof style === "object") return style as Record<string, unknown>;
  return {};
}

mock.module("react-native", () => ({
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
  Text: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
    createElement("span", { "data-color": flatStyle(style).color }, children),
  View: ({
    accessibilityLabel,
    children,
    style,
    testID,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
    style?: unknown;
    testID?: string;
  }) =>
    createElement(
      "div",
      {
        "aria-label": accessibilityLabel,
        "data-bg": flatStyle(style).backgroundColor,
        "data-testid": testID,
      },
      children,
    ),
}));

mock.module("@/theme/theme-store", () => ({
  useMobileTheme: () => ({
    colors: {
      card: "#ffffff",
      label: "#111111",
      secondaryLabel: "#52525b",
      sheetBackground: SHEET,
    },
  }),
}));

const { CameraPermissionStateView } = await import("./CameraPermissionStateView");
const { PairScannerErrorBoundary, SignInCrashFallback } =
  await import("./PairScannerErrorBoundary");

function markup(node: ReactNode) {
  const html = renderToStaticMarkup(node);
  expect(html).not.toContain("#000000");
  expect(html).not.toContain("#0a0a0b");
  expect(html).toContain(`data-bg="${SHEET}"`);
  return html;
}

describe("CameraPermissionStateView", () => {
  test("loading, settings, and error stay on the sheet color", () => {
    const loading = markup(
      createElement(CameraPermissionStateView, { model: { kind: "loading" } }),
    );
    expect(loading).toContain("Checking camera");
    expect(loading).toContain('data-testid="camera-permission-state"');

    const settings = markup(
      createElement(CameraPermissionStateView, {
        model: { kind: "settings" },
        onOpenSettings: () => undefined,
      }),
    );
    expect(settings).toContain("Camera access is off");
    expect(settings).toContain("Open Settings");

    const error = markup(
      createElement(CameraPermissionStateView, {
        model: { kind: "error", message: "The camera could not be started." },
        onRetry: () => undefined,
      }),
    );
    expect(error).toContain("Camera unavailable");
    expect(error).toContain("The camera could not be started.");
    expect(error).toContain("Try again");
  });

  test("a render throw becomes the visible camera fallback", () => {
    const error = new Error("camera exploded");
    const state = PairScannerErrorBoundary.getDerivedStateFromError(error);
    const view = PairScannerErrorBoundary.prototype.render.call({
      props: { children: null },
      state,
    });
    const html = markup(view);
    expect(html).toContain("camera exploded");
    expect(html).toContain("Camera unavailable");
    expect(html).toContain("Try again");
  });

  test("the sign-in crash fallback fills the sheet", () => {
    const html = markup(createElement(SignInCrashFallback));
    expect(html).toContain("could not be opened");
    expect(html).toContain("Re-pair phone");
  });
});

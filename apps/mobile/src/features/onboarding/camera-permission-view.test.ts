// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom server types are not installed for the mobile app
import { renderToStaticMarkup } from "react-dom/server";
import { mobileRenderColors } from "@/test-support/mobile-render-mock";

const SHEET = mobileRenderColors.sheetBackground;

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
    expect(html).toContain("try again");
    expect(html).not.toContain("Re-pair phone");
  });
});

import { describe, expect, it } from "bun:test";
import {
  computeElevationCovers,
  expandRect,
  pointerModeForLayers,
  shouldElevate,
  shouldFallbackHideDuringEnsure,
  shouldSuspendDesktopNativePreview,
  shouldSuspendFromOcclusion,
} from "../elevation-policy";

describe("shouldElevate", () => {
  const base = {
    capability: true,
    nativePreviewPresent: true,
    modal: false,
    intersectsPreview: false,
  };

  it("never elevates without capability", () => {
    expect(
      shouldElevate("dialog", { ...base, capability: false, modal: true }),
    ).toBe(false);
  });

  it("never elevates without native preview", () => {
    expect(
      shouldElevate("dialog", {
        ...base,
        nativePreviewPresent: false,
        modal: true,
      }),
    ).toBe(false);
  });

  it("always elevates modal dialog/sheet/drawer when preview present", () => {
    expect(shouldElevate("dialog", { ...base, modal: true })).toBe(true);
    expect(shouldElevate("sheet", base)).toBe(true);
    expect(shouldElevate("drawer", base)).toBe(true);
  });

  it("elevates popover/tooltip only when intersecting", () => {
    expect(shouldElevate("popover", base)).toBe(false);
    expect(shouldElevate("tooltip", base)).toBe(false);
    expect(
      shouldElevate("popover", { ...base, intersectsPreview: true }),
    ).toBe(true);
    expect(
      shouldElevate("tooltip", { ...base, intersectsPreview: true }),
    ).toBe(true);
    expect(
      shouldElevate("hover-card", { ...base, intersectsPreview: true }),
    ).toBe(true);
  });
});

describe("shouldSuspendFromOcclusion", () => {
  it("suspends only when occluded and elevation does not cover", () => {
    expect(
      shouldSuspendFromOcclusion({ isOccluded: true, elevationCovers: false }),
    ).toBe(true);
    expect(
      shouldSuspendFromOcclusion({ isOccluded: true, elevationCovers: true }),
    ).toBe(false);
    expect(
      shouldSuspendFromOcclusion({ isOccluded: false, elevationCovers: false }),
    ).toBe(false);
  });
});

describe("computeElevationCovers", () => {
  it("requires capability, ready surface, layers, and no ensure failure", () => {
    expect(
      computeElevationCovers({
        capability: true,
        surfaceReady: true,
        ensureFailed: false,
        elevatedLayerCount: 1,
      }),
    ).toBe(true);
    expect(
      computeElevationCovers({
        capability: true,
        surfaceReady: true,
        ensureFailed: true,
        elevatedLayerCount: 1,
      }),
    ).toBe(false);
    expect(
      computeElevationCovers({
        capability: true,
        surfaceReady: false,
        ensureFailed: false,
        elevatedLayerCount: 1,
      }),
    ).toBe(false);
    expect(
      computeElevationCovers({
        capability: true,
        surfaceReady: true,
        ensureFailed: false,
        elevatedLayerCount: 0,
      }),
    ).toBe(false);
  });
});

describe("pointerModeForLayers", () => {
  it("capture when any modal layer", () => {
    expect(pointerModeForLayers([{ modal: false }, { modal: true }])).toBe(
      "capture",
    );
    expect(pointerModeForLayers([{ modal: false }])).toBe("pass-through");
  });
});

describe("shouldSuspendDesktopNativePreview (AC2/M3 elevatable chrome)", () => {
  const base = {
    isDesktopNative: true,
    isStandaloneHandoffOpen: false,
    isPreviewLoading: false,
    suspendFromOcclusion: false,
    elevationCovers: false,
    elevatableChromeOpen: false,
  };

  it("does not suspend for favorites/header/search when elevation covers", () => {
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        elevationCovers: true,
        elevatableChromeOpen: true,
      }),
    ).toBe(false);
  });

  it("suspends elevatable chrome when elevation does not cover (APP-029 fallback)", () => {
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        elevationCovers: false,
        elevatableChromeOpen: true,
      }),
    ).toBe(true);
  });

  it("still suspends for loading and standalone handoff even when elevation covers", () => {
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        elevationCovers: true,
        isPreviewLoading: true,
      }),
    ).toBe(true);
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        elevationCovers: true,
        isStandaloneHandoffOpen: true,
      }),
    ).toBe(true);
  });

  it("suspends from occlusion only when elevation does not cover", () => {
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        suspendFromOcclusion: true,
        elevationCovers: false,
      }),
    ).toBe(true);
    // suspendFromOcclusion is already false when elevation covers (composed upstream)
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        suspendFromOcclusion: false,
        elevationCovers: true,
      }),
    ).toBe(false);
  });
});

describe("expandRect / fallback budget", () => {
  it("expands rect by padding", () => {
    expect(expandRect({ x: 10, y: 20, width: 100, height: 50 }, 16)).toEqual({
      x: -6,
      y: 4,
      width: 132,
      height: 82,
    });
  });

  it("fallback hide after create budget while not ready and occluded", () => {
    expect(
      shouldFallbackHideDuringEnsure({
        ensureStartedAt: 1000,
        now: 1000 + 200,
        ready: false,
        createBudgetMs: 200,
        isOccluded: true,
      }),
    ).toBe(true);
    expect(
      shouldFallbackHideDuringEnsure({
        ensureStartedAt: 1000,
        now: 1100,
        ready: false,
        createBudgetMs: 200,
        isOccluded: true,
      }),
    ).toBe(false);
    expect(
      shouldFallbackHideDuringEnsure({
        ensureStartedAt: 1000,
        now: 2000,
        ready: true,
        createBudgetMs: 200,
        isOccluded: true,
      }),
    ).toBe(false);
  });
});

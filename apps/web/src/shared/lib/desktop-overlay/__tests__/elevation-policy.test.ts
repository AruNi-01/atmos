import { describe, expect, it } from "bun:test";
import {
  computeElevationHealthy,
  shouldSuspendDesktopNativePreview,
} from "../elevation-policy";

describe("computeElevationHealthy", () => {
  it("requires capability and ready surface without ensure failure", () => {
    expect(
      computeElevationHealthy({
        capability: true,
        surfaceReady: true,
        ensureFailed: false,
      }),
    ).toBe(true);
    expect(
      computeElevationHealthy({
        capability: false,
        surfaceReady: true,
        ensureFailed: false,
      }),
    ).toBe(false);
    expect(
      computeElevationHealthy({
        capability: true,
        surfaceReady: false,
        ensureFailed: false,
      }),
    ).toBe(false);
    expect(
      computeElevationHealthy({
        capability: true,
        surfaceReady: true,
        ensureFailed: true,
      }),
    ).toBe(false);
  });
});

describe("shouldSuspendDesktopNativePreview (AC2/M3)", () => {
  const base = {
    isDesktopNative: true,
    isStandaloneHandoffOpen: false,
    isPreviewLoading: false,
    hostOcclusion: false,
    elevatableChromeOpen: false,
    elevationHealthy: false,
  };

  it("never suspends non-desktop-native surfaces", () => {
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        isDesktopNative: false,
        hostOcclusion: true,
        elevatableChromeOpen: true,
      }),
    ).toBe(false);
  });

  it("does not suspend for favorites/header/search when elevation is healthy", () => {
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        elevationHealthy: true,
        elevatableChromeOpen: true,
      }),
    ).toBe(false);
  });

  it("suspends elevatable chrome when elevation is unhealthy (APP-029 fallback)", () => {
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        elevationHealthy: false,
        elevatableChromeOpen: true,
      }),
    ).toBe(true);
  });

  it("always suspends for host-document occlusion (never elevated)", () => {
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        hostOcclusion: true,
        elevationHealthy: true,
      }),
    ).toBe(true);
  });

  it("still suspends for loading and standalone handoff even when elevation is healthy", () => {
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        elevationHealthy: true,
        isPreviewLoading: true,
      }),
    ).toBe(true);
    expect(
      shouldSuspendDesktopNativePreview({
        ...base,
        elevationHealthy: true,
        isStandaloneHandoffOpen: true,
      }),
    ).toBe(true);
  });
});

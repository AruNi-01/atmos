import { beforeEach, describe, expect, it } from "bun:test";
import { useDesktopElevationStore } from "../elevation-store";

describe("nativePreviewSurface refcount (APP-052 AC4 / M5)", () => {
  beforeEach(() => {
    useDesktopElevationStore.setState({
      capability: false,
      nativePreviewPresent: false,
      nativePreviewSurfaceCount: 0,
      surfaceReady: false,
      ensureFailed: false,
      elevatedLayerCount: 0,
      portalContainer: null,
      pointerMode: "capture",
    });
  });

  it("stays present until last surface releases", () => {
    const s = useDesktopElevationStore.getState();
    s.acquireNativePreviewSurface();
    s.acquireNativePreviewSurface();
    expect(useDesktopElevationStore.getState().nativePreviewPresent).toBe(true);
    expect(useDesktopElevationStore.getState().nativePreviewSurfaceCount).toBe(
      2,
    );

    s.releaseNativePreviewSurface();
    expect(useDesktopElevationStore.getState().nativePreviewPresent).toBe(true);
    expect(useDesktopElevationStore.getState().nativePreviewSurfaceCount).toBe(
      1,
    );

    s.releaseNativePreviewSurface();
    expect(useDesktopElevationStore.getState().nativePreviewPresent).toBe(
      false,
    );
    expect(useDesktopElevationStore.getState().nativePreviewSurfaceCount).toBe(
      0,
    );
  });

  it("does not go negative on extra release", () => {
    useDesktopElevationStore.getState().releaseNativePreviewSurface();
    expect(useDesktopElevationStore.getState().nativePreviewSurfaceCount).toBe(
      0,
    );
    expect(useDesktopElevationStore.getState().nativePreviewPresent).toBe(
      false,
    );
  });

  it("resetElevationRuntime keeps surface refcount", () => {
    useDesktopElevationStore.getState().acquireNativePreviewSurface();
    useDesktopElevationStore.getState().setSurfaceReady(true);
    useDesktopElevationStore.getState().setElevatedLayerCount(2);
    useDesktopElevationStore.getState().resetElevationRuntime();
    expect(useDesktopElevationStore.getState().nativePreviewPresent).toBe(true);
    expect(useDesktopElevationStore.getState().nativePreviewSurfaceCount).toBe(
      1,
    );
    expect(useDesktopElevationStore.getState().surfaceReady).toBe(false);
    expect(useDesktopElevationStore.getState().elevatedLayerCount).toBe(0);
  });
});

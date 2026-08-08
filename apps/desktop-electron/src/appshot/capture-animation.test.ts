import { describe, expect, it } from "bun:test";
import {
  overlayFrameFromBounds,
  shouldPlayCaptureAnimation,
  OVERLAY_DURATION_MS,
  OVERLAY_PADDING,
} from "./capture-animation.ts";

describe("capture animation frame math", () => {
  it("keeps overlay duration short for snappy capture UX", () => {
    // Long full-window transparent composites feel laggy; keep under 600ms.
    expect(OVERLAY_DURATION_MS).toBeLessThanOrEqual(600);
  });

  it("expands bounds with padding for the overlay window", () => {
    const frame = overlayFrameFromBounds({
      x: 100,
      y: 200,
      width: 800,
      height: 600,
    });
    expect(frame).toEqual({
      x: 100 - OVERLAY_PADDING,
      y: 200 - OVERLAY_PADDING,
      width: 800 + OVERLAY_PADDING * 2,
      height: 600 + OVERLAY_PADDING * 2,
    });
  });

  it("supports multi-monitor negative origins", () => {
    const frame = overlayFrameFromBounds({
      x: -1200,
      y: 80,
      width: 1440,
      height: 900,
    });
    expect(frame).not.toBeNull();
    expect(frame!.x).toBe(-1200 - OVERLAY_PADDING);
  });

  it("rejects tiny windows", () => {
    expect(
      overlayFrameFromBounds({ x: 0, y: 0, width: 20, height: 20 }),
    ).toBeNull();
  });

  it("plays animation whenever bounds are usable (including Atmos self)", () => {
    const bounds = { x: 10, y: 10, width: 800, height: 600 };
    expect(
      shouldPlayCaptureAnimation({ appName: "Safari", bounds }),
    ).toBe(true);
    expect(
      shouldPlayCaptureAnimation({ appName: "Atmos", bounds }),
    ).toBe(true);
    expect(
      shouldPlayCaptureAnimation({ appName: "Electron", bounds }),
    ).toBe(true);
    expect(
      shouldPlayCaptureAnimation({ appName: "Safari", bounds: null }),
    ).toBe(false);
  });
});

// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it, mock } from "bun:test";

import {
  centerCameraOnPageBounds,
  fitZoomForPageBounds,
} from "../lib/canvas-shape-focus";

function makeEditor(screen = { width: 1000, height: 800 }) {
  const setCamera = mock((...args: unknown[]) => args);
  return {
    getViewportScreenBounds: () => ({ ...screen, x: 0, y: 0 }),
    setCamera: (...args: unknown[]) => setCamera(...args),
    _setCamera: setCamera,
  };
}

describe("fitZoomForPageBounds", () => {
  it("caps at 100% for small bounds", () => {
    const editor = makeEditor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const z = fitZoomForPageBounds(editor as any, { x: 0, y: 0, w: 100, h: 80 });
    expect(z).toBe(1);
  });

  it("zooms out when bounds are larger than the viewport", () => {
    const editor = makeEditor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const z = fitZoomForPageBounds(editor as any, { x: 0, y: 0, w: 2000, h: 100 });
    // avail width 1000 - 128 = 872
    expect(z).toBeCloseTo(872 / 2000, 5);
    expect(z).toBeLessThan(1);
  });
});

describe("centerCameraOnPageBounds", () => {
  it("centers and uses fitted zoom", () => {
    const editor = makeEditor();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    centerCameraOnPageBounds(editor as any, { x: 0, y: 0, w: 200, h: 100 });
    const [cam] = editor._setCamera.mock.calls[0] as [{ x: number; y: number; z: number }];
    expect(cam.z).toBe(1);
    expect(cam.x).toBeCloseTo(-(100 - 500));
    expect(cam.y).toBeCloseTo(-(50 - 400));
  });
});

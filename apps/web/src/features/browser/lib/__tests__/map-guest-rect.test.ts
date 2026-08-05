import { describe, expect, it } from "bun:test";
import { mapGuestPointToViewport, mapGuestRectToShellLocal } from "../map-guest-rect";

function fakeEl(box: {
  left: number;
  top: number;
  width: number;
  height: number;
  clientWidth?: number;
  clientHeight?: number;
}): HTMLElement {
  return {
    getBoundingClientRect: () =>
      ({
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        right: box.left + box.width,
        bottom: box.top + box.height,
        x: box.left,
        y: box.top,
        toJSON: () => ({}),
      }) as DOMRect,
    clientWidth: box.clientWidth ?? box.width,
    clientHeight: box.clientHeight ?? box.height,
  } as HTMLElement;
}

describe("mapGuestRect", () => {
  it("maps guest click into host viewport coords", () => {
    const frame = fakeEl({ left: 100, top: 50, width: 800, height: 600 });
    const point = mapGuestPointToViewport({ x: 200, y: 100 }, frame, {
      width: 800,
      height: 600,
    });
    expect(point.x).toBe(300);
    expect(point.y).toBe(150);
  });

  it("maps guest rect into shell-local coords for absolute pins", () => {
    const shell = fakeEl({ left: 80, top: 40, width: 820, height: 620 });
    const frame = fakeEl({ left: 100, top: 50, width: 800, height: 600 });
    const mapped = mapGuestRectToShellLocal(
      { x: 10, y: 20, width: 40, height: 30 },
      frame,
      shell,
      { width: 800, height: 600 },
    );
    // frame offset within shell (20,10) + guest (10,20)
    expect(mapped.x).toBeCloseTo(30);
    expect(mapped.y).toBeCloseTo(30);
    expect(mapped.width).toBeCloseTo(40);
    expect(mapped.height).toBeCloseTo(30);
  });
});

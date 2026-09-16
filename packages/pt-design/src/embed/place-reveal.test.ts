import { describe, expect, test } from "bun:test";
import {
  cameraToShowRect,
  elementsForPtIds,
  sceneRectToBoardBox,
  selectedIdsForElements,
  unionElementBounds,
} from "./place-reveal";

describe("place reveal", () => {
  test("unions element bounds", () => {
    expect(
      unionElementBounds([
        { x: 10, y: 20, width: 40, height: 10 },
        { x: 30, y: 8, width: 50, height: 40 },
      ]),
    ).toEqual({ x: 10, y: 8, w: 70, h: 40 });
    expect(unionElementBounds([])).toBeNull();
  });

  test("maps a scene rect onto the board overlay", () => {
    expect(
      sceneRectToBoardBox({ x: 100, y: 50, w: 80, h: 40 }, { scrollX: 20, scrollY: 10, zoom: { value: 2 } }, 6),
    ).toEqual({ left: 234, top: 114, width: 172, height: 92 });
  });

  test("selects live pt members only", () => {
    const elements = [
      { id: "a", customData: { pt: { id: "one" } } },
      { id: "b", customData: { pt: { id: "one" } }, isDeleted: true },
      { id: "c", customData: { pt: { id: "two" } } },
    ];
    const live = elementsForPtIds(elements, ["one"]);
    expect(live.map((el) => el.id)).toEqual(["a"]);
    expect(selectedIdsForElements(live)).toEqual({ a: true });
  });

  test("camera pans without changing zoom so the rect sits in the usable viewport", () => {
    const camera = cameraToShowRect(
      { x: 2000, y: 800, w: 120, h: 40 },
      { zoom: { value: 1 }, width: 1920, height: 1080 },
      { left: 24, top: 72, right: 376, bottom: 64 },
    );
    expect(camera.zoom).toEqual({ value: 1 });
    const usableW = 1920 - 24 - 376;
    const usableH = 1080 - 72 - 64;
    expect(camera.scrollX).toBe(24 + (usableW - 120) / 2 - 2000);
    expect(camera.scrollY).toBe(72 + (usableH - 40) / 2 - 800);
  });
});

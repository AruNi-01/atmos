import { describe, expect, test } from "bun:test";
import {
  elementsForInstances,
  frameIdFromToolData,
  instanceIdsFromToolData,
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
      sceneRectToBoardBox(
        { x: 100, y: 50, w: 80, h: 40 },
        { scrollX: 20, scrollY: 10, zoom: { value: 2 } },
        6,
      ),
    ).toEqual({ left: 234, top: 114, width: 172, height: 92 });
  });

  test("selects live instance members only", () => {
    const elements = [
      { id: "a", customData: { pt: { instanceId: "one" } } },
      { id: "b", customData: { pt: { instanceId: "one" } }, isDeleted: true },
      { id: "c", customData: { pt: { instanceId: "two" } } },
    ];
    const live = elementsForInstances(elements, ["one"]);
    expect(live.map((el) => el.id)).toEqual(["a"]);
    expect(selectedIdsForElements(live)).toEqual({ a: true });
  });

  test("pulls instance and frame ids out of tool payloads", () => {
    expect(instanceIdsFromToolData({ instanceId: "a", instanceIds: ["b", "c"] })).toEqual(["b", "c"]);
    expect(
      instanceIdsFromToolData({
        results: [
          { ok: true, data: { instanceId: "one" } },
          { ok: false, data: { instanceId: "nope" } },
          { ok: true, data: { instanceIds: ["two"] } },
        ],
      }),
    ).toEqual(["one", "two"]);
    expect(frameIdFromToolData({ frameId: "frame-1" })).toBe("frame-1");
    expect(
      frameIdFromToolData({
        results: [
          { ok: true, data: { frameId: "first" } },
          { ok: true, data: { frameId: "last" } },
        ],
      }),
    ).toBe("last");
  });
});

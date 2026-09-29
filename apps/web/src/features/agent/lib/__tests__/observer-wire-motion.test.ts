// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  OBSERVER_WIRE_MS,
  beginObserverWireMotion,
  observerWireEase,
  observerWirePath,
  sampleObserverWireMotion,
} from "@/features/agent/lib/observer-wire-motion";

describe("observer wires", () => {
  it("draws a horizontal cubic between the card caps", () => {
    expect(observerWirePath(0, 10, 80, 40)).toBe("M0 10 C40 10 40 40 80 40");
  });

  it("eases out of the wire curve", () => {
    expect(observerWireEase(0)).toBe(0);
    expect(observerWireEase(1)).toBe(1);
    const mid = observerWireEase(0.5);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
  });

  it("snaps the first measurement, then glides height and position together", () => {
    const estimated = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 0, y: 160 }],
    ]);
    const first = beginObserverWireMotion({
      current: { positions: estimated, heights: new Map() },
      targets: new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 0, y: 200 }],
      ]),
      heights: new Map([
        ["a", 180],
        ["b", 120],
      ]),
      reduced: false,
      now: 0,
    });
    expect(first.duration).toBe(0);

    const settled = sampleObserverWireMotion(first, 0).baseline;
    const grown = beginObserverWireMotion({
      current: settled,
      targets: new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 0, y: 240 }],
      ]),
      heights: new Map([
        ["a", 260],
        ["b", 120],
      ]),
      reduced: false,
      now: 50,
    });
    expect(grown.duration).toBe(OBSERVER_WIRE_MS);
    const start = sampleObserverWireMotion(grown, 50);
    expect(start.frame.positions.get("b")).toEqual({ x: 0, y: 200 });
    expect(start.frame.boxHeights.get("a")).toBeCloseTo(180);
    const end = sampleObserverWireMotion(grown, 50 + OBSERVER_WIRE_MS);
    expect(end.frame.positions.get("b")).toEqual({ x: 0, y: 240 });
    expect(end.frame.boxHeights.has("a")).toBe(false);
  });

  it("plants a new card on its target and eases the cards already on screen", () => {
    const current = {
      positions: new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 80, y: 0 }],
      ]),
      heights: new Map([
        ["a", 100],
        ["b", 100],
      ]),
    };
    const motion = beginObserverWireMotion({
      current,
      targets: new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 80, y: 48 }],
        ["c", { x: 200, y: 24 }],
      ]),
      heights: new Map([
        ["a", 100],
        ["b", 100],
        ["c", 90],
      ]),
      reduced: false,
      now: 10,
    });
    const start = sampleObserverWireMotion(motion, 10).frame;
    expect(start.positions.get("c")).toEqual({ x: 200, y: 24 });
    expect(start.positions.get("b")).toEqual({ x: 80, y: 0 });
    expect(start.boxHeights.has("c")).toBe(false);
  });
});

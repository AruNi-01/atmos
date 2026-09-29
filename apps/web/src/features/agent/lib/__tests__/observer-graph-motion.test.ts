// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  OBSERVER_MOTION_MS,
  nextTimedExits,
  observerStaggerMs,
} from "../observer-graph-motion";

describe("observer graph motion", () => {
  it("keeps removed items until the exit window ends", () => {
    const kept = nextTimedExits({
      previousLive: [{ id: "a" }, { id: "b" }],
      nextLive: [{ id: "a" }],
      exiting: [],
      now: 1_000,
      durationMs: OBSERVER_MOTION_MS,
    });
    expect(kept).toEqual([{ item: { id: "b" }, until: 1_000 + OBSERVER_MOTION_MS }]);
  });

  it("does not exit anything when a card is added", () => {
    const kept = nextTimedExits({
      previousLive: [{ id: "a" }],
      nextLive: [{ id: "a" }, { id: "b" }],
      exiting: [],
      now: 1_000,
      durationMs: OBSERVER_MOTION_MS,
    });
    expect(kept).toEqual([]);
  });

  it("drops an exiting item once it is live again", () => {
    const kept = nextTimedExits({
      previousLive: [{ id: "a" }],
      nextLive: [{ id: "a" }, { id: "b" }],
      exiting: [{ item: { id: "b" }, until: 2_000 }],
      now: 1_100,
      durationMs: OBSERVER_MOTION_MS,
    });
    expect(kept).toEqual([]);
  });

  it("caps child stagger so expand never waits on the last card", () => {
    expect(observerStaggerMs(0)).toBe(0);
    expect(observerStaggerMs(2)).toBe(80);
    expect(observerStaggerMs(9)).toBe(160);
  });
});

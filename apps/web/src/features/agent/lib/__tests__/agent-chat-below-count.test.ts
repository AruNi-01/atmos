import { describe, expect, it } from "bun:test";
import {
  countMessagesBelowViewport,
  createMessagesBelowCountStore,
} from "../agent-chat-below-count";

describe("countMessagesBelowViewport", () => {
  const measurements = [
    { start: 0, size: 80 },
    { start: 92, size: 240 },
    { start: 344, size: 88 },
    { start: 444, size: 200 },
    { start: 656, size: 120 },
  ];

  it("counts rows whose top edge is at or below the viewport", () => {
    expect(
      countMessagesBelowViewport(measurements, 5, { scrollTop: 0, height: 400 }),
    ).toBe(2);
    expect(
      countMessagesBelowViewport(measurements, 5, { scrollTop: 400, height: 200 }),
    ).toBe(1);
  });

  it("returns 0 when every row starts inside the viewport", () => {
    expect(
      countMessagesBelowViewport(measurements, 5, { scrollTop: 700, height: 400 }),
    ).toBe(0);
  });

  it("treats trailing unmeasured rows as below", () => {
    expect(
      countMessagesBelowViewport(
        [{ start: 0, size: 80 }, { start: 92, size: 120 }],
        4,
        { scrollTop: 0, height: 300 },
      ),
    ).toBe(2);
  });

  it("returns 0 for an empty transcript", () => {
    expect(countMessagesBelowViewport([], 0, { scrollTop: 0, height: 400 })).toBe(0);
  });
});

describe("createMessagesBelowCountStore", () => {
  it("notifies listeners only when the count changes", () => {
    const store = createMessagesBelowCountStore();
    let ticks = 0;
    const unsubscribe = store.subscribe(() => {
      ticks += 1;
    });
    store.set(3);
    store.set(3);
    store.set(1);
    expect(store.getSnapshot()).toBe(1);
    expect(ticks).toBe(2);
    unsubscribe();
  });
});

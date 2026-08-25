import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CENTER_SPACE_ID,
} from "@/app-shell/center-space/center-space";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/lib/terminal-layout-document";
import type { LiveResourceSessionLocation } from "@/features/terminal/public";
import {
  TERMINAL_PANE_LOCATE_DURATION_MS,
  createTerminalPaneLocateController,
  createTerminalPaneLocateStore,
} from "@/features/terminal/store/terminal-pane-locate-store";

function target(
  overrides: Partial<LiveResourceSessionLocation> = {},
): LiveResourceSessionLocation {
  return {
    hostId: "ws-1",
    spaceId: DEFAULT_CENTER_SPACE_ID,
    paintContextId: "ws-1",
    terminalTabId: FIXED_TERMINAL_TAB_VALUE,
    paneId: "pane-1",
    sessionId: "sess-1",
    ...overrides,
  };
}

function createFakeTimers() {
  let nextId = 1;
  const pending = new Map<number, { callback: () => void; ms: number }>();
  return {
    pending,
    timers: {
      setTimeout: (callback: () => void, ms: number) => {
        const id = nextId++;
        pending.set(id, { callback, ms });
        return id;
      },
      clearTimeout: (id: unknown) => {
        pending.delete(id as number);
      },
    },
    flush(id?: number) {
      if (id != null) {
        const item = pending.get(id);
        pending.delete(id);
        item?.callback();
        return;
      }
      for (const [timerId, item] of [...pending.entries()]) {
        pending.delete(timerId);
        item.callback();
      }
    },
  };
}

describe("createTerminalPaneLocateController", () => {
  test("request returns a new generation and starts pending", () => {
    const fake = createFakeTimers();
    const controller = createTerminalPaneLocateController({ timers: fake.timers });
    const first = controller.request(target());
    const second = controller.request(target({ sessionId: "sess-2" }));
    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(controller.getState()).toMatchObject({
      generation: 2,
      phase: "pending",
      target: { sessionId: "sess-2" },
    });
    expect(fake.pending.size).toBe(0);
  });

  test("arrive of the matching generation becomes active and starts the 2400ms timer", () => {
    const fake = createFakeTimers();
    const controller = createTerminalPaneLocateController({ timers: fake.timers });
    const generation = controller.request(target());
    controller.arrive(generation);
    expect(controller.getState().phase).toBe("active");
    expect([...fake.pending.values()][0]?.ms).toBe(TERMINAL_PANE_LOCATE_DURATION_MS);
    fake.flush();
    expect(controller.getState()).toMatchObject({
      generation,
      phase: "idle",
      target: null,
    });
  });

  test("stale arrive is ignored", () => {
    const fake = createFakeTimers();
    const controller = createTerminalPaneLocateController({ timers: fake.timers });
    const first = controller.request(target());
    controller.request(target({ paneId: "pane-2" }));
    controller.arrive(first);
    expect(controller.getState().phase).toBe("pending");
    expect(fake.pending.size).toBe(0);
  });

  test("an old timer cannot clear a newer request", () => {
    const fake = createFakeTimers();
    const controller = createTerminalPaneLocateController({ timers: fake.timers });
    const first = controller.request(target());
    controller.arrive(first);
    const staleCallback = [...fake.pending.values()][0]?.callback;
    const second = controller.request(target({ sessionId: "sess-2" }));
    expect(controller.getState().phase).toBe("pending");
    expect(controller.getState().generation).toBe(second);
    staleCallback?.();
    expect(controller.getState()).toMatchObject({
      generation: second,
      phase: "pending",
      target: { sessionId: "sess-2" },
    });
  });

  test("repeat request + arrive uses the latest generation timer", () => {
    const fake = createFakeTimers();
    const controller = createTerminalPaneLocateController({ timers: fake.timers });
    const first = controller.request(target());
    controller.arrive(first);
    const second = controller.request(target({ paneId: "pane-2" }));
    controller.arrive(second);
    expect(controller.getState().phase).toBe("active");
    expect(fake.pending.size).toBe(1);
    fake.flush();
    expect(controller.getState().phase).toBe("idle");
  });

  test("clear and repeated clear are unmount-safe", () => {
    const fake = createFakeTimers();
    const controller = createTerminalPaneLocateController({ timers: fake.timers });
    const generation = controller.request(target());
    controller.arrive(generation);
    controller.clear();
    controller.clear();
    expect(controller.getState()).toMatchObject({
      generation,
      phase: "idle",
      target: null,
    });
    expect(fake.pending.size).toBe(0);
    fake.flush();
    expect(controller.getState().phase).toBe("idle");
  });
});

describe("createTerminalPaneLocateStore", () => {
  test("zustand wrapper mirrors controller request/arrive/timer", () => {
    const fake = createFakeTimers();
    const store = createTerminalPaneLocateStore({ timers: fake.timers });
    const generation = store.getState().request(target());
    expect(store.getState().phase).toBe("pending");
    store.getState().arrive(generation);
    expect(store.getState().phase).toBe("active");
    fake.flush();
    expect(store.getState().phase).toBe("idle");
    expect(store.getState().target).toBeNull();
  });
});

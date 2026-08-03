import { describe, expect, it } from "bun:test";
import { OverlayLifecycleController } from "./overlay-lifecycle.js";

describe("OverlayLifecycleController", () => {
  it("creates once on ensure and reuses", async () => {
    let creates = 0;
    let destroys = 0;
    const timers: Array<{ id: number; fn: () => void; ms: number }> = [];
    let nextId = 1;
    let now = 0;

    const ctrl = new OverlayLifecycleController({
      now: () => now,
      setTimeout: (fn, ms) => {
        const id = nextId++;
        timers.push({ id, fn, ms });
        return id;
      },
      clearTimeout: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
      idleMs: 1000,
      create: () => {
        creates += 1;
      },
      destroy: () => {
        destroys += 1;
      },
    });

    await ctrl.ensure();
    await ctrl.ensure();
    expect(creates).toBe(1);
    expect(ctrl.getState().ready).toBe(true);

    ctrl.release();
    expect(timers.length).toBe(1);
    // Fire idle timer
    const t = timers[0]!;
    t.fn();
    expect(destroys).toBe(1);
    expect(ctrl.getState().created).toBe(false);

    await ctrl.ensure();
    expect(creates).toBe(2);
  });

  it("noteActivity cancels idle destroy", async () => {
    let destroys = 0;
    const timers: Array<{ id: number; fn: () => void }> = [];
    let nextId = 1;

    const ctrl = new OverlayLifecycleController({
      now: () => 0,
      setTimeout: (fn) => {
        const id = nextId++;
        timers.push({ id, fn });
        return id;
      },
      clearTimeout: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
      idleMs: 1000,
      create: () => {},
      destroy: () => {
        destroys += 1;
      },
    });

    await ctrl.ensure();
    ctrl.release();
    expect(timers.length).toBe(1);
    const stale = timers[0]!;
    ctrl.noteActivity();
    expect(timers.length).toBe(0);
    // Stale timer must not destroy
    stale.fn();
    expect(destroys).toBe(0);
  });

  it("forceDestroy tears down without idle", async () => {
    let destroys = 0;
    const ctrl = new OverlayLifecycleController({
      now: () => 0,
      setTimeout: (fn) => {
        fn();
        return 1;
      },
      clearTimeout: () => {},
      idleMs: 1000,
      create: () => {},
      destroy: () => {
        destroys += 1;
      },
    });
    await ctrl.ensure();
    ctrl.forceDestroy();
    expect(destroys).toBe(1);
    expect(ctrl.getState().created).toBe(false);
  });
});

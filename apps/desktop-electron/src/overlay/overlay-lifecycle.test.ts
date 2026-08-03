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

  it("resets created on create rejection so ensure can retry", async () => {
    let creates = 0;
    const ctrl = new OverlayLifecycleController({
      now: () => 0,
      setTimeout: () => 1,
      clearTimeout: () => {},
      idleMs: 1000,
      create: () => {
        creates += 1;
        if (creates === 1) throw new Error("create failed");
      },
      destroy: () => {},
    });

    await expect(ctrl.ensure()).rejects.toThrow("create failed");
    expect(ctrl.getState().created).toBe(false);
    expect(ctrl.getState().ready).toBe(false);

    await ctrl.ensure();
    expect(creates).toBe(2);
    expect(ctrl.getState().ready).toBe(true);
  });

  it("ignores create completion after forceDestroy during in-flight create", async () => {
    let resolveCreate!: () => void;
    let destroys = 0;
    let readyCalls = 0;
    const createPromise = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });

    const ctrl = new OverlayLifecycleController({
      now: () => 0,
      setTimeout: () => 1,
      clearTimeout: () => {},
      idleMs: 1000,
      create: () => createPromise,
      destroy: () => {
        destroys += 1;
      },
      onReady: () => {
        readyCalls += 1;
      },
    });

    const ensurePromise = ctrl.ensure();
    expect(ctrl.getState().created).toBe(true);
    expect(ctrl.getState().ready).toBe(false);

    ctrl.forceDestroy();
    expect(destroys).toBe(1);
    expect(ctrl.getState().created).toBe(false);
    expect(ctrl.getState().ready).toBe(false);

    resolveCreate();
    const result = await ensurePromise;
    expect(result.ready).toBe(false);
    expect(ctrl.getState().created).toBe(false);
    expect(ctrl.getState().ready).toBe(false);
    expect(readyCalls).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Minimal localStorage for bun
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const storage = new MemoryStorage();
// @ts-expect-error test polyfill
globalThis.localStorage = storage;
// @ts-expect-error test polyfill
globalThis.window = globalThis;

const invokeMock = mock(async (_cmd: string) => ({
  engine_installed: true,
  engine_ready: true,
  accessibility: true,
  screen_recording: true,
}));

mock.module("@/shared/lib/desktop-bridge", () => ({
  isDesktopRuntime: () => true,
  desktopInvoke: invokeMock,
}));

describe("desktop-use readiness cache", () => {
  beforeEach(() => {
    storage.clear();
    invokeMock.mockClear();
    invokeMock.mockImplementation(async () => ({
      engine_installed: true,
      engine_ready: true,
      accessibility: true,
      screen_recording: true,
    }));
  });

  afterEach(() => {
    storage.clear();
  });

  it("caches ready doctor results and serves from cache", async () => {
    const {
      fetchDesktopUseReadiness,
      peekDesktopUseReadinessCache,
      invalidateDesktopUseReadinessCache,
    } = await import("../readiness");

    invalidateDesktopUseReadinessCache();
    const first = await fetchDesktopUseReadiness({ force: true });
    expect(first.ready).toBe(true);
    expect(first.fromCache).toBe(false);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const peek = peekDesktopUseReadinessCache();
    expect(peek?.ready).toBe(true);
    expect(peek?.fromCache).toBe(true);

    const second = await fetchDesktopUseReadiness();
    expect(second.ready).toBe(true);
    // Still one doctor call — served from cache
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("blocks when engine is not installed", async () => {
    invokeMock.mockImplementation(async () => ({
      engine_installed: false,
      engine_ready: false,
      accessibility: null,
      screen_recording: null,
    }));
    const { fetchDesktopUseReadiness, invalidateDesktopUseReadinessCache } =
      await import("../readiness");
    invalidateDesktopUseReadinessCache();
    const r = await fetchDesktopUseReadiness({ force: true });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("engine_not_installed");
  });

  it("blocks when screen recording is explicitly denied", async () => {
    invokeMock.mockImplementation(async () => ({
      engine_installed: true,
      engine_ready: true,
      accessibility: true,
      screen_recording: false,
    }));
    const { fetchDesktopUseReadiness, invalidateDesktopUseReadinessCache } =
      await import("../readiness");
    invalidateDesktopUseReadinessCache();
    const r = await fetchDesktopUseReadiness({ force: true });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("permission_screen_recording");
  });
});

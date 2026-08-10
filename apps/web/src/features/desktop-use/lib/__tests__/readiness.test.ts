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

const invokeMock = mock(async (cmd: string) => {
  if (cmd === "atmos_cli_probe") {
    return {
      installed: true,
      path: "/Users/test/.atmos/bin/atmos",
      version: "2026.8.10",
      meets_requirement: true,
      update_required: false,
      min_cli_version: "2026.8.7",
    };
  }
  return {
    engine_installed: true,
    engine_ready: true,
    accessibility: true,
    screen_recording: true,
    cli_installed: true,
    cli_meets_requirement: true,
  };
});

mock.module("@/shared/lib/desktop-bridge", () => ({
  isDesktopRuntime: () => true,
  desktopInvoke: invokeMock,
}));

describe("desktop-use readiness cache", () => {
  beforeEach(() => {
    storage.clear();
    invokeMock.mockClear();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "atmos_cli_probe") {
        return {
          installed: true,
          path: "/Users/test/.atmos/bin/atmos",
          version: "2026.8.10",
          meets_requirement: true,
          update_required: false,
          min_cli_version: "2026.8.7",
        };
      }
      return {
        engine_installed: true,
        engine_ready: true,
        accessibility: true,
        screen_recording: true,
        cli_installed: true,
        cli_meets_requirement: true,
      };
    });
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
    // atmos_cli_probe + desktop_use_doctor
    expect(invokeMock).toHaveBeenCalledTimes(2);

    const peek = peekDesktopUseReadinessCache();
    expect(peek?.ready).toBe(true);
    expect(peek?.fromCache).toBe(true);

    const second = await fetchDesktopUseReadiness();
    expect(second.ready).toBe(true);
    // Still two invokes — second fetch served from cache
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("blocks when Atmos CLI is not installed", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "atmos_cli_probe") {
        return {
          installed: false,
          path: "/Users/test/.atmos/bin/atmos",
          meets_requirement: false,
          update_required: false,
        };
      }
      throw new Error("doctor should not run without CLI");
    });
    const { fetchDesktopUseReadiness, invalidateDesktopUseReadinessCache } =
      await import("../readiness");
    invalidateDesktopUseReadinessCache();
    const r = await fetchDesktopUseReadiness({ force: true });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("cli_not_installed");
    expect(r.cliInstalled).toBe(false);
  });

  it("blocks when Atmos CLI is below package min version", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "atmos_cli_probe") {
        return {
          installed: true,
          path: "/Users/test/.atmos/bin/atmos",
          version: "2026.8.1",
          meets_requirement: false,
          update_required: true,
          min_cli_version: "2026.8.10",
        };
      }
      throw new Error("doctor should not run when CLI below min");
    });
    const { fetchDesktopUseReadiness, invalidateDesktopUseReadinessCache } =
      await import("../readiness");
    invalidateDesktopUseReadinessCache();
    const r = await fetchDesktopUseReadiness({ force: true });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("cli_update_required");
    expect(r.cliInstalled).toBe(true);
  });

  it("blocks when engine is not installed", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "atmos_cli_probe") {
        return {
          installed: true,
          path: "/Users/test/.atmos/bin/atmos",
          version: "2026.8.10",
          meets_requirement: true,
          update_required: false,
        };
      }
      return {
        engine_installed: false,
        engine_ready: false,
        accessibility: null,
        screen_recording: null,
        cli_installed: true,
        cli_meets_requirement: true,
      };
    });
    const { fetchDesktopUseReadiness, invalidateDesktopUseReadinessCache } =
      await import("../readiness");
    invalidateDesktopUseReadinessCache();
    const r = await fetchDesktopUseReadiness({ force: true });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("engine_not_installed");
  });

  it("blocks when screen recording is explicitly denied", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "atmos_cli_probe") {
        return {
          installed: true,
          path: "/Users/test/.atmos/bin/atmos",
          version: "2026.8.10",
          meets_requirement: true,
          update_required: false,
        };
      }
      return {
        engine_installed: true,
        engine_ready: true,
        accessibility: true,
        screen_recording: false,
        cli_installed: true,
        cli_meets_requirement: true,
      };
    });
    const { fetchDesktopUseReadiness, invalidateDesktopUseReadinessCache } =
      await import("../readiness");
    invalidateDesktopUseReadinessCache();
    const r = await fetchDesktopUseReadiness({ force: true });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("permission_screen_recording");
  });
});

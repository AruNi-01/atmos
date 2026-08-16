// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import {
  DESKTOP_CMD_UNSUPPORTED,
  __setDesktopBridgeAdaptersForTests,
  createUnsupportedCommandError,
  desktopInvoke,
  detectDesktopShell,
  getDesktopTerminalStreamApi,
  invokeViaShell,
  isDesktopBridgeError,
  isDesktopRuntime,
  isElectronShell,
  isTauriShell,
} from "../desktop-bridge";

let previousWindow: PropertyDescriptor | undefined;

function installWindow(url = "https://app.atmos.land/"): Window {
  const win = new Window({ url });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: win,
    writable: true,
  });
  return win;
}

beforeEach(() => {
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  __setDesktopBridgeAdaptersForTests(null);
});

afterEach(() => {
  __setDesktopBridgeAdaptersForTests(null);
  if (previousWindow) {
    Object.defineProperty(globalThis, "window", previousWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("detectDesktopShell", () => {
  it("returns none without a window", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(detectDesktopShell({} as typeof globalThis)).toBe("none");
    expect(isDesktopRuntime({} as typeof globalThis)).toBe(false);
  });

  it("returns none for a plain browser window", () => {
    installWindow();
    expect(detectDesktopShell()).toBe("none");
    expect(isDesktopRuntime()).toBe(false);
    expect(isTauriShell()).toBe(false);
    expect(isElectronShell()).toBe(false);
  });

  it("returns tauri when __TAURI_INTERNALS__ is present", () => {
    const win = installWindow();
    (win as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: async () => ({}),
    };
    expect(detectDesktopShell()).toBe("tauri");
    expect(isDesktopRuntime()).toBe(true);
    expect(isTauriShell()).toBe(true);
    expect(isElectronShell()).toBe(false);
  });

  it("returns electron when __ATMOS_DESKTOP__.shell is electron", () => {
    const win = installWindow();
    (win as unknown as { __ATMOS_DESKTOP__: object }).__ATMOS_DESKTOP__ = {
      shell: "electron",
      invoke: async () => ({}),
    };
    expect(detectDesktopShell()).toBe("electron");
    expect(isDesktopRuntime()).toBe(true);
    expect(isElectronShell()).toBe(true);
    expect(isTauriShell()).toBe(false);
  });

  it("prefers electron marker over tauri internals if both exist", () => {
    const win = installWindow();
    (win as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: async () => "tauri",
    };
    (win as unknown as { __ATMOS_DESKTOP__: object }).__ATMOS_DESKTOP__ = {
      shell: "electron",
      invoke: async () => "electron",
    };
    expect(detectDesktopShell()).toBe("electron");
  });
});

describe("invokeViaShell / desktopInvoke routing", () => {
  it("routes tauri invokes through the tauri adapter", async () => {
    const calls: Array<{ cmd: string; args: unknown }> = [];
    const result = await invokeViaShell(
      "tauri",
      "get_api_config",
      undefined,
      {
        tauriInvoke: async (cmd, args) => {
          calls.push({ cmd, args });
          return { host: "127.0.0.1", port: 30303 };
        },
      },
    );
    expect(result).toEqual({ host: "127.0.0.1", port: 30303 });
    expect(calls).toEqual([{ cmd: "get_api_config", args: undefined }]);
  });

  it("routes electron invokes through the electron adapter", async () => {
    const calls: Array<{ cmd: string; args: unknown }> = [];
    const result = await invokeViaShell(
      "electron",
      "write_log",
      { level: "info", message: "hi" },
      {
        electronInvoke: async (cmd, args) => {
          calls.push({ cmd, args });
          return null;
        },
      },
    );
    expect(result).toBeNull();
    expect(calls).toEqual([
      { cmd: "write_log", args: { level: "info", message: "hi" } },
    ]);
  });

  it("rejects invoke when shell is none", async () => {
    await expect(
      invokeViaShell("none", "get_api_config"),
    ).rejects.toMatchObject({
      code: "DESKTOP_SHELL_NONE",
      command: "get_api_config",
    });
  });

  it("desktopInvoke uses detectDesktopShell + test adapters", async () => {
    const win = installWindow();
    (win as unknown as { __ATMOS_DESKTOP__: object }).__ATMOS_DESKTOP__ = {
      shell: "electron",
      invoke: async () => {
        throw new Error("should use test adapter");
      },
    };
    __setDesktopBridgeAdaptersForTests({
      electronInvoke: async (cmd) => {
        if (cmd === "get_api_config") {
          return { host: "127.0.0.1", port: 40404 };
        }
        throw createUnsupportedCommandError(cmd);
      },
    });

    const cfg = await desktopInvoke<{ host: string; port: number }>(
      "get_api_config",
    );
    expect(cfg.port).toBe(40404);

    let unsupported: unknown;
    try {
      await desktopInvoke("browser_bridge_open");
    } catch (err) {
      unsupported = err;
    }
    expect(isDesktopBridgeError(unsupported, DESKTOP_CMD_UNSUPPORTED)).toBe(
      true,
    );
    expect((unsupported as { command?: string }).command).toBe(
      "browser_bridge_open",
    );
  });

  it("surfaces unsupported command errors with stable code", () => {
    const err = createUnsupportedCommandError("browser_bridge_open");
    expect(err.code).toBe(DESKTOP_CMD_UNSUPPORTED);
    expect(err.message).toContain("browser_bridge_open");
    expect(isDesktopBridgeError(err, DESKTOP_CMD_UNSUPPORTED)).toBe(true);
  });

  it("does not call tauri adapter when shell is electron", async () => {
    let tauriCalled = false;
    await invokeViaShell("electron", "get_api_config", undefined, {
      tauriInvoke: async () => {
        tauriCalled = true;
        return {};
      },
      electronInvoke: async () => ({ host: "127.0.0.1", port: 1 }),
    });
    expect(tauriCalled).toBe(false);
  });
});

describe("getDesktopTerminalStreamApi", () => {
  it("returns null without a terminalStream bridge", () => {
    const win = installWindow();
    (win as unknown as { __ATMOS_DESKTOP__: object }).__ATMOS_DESKTOP__ = {
      shell: "electron",
      invoke: async () => ({}),
    };
    expect(getDesktopTerminalStreamApi()).toBeNull();
  });

  it("returns the preload terminalStream API when present", () => {
    const win = installWindow();
    const terminalStream = {
      open: async () => ({ streamId: "s1" }),
      send: () => {},
      close: () => {},
    };
    (win as unknown as { __ATMOS_DESKTOP__: object }).__ATMOS_DESKTOP__ = {
      shell: "electron",
      invoke: async () => ({}),
      terminalStream,
    };
    expect(getDesktopTerminalStreamApi()).toBe(terminalStream);
  });
});

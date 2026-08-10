import { afterEach, describe, expect, test } from "bun:test";
import { workbenchRelayClientKind } from "./workbench-relay-client-kind";
import {
  detectDesktopShell,
  type AtmosDesktopPreload,
} from "@/shared/lib/desktop-bridge";

describe("workbenchRelayClientKind", () => {
  const g = globalThis as typeof globalThis & {
    window?: {
      __ATMOS_DESKTOP__?: AtmosDesktopPreload;
      __TAURI_INTERNALS__?: unknown;
    };
  };
  const prevWindow = g.window;

  afterEach(() => {
    if (prevWindow === undefined) {
      delete g.window;
    } else {
      g.window = prevWindow;
    }
  });

  test("returns web when no desktop shell is present", () => {
    g.window = {};
    expect(detectDesktopShell(g)).toBe("none");
    expect(workbenchRelayClientKind()).toBe("web");
  });

  test("returns desktop when Electron preload bridge is present", () => {
    g.window = {
      __ATMOS_DESKTOP__: {
        shell: "electron",
        invoke: async () => undefined,
      },
    };
    expect(detectDesktopShell(g)).toBe("electron");
    // workbenchRelayClientKind uses isDesktopRuntime() → globalThis window
    expect(workbenchRelayClientKind()).toBe("desktop");
  });
});

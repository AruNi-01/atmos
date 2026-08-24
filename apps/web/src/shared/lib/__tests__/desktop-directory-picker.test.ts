// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";

import { __setDesktopBridgeAdaptersForTests } from "../desktop-bridge";
import { pickLocalDirectory, pickLocalFile } from "../desktop-directory-picker";

let previousWindow: PropertyDescriptor | undefined;

function installWindow(url = "https://app.atmos.land/"): Window {
  const win = new Window({ url });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: win,
    writable: true,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: win.document,
    writable: true,
  });
  return win;
}

function installElectronWindow(): Window {
  const win = installWindow();
  (
    win as unknown as {
      __ATMOS_DESKTOP__: { shell: "electron"; invoke: () => Promise<unknown> };
    }
  ).__ATMOS_DESKTOP__ = {
    shell: "electron",
    invoke: async () => null,
  };
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

describe("pickLocalFile on desktop", () => {
  beforeEach(() => {
    installElectronWindow();
  });

  it("opens the native file picker with directory:false and image filters", async () => {
    const electronInvoke = mock(async (_cmd: string, _args?: Record<string, unknown>) => {
      return "/tmp/logo.png";
    });
    __setDesktopBridgeAdaptersForTests({ electronInvoke });

    const selected = await pickLocalFile({
      defaultPath: "/tmp",
      title: "Select logo image",
      filters: [{ name: "Images", extensions: ["png", "jpg"] }],
    });

    expect(selected).toEqual({ status: "picked", path: "/tmp/logo.png" });
    expect(electronInvoke).toHaveBeenCalledTimes(1);
    expect(electronInvoke.mock.calls[0]?.[0]).toBe("open_path_dialog");
    expect(electronInvoke.mock.calls[0]?.[1]).toEqual({
      directory: false,
      defaultPath: "/tmp",
      title: "Select logo image",
      filters: [{ name: "Images", extensions: ["png", "jpg"] }],
    });
  });

  it("returns cancelled when the native picker is dismissed", async () => {
    __setDesktopBridgeAdaptersForTests({
      electronInvoke: async () => null,
    });
    expect(await pickLocalFile()).toEqual({ status: "cancelled" });
  });
});

describe("pickLocalDirectory on desktop", () => {
  beforeEach(() => {
    installElectronWindow();
  });

  it("opens the native directory picker with directory:true", async () => {
    const electronInvoke = mock(async () => "/tmp/project");
    __setDesktopBridgeAdaptersForTests({ electronInvoke });

    const selected = await pickLocalDirectory({
      defaultPath: "/tmp",
      title: "Select folder",
    });

    expect(selected).toEqual({ status: "picked", path: "/tmp/project" });
    expect(electronInvoke.mock.calls[0]?.[0]).toBe("open_path_dialog");
    expect(electronInvoke.mock.calls[0]?.[1]).toEqual({
      directory: true,
      defaultPath: "/tmp",
      title: "Select folder",
      filters: undefined,
    });
  });
});

describe("browser system pickers", () => {
  it("uses showOpenFilePicker and embeds the file when no OS path is exposed", async () => {
    const win = installWindow();
    const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
    (
      win as unknown as {
        showOpenFilePicker: () => Promise<Array<{ getFile: () => Promise<File> }>>;
      }
    ).showOpenFilePicker = async () => [{ getFile: async () => file }];

    const selected = await pickLocalFile({
      filters: [{ name: "Images", extensions: ["png"] }],
    });
    expect(selected.status).toBe("picked");
    if (selected.status === "picked") {
      expect(selected.path.startsWith("data:image/png")).toBe(true);
    }
  });

  it("treats a dismissed browser file picker as cancelled", async () => {
    const win = installWindow();
    (
      win as unknown as {
        showOpenFilePicker: () => Promise<unknown>;
      }
    ).showOpenFilePicker = async () => {
      const error = new Error("The user aborted a request.");
      error.name = "AbortError";
      throw error;
    };

    expect(await pickLocalFile()).toEqual({ status: "cancelled" });
  });

  it("uses showDirectoryPicker when the browser exposes a folder path", async () => {
    const win = installWindow();
    (
      win as unknown as {
        showDirectoryPicker: () => Promise<{ path?: string }>;
      }
    ).showDirectoryPicker = async () => ({ path: "/Users/me/widgets" });

    expect(await pickLocalDirectory()).toEqual({
      status: "picked",
      path: "/Users/me/widgets",
    });
  });

  it("treats a dismissed browser folder picker as cancelled", async () => {
    const win = installWindow();
    (
      win as unknown as {
        showDirectoryPicker: () => Promise<unknown>;
      }
    ).showDirectoryPicker = async () => {
      const error = new Error("The user aborted a request.");
      error.name = "AbortError";
      throw error;
    };

    expect(await pickLocalDirectory()).toEqual({ status: "cancelled" });
  });

  it("falls back when the browser folder picker cannot expose an absolute path", async () => {
    const win = installWindow();
    (
      win as unknown as {
        showDirectoryPicker: () => Promise<{ name: string }>;
      }
    ).showDirectoryPicker = async () => ({ name: "widgets" });

    expect(await pickLocalDirectory()).toEqual({ status: "unavailable" });
  });
});

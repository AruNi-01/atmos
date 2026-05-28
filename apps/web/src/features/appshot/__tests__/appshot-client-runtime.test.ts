// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import {
  getAppshotStatus,
  isAppshotRuntimeAvailable,
  listAppshotRecords,
  listenAppshotPreview,
  readAppshotRecords,
} from "../lib/appshot-client";

describe("S11 - Appshot browser runtime gating", () => {
  it("returns non-desktop state and avoids Tauri record calls outside Tauri", async () => {
    const browserWindow = new Window({ url: "http://localhost:3030" });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: browserWindow,
      writable: true,
    });

    try {
      expect(isAppshotRuntimeAvailable()).toBe(false);
      await expect(getAppshotStatus()).resolves.toMatchObject({
        supported: false,
        platform: "unknown",
        reason: "Appshots require Atmos Desktop.",
      });
      await expect(listAppshotRecords()).resolves.toEqual([]);
      await expect(readAppshotRecords(["1760000000000"])).resolves.toEqual([]);

      const unlisten = await listenAppshotPreview(() => {
        throw new Error("non-Tauri listener should not receive preview events");
      });
      expect(typeof unlisten).toBe("function");
      expect(unlisten()).toBeUndefined();
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });
});

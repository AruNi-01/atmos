// @ts-expect-error bun:test
import { afterEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import {
  clearRuntimeApiConfigCache,
  getRuntimeHttpConfig,
  httpBase,
} from "../desktop-runtime";

describe("local-web HTTP target", () => {
  const previousTarget = process.env.NEXT_PUBLIC_BUILD_TARGET;
  let previousWindow: PropertyDescriptor | undefined;

  afterEach(() => {
    if (previousTarget === undefined) {
      delete process.env.NEXT_PUBLIC_BUILD_TARGET;
    } else {
      process.env.NEXT_PUBLIC_BUILD_TARGET = previousTarget;
    }
    clearRuntimeApiConfigCache();
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("sends REST to the loopback API instead of Next trailing-slash 404s", async () => {
    previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    process.env.NEXT_PUBLIC_BUILD_TARGET = "local-web";
    const win = new Window({ url: "http://127.0.0.1:3130/pt-design/" });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: win,
      writable: true,
    });
    clearRuntimeApiConfigCache();
    const cfg = await getRuntimeHttpConfig();
    expect(cfg.port).toBe(30303);
    expect(httpBase(cfg)).toBe("http://127.0.0.1:30303");
  });
});

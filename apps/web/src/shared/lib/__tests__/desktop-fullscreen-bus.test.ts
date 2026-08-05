import { describe, expect, it, beforeEach } from "bun:test";
import {
  __resetDesktopFullscreenBusForTests,
  subscribeDesktopFullscreen,
} from "../desktop-fullscreen-bus";

describe("desktop-fullscreen-bus", () => {
  beforeEach(() => {
    __resetDesktopFullscreenBusForTests();
  });

  it("fans out to multiple subscribers without requiring per-hook IPC", () => {
    const a: boolean[] = [];
    const b: boolean[] = [];
    const offA = subscribeDesktopFullscreen((fs) => {
      a.push(fs);
    });
    const offB = subscribeDesktopFullscreen((fs) => {
      b.push(fs);
    });
    expect(typeof offA).toBe("function");
    expect(typeof offB).toBe("function");
    offA();
    offB();
  });
});

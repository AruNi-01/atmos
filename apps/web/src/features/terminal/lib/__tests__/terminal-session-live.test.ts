// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, describe, expect, it } from "bun:test";
import {
  markTerminalSessionDead,
  markTerminalSessionLive,
  scheduleTerminalSessionDead,
  wasTerminalSessionLive,
} from "../terminal-runtime-utils";

describe("terminal session live markers (warm remount UX)", () => {
  afterEach(() => {
    markTerminalSessionDead("s1");
    markTerminalSessionDead("s2");
  });

  it("marks live and reports wasTerminalSessionLive", () => {
    expect(wasTerminalSessionLive("s1")).toBe(false);
    markTerminalSessionLive("s1");
    expect(wasTerminalSessionLive("s1")).toBe(true);
  });

  it("scheduleTerminalSessionDead clears after grace; remount cancel keeps live", async () => {
    markTerminalSessionLive("s2");
    scheduleTerminalSessionDead("s2", 30);
    expect(wasTerminalSessionLive("s2")).toBe(true);
    // Remount reconnect path cancels grace
    markTerminalSessionLive("s2");
    await new Promise((r) => setTimeout(r, 50));
    expect(wasTerminalSessionLive("s2")).toBe(true);

    scheduleTerminalSessionDead("s2", 20);
    await new Promise((r) => setTimeout(r, 40));
    expect(wasTerminalSessionLive("s2")).toBe(false);
  });
});

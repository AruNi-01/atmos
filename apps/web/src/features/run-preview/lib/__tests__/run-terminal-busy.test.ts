import { describe, expect, it } from "bun:test";

import { isRunTerminalBusyFromTitle } from "../run-terminal-busy";

describe("isRunTerminalBusyFromTitle", () => {
  it("treats empty / missing titles as idle", () => {
    expect(isRunTerminalBusyFromTitle(undefined)).toBe(false);
    expect(isRunTerminalBusyFromTitle(null)).toBe(false);
    expect(isRunTerminalBusyFromTitle("")).toBe(false);
    expect(isRunTerminalBusyFromTitle("   ")).toBe(false);
  });

  it("treats path-like titles as idle (CMD_END)", () => {
    expect(isRunTerminalBusyFromTitle("/Users/me/project")).toBe(false);
    expect(isRunTerminalBusyFromTitle(".../OpenSource/atmos")).toBe(false);
    expect(isRunTerminalBusyFromTitle("~/code")).toBe(false);
  });

  it("treats command titles as busy (CMD_START)", () => {
    expect(isRunTerminalBusyFromTitle("npm")).toBe(true);
    expect(isRunTerminalBusyFromTitle("npm run")).toBe(true);
    expect(isRunTerminalBusyFromTitle("cargo run")).toBe(true);
    expect(isRunTerminalBusyFromTitle("just")).toBe(true);
    expect(isRunTerminalBusyFromTitle("node")).toBe(true);
    expect(isRunTerminalBusyFromTitle("vite")).toBe(true);
  });
});

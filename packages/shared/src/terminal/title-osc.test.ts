import { describe, expect, test } from "bun:test";

import {
  ATMOS_REATTACH_TITLE_OSC,
  ATMOS_SHELL_TITLE_OSC,
  formatReattachTitleOsc,
  shouldClearNativeOscOnCmdEnd,
} from "./title-osc";

describe("title OSC codes", () => {
  test("shell and reattach use distinct OSC numbers", () => {
    expect(ATMOS_SHELL_TITLE_OSC).toBe(9999);
    expect(ATMOS_REATTACH_TITLE_OSC).toBe(9998);
    expect(ATMOS_REATTACH_TITLE_OSC).not.toBe(ATMOS_SHELL_TITLE_OSC);
  });

  test("reattach inject frames OSC 9998 only", () => {
    const start = formatReattachTitleOsc("CMD_START", "grok");
    const end = formatReattachTitleOsc("CMD_END", "/tmp");
    expect(start).toBe("\x1b]9998;CMD_START:grok\x07");
    expect(end).toBe("\x1b]9998;CMD_END:/tmp\x07");
    expect(start.includes("9999")).toBe(false);
    expect(end.includes("9999")).toBe(false);
  });

  test("only real shell CMD_END clears native OSC topics", () => {
    expect(shouldClearNativeOscOnCmdEnd(ATMOS_SHELL_TITLE_OSC)).toBe(true);
    expect(shouldClearNativeOscOnCmdEnd(ATMOS_REATTACH_TITLE_OSC)).toBe(false);
    expect(shouldClearNativeOscOnCmdEnd(0)).toBe(false);
    expect(shouldClearNativeOscOnCmdEnd(2)).toBe(false);
  });
});

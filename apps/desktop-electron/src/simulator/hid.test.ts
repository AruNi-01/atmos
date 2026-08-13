import { describe, expect, it } from "bun:test";
import { hidUsageForChar, HID_LEFT_SHIFT } from "./hid.ts";

describe("HID character mapping", () => {
  it("marks uppercase letters as shifted", () => {
    expect(hidUsageForChar("A")).toEqual({ usage: 0x04, shift: true });
    expect(hidUsageForChar("a")).toEqual({ usage: 0x04, shift: false });
    expect(HID_LEFT_SHIFT).toBe(0xe1);
  });
});

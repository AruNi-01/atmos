import { describe, expect, it } from "bun:test";
import { hidUsageForDomKey } from "./hid.ts";

describe("simulator panel HID mapping", () => {
  it("maps letters with shift and common keys", () => {
    expect(hidUsageForDomKey("a")).toEqual({ usage: 0x04, shift: false });
    expect(hidUsageForDomKey("A")).toEqual({ usage: 0x04, shift: true });
    expect(hidUsageForDomKey("Enter")).toEqual({ usage: 0x28, shift: false });
    expect(hidUsageForDomKey("Backspace")).toEqual({ usage: 0x2a, shift: false });
    expect(hidUsageForDomKey("Shift")).toBeNull();
  });
});

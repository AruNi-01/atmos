import { describe, expect, it } from "bun:test";
import {
  CoordOutOfRangeError,
  encodeSimulatorInput,
  SIMULATOR_OP,
} from "./opcode.ts";

describe("opcode encoder", () => {
  it("encodes touch as opcode 3 plus JSON 0–1 coords", () => {
    const buf = encodeSimulatorInput({
      op: "touch",
      type: "begin",
      x: 0.5,
      y: 0.42,
    });
    expect(buf[0]).toBe(SIMULATOR_OP.touch);
    expect(JSON.parse(new TextDecoder().decode(buf.slice(1)))).toEqual({
      type: "begin",
      x: 0.5,
      y: 0.42,
    });
  });

  it("encodes button, scroll, and orientation", () => {
    expect(encodeSimulatorInput({ op: "button", button: "home" })[0]).toBe(4);
    expect(
      encodeSimulatorInput({ op: "scroll", dx: 0, dy: -0.2, x: 0.5, y: 0.5 })[0],
    ).toBe(11);
    expect(
      encodeSimulatorInput({ op: "orientation", orientation: "landscape_left" })[0],
    ).toBe(7);
  });

  it("encodes pinch, key, and software keyboard opcodes", () => {
    expect(
      encodeSimulatorInput({
        op: "pinch",
        type: "begin",
        x1: 0.2,
        y1: 0.3,
        x2: 0.8,
        y2: 0.7,
      })[0],
    ).toBe(SIMULATOR_OP.pinch);
    expect(
      encodeSimulatorInput({ op: "key", type: "down", usage: 4 })[0],
    ).toBe(SIMULATOR_OP.key);
    expect(encodeSimulatorInput({ op: "software_keyboard" })[0]).toBe(
      SIMULATOR_OP.softwareKeyboard,
    );
  });

  it("rejects out-of-range coordinates", () => {
    expect(() =>
      encodeSimulatorInput({ op: "touch", type: "end", x: 1.5, y: 0.2 }),
    ).toThrow(CoordOutOfRangeError);
  });
});

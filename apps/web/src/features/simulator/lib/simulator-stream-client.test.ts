import { describe, expect, it } from "bun:test";

import {
  CoordOutOfRangeError,
  encodeSimulatorInput,
  normalizePointer,
  streamAvccUrl,
  streamMjpegUrl,
  streamWsUrl,
} from "./simulator-stream-client";

function decodePayload(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes.slice(1)));
}

describe("simulator stream client", () => {
  it("encodes touch, button, scroll, and orientation opcodes", () => {
    expect(encodeSimulatorInput({ op: "touch", type: "begin", x: 0.25, y: 0.75 })[0]).toBe(3);
    expect(decodePayload(encodeSimulatorInput({ op: "touch", type: "begin", x: 0.25, y: 0.75 }))).toEqual({
      type: "begin",
      x: 0.25,
      y: 0.75,
    });

    const button = encodeSimulatorInput({ op: "button", button: "home" });
    expect(button[0]).toBe(4);
    expect(decodePayload(button)).toEqual({ button: "home" });

    const scroll = encodeSimulatorInput({
      op: "scroll",
      dx: 2,
      dy: -3,
      x: 0.5,
      y: 0.4,
    });
    expect(scroll[0]).toBe(11);
    expect(decodePayload(scroll)).toEqual({ dx: 2, dy: -3, x: 0.5, y: 0.4 });

    const orientation = encodeSimulatorInput({
      op: "orientation",
      orientation: "landscape_left",
    });
    expect(orientation[0]).toBe(7);
    expect(decodePayload(orientation)).toEqual({ orientation: "landscape_left" });
  });

  it("encodes pinch, key, and software keyboard opcodes", () => {
    const pinch = encodeSimulatorInput({
      op: "pinch",
      type: "begin",
      x1: 0.2,
      y1: 0.3,
      x2: 0.8,
      y2: 0.7,
    });
    expect(pinch[0]).toBe(5);
    expect(decodePayload(pinch)).toEqual({
      type: "begin",
      x1: 0.2,
      y1: 0.3,
      x2: 0.8,
      y2: 0.7,
    });

    const key = encodeSimulatorInput({ op: "key", type: "down", usage: 4 });
    expect(key[0]).toBe(6);
    expect(decodePayload(key)).toEqual({ type: "down", usage: 4 });

    const keyboard = encodeSimulatorInput({ op: "software_keyboard" });
    expect(keyboard[0]).toBe(12);
    expect(keyboard.length).toBe(1);
  });

  it("rejects coordinates outside the normalized range", () => {
    expect(() =>
      encodeSimulatorInput({ op: "touch", type: "move", x: -0.01, y: 0.5 }),
    ).toThrow(CoordOutOfRangeError);
    expect(() =>
      normalizePointer(101, 50, {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      } as DOMRect),
    ).toThrow("Coordinates must be in 0–1");
  });

  it("builds stream URLs", () => {
    expect(streamMjpegUrl("http://127.0.0.1:4000/s/token")).toBe(
      "http://127.0.0.1:4000/s/token/stream.mjpeg",
    );
    expect(streamAvccUrl("http://127.0.0.1:4000/s/token")).toBe(
      "http://127.0.0.1:4000/s/token/stream.avcc",
    );
    expect(streamWsUrl("https://127.0.0.1:4000/s/token")).toBe(
      "wss://127.0.0.1:4000/s/token/ws",
    );
  });
});

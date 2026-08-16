import { describe, expect, test } from "bun:test";

import { dispatchTerminalServerPayload } from "./dispatch-terminal-server-message";

describe("dispatchTerminalServerPayload", () => {
  test("treats binary frames as output", () => {
    expect(dispatchTerminalServerPayload(new Uint8Array([65]), "s1")).toEqual({
      action: "output",
      data: new Uint8Array([65]),
    });
  });

  test("routes attached and fatal error frames", () => {
    expect(
      dispatchTerminalServerPayload(
        JSON.stringify({
          type: "terminal_attached",
          session_id: "s1",
          workspace_id: "w",
          snapshot: { data: "x", cursor_x: 0, cursor_y: 0, cols: 80, rows: 24 },
        }),
        "s1",
      ).action,
    ).toBe("attached");
    expect(
      dispatchTerminalServerPayload(
        JSON.stringify({ type: "terminal_error", error: "boom" }),
        "s1",
      ),
    ).toEqual({ action: "error", error: "boom" });
  });

  test("ignores frames for other sessions", () => {
    expect(
      dispatchTerminalServerPayload(
        JSON.stringify({ type: "terminal_closed", session_id: "other" }),
        "s1",
      ),
    ).toEqual({ action: "ignore" });
  });

  test("ignores non-JSON text control frames", () => {
    expect(dispatchTerminalServerPayload("not-json {", "s1")).toEqual({
      action: "ignore",
    });
  });
});

import { describe, expect, it } from "bun:test";
import { listenersAreLoopback } from "./bind-assert.ts";

describe("bind assert", () => {
  it("accepts loopback listeners and rejects wildcard binds", () => {
    expect(
      listenersAreLoopback(
        "node 1 TCP 127.0.0.1:49152 (LISTEN)\nnode 1 TCP [::1]:49152 (LISTEN)\n",
      ),
    ).toBe(true);
    expect(listenersAreLoopback("node 1 TCP *:3100 (LISTEN)\n")).toBe(false);
    expect(listenersAreLoopback("node 1 TCP [::]:9222 (LISTEN)\n")).toBe(false);
  });
});

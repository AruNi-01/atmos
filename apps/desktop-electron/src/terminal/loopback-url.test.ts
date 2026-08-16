import { describe, expect, it } from "bun:test";

import { rewriteTerminalStreamUrlToLocalApi } from "./loopback-url.ts";

describe("rewriteTerminalStreamUrlToLocalApi", () => {
  const api = { host: "127.0.0.1", port: 30303 };

  it("pins loopback urls onto the sidecar host/port and keeps query", () => {
    const out = rewriteTerminalStreamUrlToLocalApi(
      "ws://localhost:9/ws/terminal/term-1?workspace_id=w&cols=80",
      api,
    );
    expect(out).toBe(
      "ws://127.0.0.1:30303/ws/terminal/term-1?workspace_id=w&cols=80",
    );
  });

  it("rejects remote hosts", () => {
    expect(() =>
      rewriteTerminalStreamUrlToLocalApi(
        "wss://relay.example/ws/terminal/term-1",
        api,
      ),
    ).toThrow("loopback");
  });

  it("rejects non-terminal paths", () => {
    expect(() =>
      rewriteTerminalStreamUrlToLocalApi("ws://127.0.0.1:30303/ws", api),
    ).toThrow("/ws/terminal/");
  });
});

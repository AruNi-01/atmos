import { describe, expect, it } from "bun:test";

import {
  createTerminalStreamHub,
  type SidecarWebSocket,
  type TerminalStreamEvent,
} from "./stream-hub.ts";

class FakeSidecarSocket implements SidecarWebSocket {
  static instances: FakeSidecarSocket[] = [];
  binaryType = "blob";
  readyState = 0;
  sent: Array<string | ArrayBufferLike> = [];
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(public url: string) {
    FakeSidecarSocket.instances.push(this);
  }

  send(data: string | ArrayBufferLike): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.(null);
  }

  openNow(): void {
    this.readyState = 1;
    this.onopen?.(null);
  }
}

describe("createTerminalStreamHub", () => {
  it("rewrites to the sidecar, forwards binary, and isolates senders", async () => {
    FakeSidecarSocket.instances = [];
    const events: TerminalStreamEvent[] = [];
    const hub = createTerminalStreamHub({
      getApi: () => ({ host: "127.0.0.1", port: 30303 }),
      WebSocketImpl: FakeSidecarSocket,
    });
    const sink = {
      id: 7,
      send(event: TerminalStreamEvent) {
        events.push(event);
      },
    };

    const { streamId } = await hub.open(
      sink,
      "ws://localhost:1/ws/terminal/abc?workspace_id=w",
    );
    expect(FakeSidecarSocket.instances[0]?.url).toBe(
      "ws://127.0.0.1:30303/ws/terminal/abc?workspace_id=w",
    );
    expect(FakeSidecarSocket.instances[0]?.binaryType).toBe("arraybuffer");

    FakeSidecarSocket.instances[0]?.openNow();
    expect(events.some((e) => e.type === "open" && e.streamId === streamId)).toBe(
      true,
    );

    FakeSidecarSocket.instances[0]?.onmessage?.({
      data: new Uint8Array([9, 8, 7]),
    });
    const binary = events.find(
      (e) => e.type === "message" && e.kind === "binary",
    );
    expect(binary?.type === "message" && binary.kind === "binary").toBe(true);

    hub.send(7, streamId, "json-frame");
    expect(FakeSidecarSocket.instances[0]?.sent).toEqual(["json-frame"]);

    hub.send(99, streamId, "nope");
    expect(FakeSidecarSocket.instances[0]?.sent).toEqual(["json-frame"]);

    hub.closeAllForSender(7);
    expect(hub.size()).toBe(0);
  });

  it("rejects open when the API is not ready", async () => {
    const hub = createTerminalStreamHub({
      getApi: () => null,
      WebSocketImpl: FakeSidecarSocket,
    });
    await expect(
      hub.open(
        { id: 1, send() {} },
        "ws://127.0.0.1:30303/ws/terminal/t",
      ),
    ).rejects.toThrow("API not ready");
  });
});

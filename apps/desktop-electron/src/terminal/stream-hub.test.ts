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
    queueMicrotask(() => this.completeConnect());
  }

  protected completeConnect(): void {
    this.readyState = 1;
    this.onopen?.(null);
  }

  send(data: string | ArrayBufferLike): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  emit(data: unknown): void {
    this.onmessage?.({ data });
  }
}

class UnixFailsThenTcpOpens extends FakeSidecarSocket {
  protected completeConnect(): void {
    if (this.url.startsWith("ws+unix:")) {
      this.readyState = 3;
      this.onerror?.(null);
      return;
    }
    super.completeConnect();
  }
}

describe("createTerminalStreamHub", () => {
  it("rewrites to the sidecar, forwards binary, and isolates senders", async () => {
    FakeSidecarSocket.instances = [];
    const events: TerminalStreamEvent[] = [];
    const hub = createTerminalStreamHub({
      getApi: () => ({ host: "127.0.0.1", port: 30303 }),
      WebSocketImpl: FakeSidecarSocket,
      unixSocketExists: () => true,
    });
    const sink = {
      id: 7,
      send(event: TerminalStreamEvent) {
        events.push(event);
      },
    };

    const { streamId, sidecar } = await hub.open(
      sink,
      "ws://localhost:1/ws/terminal/abc?workspace_id=w",
    );
    expect(sidecar).toBe("ws");
    expect(FakeSidecarSocket.instances[0]?.url).toBe(
      "ws://127.0.0.1:30303/ws/terminal/abc?workspace_id=w",
    );
    expect(FakeSidecarSocket.instances[0]?.binaryType).toBe("arraybuffer");
    expect(events.some((e) => e.type === "open" && e.streamId === streamId)).toBe(
      true,
    );

    FakeSidecarSocket.instances[0]?.emit(new Uint8Array([9, 8, 7]));
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

  it("prefers unix sidecar when the API advertises a socket", async () => {
    FakeSidecarSocket.instances = [];
    const hub = createTerminalStreamHub({
      getApi: () => ({
        host: "127.0.0.1",
        port: 30303,
        unixSocket: "/tmp/api.sock",
      }),
      WebSocketImpl: FakeSidecarSocket,
      unixSocketExists: () => true,
    });
    const { sidecar } = await hub.open(
      { id: 1, send() {} },
      "ws://127.0.0.1:9/ws/terminal/t1",
    );
    expect(sidecar).toBe("uds");
    expect(FakeSidecarSocket.instances[0]?.url).toBe(
      "ws+unix:///tmp/api.sock:/ws/terminal/t1",
    );
  });

  it("falls back to loopback WS when unix connect fails", async () => {
    FakeSidecarSocket.instances = [];
    const hub = createTerminalStreamHub({
      getApi: () => ({
        host: "127.0.0.1",
        port: 30303,
        unixSocket: "/tmp/missing.sock",
      }),
      WebSocketImpl: UnixFailsThenTcpOpens,
      unixSocketExists: () => true,
    });
    const { sidecar } = await hub.open(
      { id: 1, send() {} },
      "ws://127.0.0.1:9/ws/terminal/t1",
    );
    expect(sidecar).toBe("ws");
    expect(FakeSidecarSocket.instances.map((socket) => socket.url)).toEqual([
      "ws+unix:///tmp/missing.sock:/ws/terminal/t1",
      "ws://127.0.0.1:30303/ws/terminal/t1",
    ]);
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

  it("skips unix sidecar when the socket file is missing", async () => {
    FakeSidecarSocket.instances = [];
    const hub = createTerminalStreamHub({
      getApi: () => ({
        host: "127.0.0.1",
        port: 30303,
        unixSocket: "/tmp/missing.sock",
      }),
      WebSocketImpl: FakeSidecarSocket,
      unixSocketExists: () => false,
    });
    const { sidecar } = await hub.open(
      { id: 1, send() {} },
      "ws://127.0.0.1:9/ws/terminal/t1",
    );
    expect(sidecar).toBe("ws");
    expect(FakeSidecarSocket.instances.map((socket) => socket.url)).toEqual([
      "ws://127.0.0.1:30303/ws/terminal/t1",
    ]);
  });

  it("does not retry a unix path after connect failure", async () => {
    FakeSidecarSocket.instances = [];
    const hub = createTerminalStreamHub({
      getApi: () => ({
        host: "127.0.0.1",
        port: 30303,
        unixSocket: "/tmp/missing.sock",
      }),
      WebSocketImpl: UnixFailsThenTcpOpens,
      unixSocketExists: () => true,
    });
    await hub.open({ id: 1, send() {} }, "ws://127.0.0.1:9/ws/terminal/t1");
    FakeSidecarSocket.instances = [];
    const { sidecar } = await hub.open(
      { id: 2, send() {} },
      "ws://127.0.0.1:9/ws/terminal/t2",
    );
    expect(sidecar).toBe("ws");
    expect(FakeSidecarSocket.instances.map((socket) => socket.url)).toEqual([
      "ws://127.0.0.1:30303/ws/terminal/t2",
    ]);
  });

  it("drops an in-flight open when the sender is destroyed", async () => {
    FakeSidecarSocket.instances = [];
    class SlowOpenSocket extends FakeSidecarSocket {
      protected completeConnect(): void {
        setTimeout(() => super.completeConnect(), 40);
      }
    }
    const hub = createTerminalStreamHub({
      getApi: () => ({ host: "127.0.0.1", port: 30303 }),
      WebSocketImpl: SlowOpenSocket,
    });
    const openPromise = hub.open(
      { id: 7, send() {} },
      "ws://127.0.0.1:9/ws/terminal/t1",
    );
    hub.closeAllForSender(7);
    await expect(openPromise).rejects.toThrow("sender destroyed");
    expect(hub.size()).toBe(0);
    expect(FakeSidecarSocket.instances[0]?.readyState).toBe(3);
  });
});

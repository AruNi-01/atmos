import { describe, expect, test } from "bun:test";

import type { WebSocketLike } from "./websocket-byte-stream-port";
import { createWebSocketByteStreamPort } from "./websocket-byte-stream-port";

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  binaryType = "blob";
  readyState = 0;
  sent: Array<string | ArrayBufferLike> = [];
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
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

  emit(data: unknown): void {
    this.onmessage?.({ data });
  }
}

describe("createWebSocketByteStreamPort", () => {
  test("sends text after open and delivers binary output", async () => {
    FakeWebSocket.instances = [];
    const port = createWebSocketByteStreamPort(FakeWebSocket);
    const handle = await port.open({
      url: "ws://127.0.0.1:30303/ws/terminal/t1",
      sessionId: "t1",
    });
    expect(port.carrier).toBe("ws");
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.binaryType).toBe("arraybuffer");

    const received: Uint8Array[] = [];
    const control: string[] = [];
    let opened = false;
    handle.subscribe({
      onOpen: () => {
        opened = true;
      },
      onBytes: (data) => {
        received.push(data);
      },
      onControl: (json) => {
        control.push(json);
      },
    });

    handle.control.send("too-early");
    expect(FakeWebSocket.instances[0]?.sent).toEqual([]);

    FakeWebSocket.instances[0]?.openNow();
    expect(opened).toBe(true);
    expect(handle.readyState()).toBe("open");

    handle.control.send(JSON.stringify({ type: "terminal_resize", cols: 80, rows: 24 }));
    handle.bytes.send(new Uint8Array([3, 0, 4]));
    expect(FakeWebSocket.instances[0]?.sent).toHaveLength(2);
    expect(FakeWebSocket.instances[0]?.sent[0]).toContain("terminal_resize");
    expect(FakeWebSocket.instances[0]?.sent[1]).toBeInstanceOf(ArrayBuffer);

    FakeWebSocket.instances[0]?.emit(new Uint8Array([65, 66]));
    expect(received).toHaveLength(1);
    expect(Array.from(received[0] as Uint8Array)).toEqual([65, 66]);
  });

  test("replays onOpen when subscribe happens after the socket is already open", async () => {
    FakeWebSocket.instances = [];
    const port = createWebSocketByteStreamPort(FakeWebSocket);
    const handle = await port.open({
      url: "ws://127.0.0.1:1/ws/terminal/t1",
      sessionId: "t1",
    });
    FakeWebSocket.instances[0]?.openNow();
    let opened = false;
    handle.subscribe({
      onOpen: () => {
        opened = true;
      },
    });
    expect(opened).toBe(true);
  });
});

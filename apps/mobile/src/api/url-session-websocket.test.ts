// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { UrlSessionWebSocket } from "./url-session-websocket";

type SocketEvent = {
  code?: number;
  data?: string;
  message?: string;
  reason?: string;
  wasClean?: boolean;
};

class FakeNativeSocket {
  static instances: FakeNativeSocket[] = [];

  listeners = new Map<string, Array<(payload: SocketEvent) => void>>();
  connectCalls: string[] = [];
  closes: Array<{ code: number; reason: string }> = [];
  released = false;
  sent: string[] = [];

  constructor() {
    FakeNativeSocket.instances.push(this);
  }

  addListener(event: string, listener: (payload: SocketEvent) => void) {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return { remove: () => {} };
  }

  connect(url: string) {
    this.connectCalls.push(url);
  }

  send(text: string) {
    this.sent.push(text);
  }

  close(code: number, reason: string) {
    this.closes.push({ code, reason });
  }

  release() {
    this.released = true;
  }

  emit(event: string, payload: SocketEvent = {}) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

const nativeModule = {
  AtmosUrlSessionSocket: FakeNativeSocket,
};

describe("UrlSessionWebSocket", () => {
  test("connects after the caller can assign handlers", async () => {
    FakeNativeSocket.instances = [];
    const socket = new UrlSessionWebSocket("wss://relay.example/ws/client?token=secret", nativeModule);
    const native = FakeNativeSocket.instances[0]!;
    expect(native.connectCalls).toEqual([]);
    await Promise.resolve();
    expect(native.connectCalls).toEqual(["wss://relay.example/ws/client?token=secret"]);

    let opened = false;
    socket.onopen = () => {
      opened = true;
    };
    native.emit("open");
    expect(opened).toBe(true);
    expect(socket.readyState).toBe(1);
  });

  test("does not connect after close", async () => {
    FakeNativeSocket.instances = [];
    const socket = new UrlSessionWebSocket("wss://relay.example/ws/client", nativeModule);
    socket.close(1000, "client disconnect");
    await Promise.resolve();
    expect(FakeNativeSocket.instances[0]!.connectCalls).toEqual([]);
  });

  test("forwards the native close and error text", () => {
    FakeNativeSocket.instances = [];
    const socket = new UrlSessionWebSocket("wss://relay.example/ws/client", nativeModule);
    const native = FakeNativeSocket.instances[0]!;
    const errors: SocketEvent[] = [];
    const closes: SocketEvent[] = [];
    socket.onerror = (event) => {
      if (event) errors.push(event);
    };
    socket.onclose = (event) => {
      if (event) closes.push(event);
    };

    native.emit("error", { message: "timed out" });
    native.emit("close", { code: 1006, reason: "timed out", wasClean: false });

    expect(errors).toEqual([{ message: "timed out" }]);
    expect(closes).toEqual([{ code: 1006, reason: "timed out", wasClean: false }]);
    expect(socket.readyState).toBe(3);
    expect(native.released).toBe(true);
  });
});

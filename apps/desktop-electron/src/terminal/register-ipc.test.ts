import { EventEmitter } from "node:events";
import { describe, expect, it } from "bun:test";
import type { IpcMain } from "electron";

import { registerTerminalStreamIpc } from "./register-ipc.ts";
import type { TerminalStreamHub } from "./stream-hub.ts";

function createFakeIpc() {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
  return {
    removeHandler() {},
    removeAllListeners() {},
    handle(channel: string, fn: (event: unknown, payload: unknown) => unknown) {
      handlers.set(channel, fn);
    },
    on() {},
    async invoke(channel: string, event: unknown, payload: unknown) {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`no handler ${channel}`);
      return fn(event, payload);
    },
  };
}

function createFakeHub(): TerminalStreamHub & { closedSenders: number[] } {
  const closedSenders: number[] = [];
  return {
    closedSenders,
    async open(sink) {
      return { streamId: `s-${sink.id}`, sidecar: "ws" };
    },
    send() {},
    close() {},
    closeAllForSender(senderId) {
      closedSenders.push(senderId);
    },
    size() {
      return 0;
    },
  };
}

class FakeSender extends EventEmitter {
  id = 42;
  isDestroyed() {
    return false;
  }
  send() {}
}

describe("registerTerminalStreamIpc", () => {
  it("wires sender destroyed once across many stream opens", async () => {
    const ipc = createFakeIpc();
    const hub = createFakeHub();
    registerTerminalStreamIpc(ipc as unknown as IpcMain, {} as never, hub);
    const sender = new FakeSender();

    for (let i = 0; i < 12; i++) {
      await ipc.invoke(
        "atmos:terminal-stream-open",
        { sender },
        { url: "ws://127.0.0.1/ws/terminal/x" },
      );
    }

    expect(sender.listenerCount("destroyed")).toBe(1);
    sender.emit("destroyed");
    expect(hub.closedSenders).toEqual([42]);
  });
});

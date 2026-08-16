import { afterEach, describe, expect, test } from "bun:test";

import type { DesktopTerminalStreamApi } from "@/shared/lib/desktop-bridge";
import {
  __resetDesktopIpcByteStreamBusForTests,
  createDesktopIpcByteStreamPort,
} from "./desktop-ipc-byte-stream-port";

afterEach(() => {
  __resetDesktopIpcByteStreamBusForTests();
});

describe("createDesktopIpcByteStreamPort", () => {
  test("buffers open/data that arrive during invoke, then sends binary", async () => {
    const sent: Array<{ streamId: string; data: ArrayBuffer | string }> = [];
    const handlers = new Map<string, Array<(payload: unknown) => void>>();
    const api: DesktopTerminalStreamApi = {
      async open(url) {
        expect(url).toContain("/ws/terminal/t1");
        const streamId = "stream-1";
        for (const handler of handlers.get("terminal_stream_open") ?? []) {
          handler({ streamId });
        }
        for (const handler of handlers.get("terminal_stream_message") ?? []) {
          handler({
            streamId,
            kind: "binary",
            bytes: new Uint8Array([1, 2]).buffer,
          });
        }
        return { streamId };
      },
      send(streamId, data) {
        sent.push({ streamId, data });
      },
      close() {},
    };

    const port = createDesktopIpcByteStreamPort(api, (event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((h) => h !== handler),
        );
      };
    });

    const handle = await port.open({
      url: "ws://127.0.0.1:30303/ws/terminal/t1",
      sessionId: "t1",
    });
    expect(port.carrier).toBe("ipc");

    const messages: Array<string | Uint8Array> = [];
    let opened = false;
    handle.subscribe({
      onOpen: () => {
        opened = true;
      },
      onMessage: (data) => {
        messages.push(data);
      },
    });

    expect(opened).toBe(true);
    expect(handle.readyState()).toBe("open");
    expect(messages).toHaveLength(1);
    expect(Array.from(messages[0] as Uint8Array)).toEqual([1, 2]);

    handle.send("{\"type\":\"terminal_input\"}");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.data).toBe("{\"type\":\"terminal_input\"}");
  });
});

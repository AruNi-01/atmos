import { describe, expect, test } from "bun:test";

import {
  formatTerminalCarrierLog,
  isLoopbackHostname,
  isLoopbackWebSocketUrl,
  resolveTerminalByteStreamCarrier,
} from "./byte-stream-port";
import { createMemoryByteStreamPort } from "./memory-byte-stream-port";

describe("isLoopbackHostname", () => {
  test("accepts loopback names", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("LOCALHOST")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
  });

  test("rejects non-loopback hosts", () => {
    expect(isLoopbackHostname("example.com")).toBe(false);
    expect(isLoopbackHostname("10.0.0.2")).toBe(false);
    expect(isLoopbackHostname("app.atmos.land")).toBe(false);
  });
});

describe("isLoopbackWebSocketUrl", () => {
  test("accepts loopback ws/wss", () => {
    expect(
      isLoopbackWebSocketUrl("ws://127.0.0.1:30303/ws/terminal/t1"),
    ).toBe(true);
    expect(
      isLoopbackWebSocketUrl("wss://localhost/ws/terminal/t1?workspace_id=w"),
    ).toBe(true);
  });

  test("rejects remote and non-ws urls", () => {
    expect(
      isLoopbackWebSocketUrl("wss://relay.example/ws/terminal/t1"),
    ).toBe(false);
    expect(isLoopbackWebSocketUrl("http://127.0.0.1:30303/ws/terminal/t1")).toBe(
      false,
    );
    expect(isLoopbackWebSocketUrl("not a url")).toBe(false);
  });
});

describe("resolveTerminalByteStreamCarrier", () => {
  const loopback = "ws://127.0.0.1:30303/ws/terminal/t1?workspace_id=w";
  const remote = "wss://relay.example/ws/terminal/t1";

  test("uses ipc only for electron + bridge + loopback", () => {
    expect(
      resolveTerminalByteStreamCarrier({
        electronShell: true,
        hasIpcBridge: true,
        url: loopback,
      }),
    ).toBe("ipc");
  });

  test("keeps ws for browser even on loopback", () => {
    expect(
      resolveTerminalByteStreamCarrier({
        electronShell: false,
        hasIpcBridge: false,
        url: loopback,
      }),
    ).toBe("ws");
  });

  test("keeps ws for desktop remote / relay urls", () => {
    expect(
      resolveTerminalByteStreamCarrier({
        electronShell: true,
        hasIpcBridge: true,
        url: remote,
      }),
    ).toBe("ws");
  });

  test("keeps ws when electron has no IPC stream bridge", () => {
    expect(
      resolveTerminalByteStreamCarrier({
        electronShell: true,
        hasIpcBridge: false,
        url: loopback,
      }),
    ).toBe("ws");
  });
});

describe("createMemoryByteStreamPort", () => {
  test("replays open and forwards duplex messages", async () => {
    const memory = createMemoryByteStreamPort();
    const handle = await memory.port.open({
      url: "memory://t1",
      sessionId: "t1",
    });
    const messages: Uint8Array[] = [];
    let opened = 0;
    handle.subscribe({
      onOpen: () => {
        opened += 1;
      },
      onBytes: (data) => {
        messages.push(data);
      },
    });
    memory.openNow();
    expect(opened).toBe(1);
    expect(handle.readyState()).toBe("open");

    handle.control.send("hello");
    expect(memory.takeSentControl()).toEqual(["hello"]);
    handle.bytes.send(new Uint8Array([9]));
    expect(Array.from(memory.takeSentBytes()[0] ?? [])).toEqual([9]);

    memory.push(new Uint8Array([1, 2, 3]));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBeInstanceOf(Uint8Array);
  });
});

describe("formatTerminalCarrierLog", () => {
  test("includes sidecar for desktop ipc hops", () => {
    expect(
      formatTerminalCarrierLog({ carrier: "ipc", sidecar: "uds" }),
    ).toBe("carrier=ipc sidecar=uds");
    expect(formatTerminalCarrierLog({ carrier: "ws" })).toBe("carrier=ws");
  });
});

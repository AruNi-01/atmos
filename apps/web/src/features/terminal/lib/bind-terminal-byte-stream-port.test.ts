import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { __setDesktopBridgeAdaptersForTests } from "@/shared/lib/desktop-bridge";
import { createBoundTerminalByteStreamPort } from "./bind-terminal-byte-stream-port";

describe("createBoundTerminalByteStreamPort", () => {
  test("uses WebSocket in a plain browser", () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    const win = new Window({ url: "http://127.0.0.1:3030/" });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: win,
      writable: true,
    });
    __setDesktopBridgeAdaptersForTests(null);
    try {
      const port = createBoundTerminalByteStreamPort(
        "ws://127.0.0.1:30303/ws/terminal/t1",
      );
      expect(port.carrier).toBe("ws");
    } finally {
      __setDesktopBridgeAdaptersForTests(null);
      if (previous) {
        Object.defineProperty(globalThis, "window", previous);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  test("uses ipc in electron with a terminalStream bridge on loopback", () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    const win = new Window({ url: "http://127.0.0.1:30303/" });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: win,
      writable: true,
    });
    (
      win as unknown as {
        __ATMOS_DESKTOP__: {
          shell: "electron";
          invoke: () => Promise<unknown>;
          terminalStream: {
            open: () => Promise<{ streamId: string }>;
            send: () => void;
            close: () => void;
          };
        };
      }
    ).__ATMOS_DESKTOP__ = {
      shell: "electron",
      invoke: async () => ({}),
      terminalStream: {
        open: async () => ({ streamId: "s" }),
        send: () => {},
        close: () => {},
      },
    };
    try {
      const port = createBoundTerminalByteStreamPort(
        "ws://127.0.0.1:30303/ws/terminal/t1",
      );
      expect(port.carrier).toBe("ipc");
    } finally {
      if (previous) {
        Object.defineProperty(globalThis, "window", previous);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  test("keeps ws for electron remote relay urls", () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    const win = new Window({ url: "http://127.0.0.1:30303/" });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: win,
      writable: true,
    });
    (
      win as unknown as {
        __ATMOS_DESKTOP__: {
          shell: "electron";
          invoke: () => Promise<unknown>;
          terminalStream: {
            open: () => Promise<{ streamId: string }>;
            send: () => void;
            close: () => void;
          };
        };
      }
    ).__ATMOS_DESKTOP__ = {
      shell: "electron",
      invoke: async () => ({}),
      terminalStream: {
        open: async () => ({ streamId: "s" }),
        send: () => {},
        close: () => {},
      },
    };
    try {
      const port = createBoundTerminalByteStreamPort(
        "wss://relay.example/ws/terminal/t1",
      );
      expect(port.carrier).toBe("ws");
    } finally {
      if (previous) {
        Object.defineProperty(globalThis, "window", previous);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});

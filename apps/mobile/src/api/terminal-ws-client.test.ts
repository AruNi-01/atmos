// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  decodeB64Std,
  decodeB64Url,
  deriveRelayHttpE2eeKey,
  encodeB64Url,
  frameAad,
  generateX25519KeyPair,
  openRecord,
  RELAY_E2EE_ALG,
} from "@atmos/relay-client";
import { TerminalWsClient, type TerminalWsState } from "./terminal-ws-client";

type TimerCall = {
  callback: () => void;
  delayMs: number;
};

class FakeTerminalWebSocket {
  static instances: FakeTerminalWebSocket[] = [];

  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeTerminalWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  closeFromServer() {
    this.close();
  }

  send(data: string) {
    this.sent.push(data);
  }
}

describe("TerminalWsClient", () => {
  test("reconnects with backoff after a server-side close", () => {
    const timers: TimerCall[] = [];
    FakeTerminalWebSocket.instances = [];
    const states: TerminalWsState[] = [];
    let openCount = 0;

    const client = new TerminalWsClient("wss://relay.example/ws/terminal", {
      WebSocketCtor: FakeTerminalWebSocket,
      clearTimeout: () => {},
      reconnectInitialDelayMs: 100,
      reconnectMaxDelayMs: 1_000,
      setTimeout: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
    });

    client.onState((state) => states.push(state));
    client.onOpen(() => {
      openCount += 1;
    });

    client.connect();
    expect(FakeTerminalWebSocket.instances).toHaveLength(1);
    FakeTerminalWebSocket.instances[0]!.open();
    expect(openCount).toBe(1);

    FakeTerminalWebSocket.instances[0]!.closeFromServer();
    expect(timers.map((timer) => timer.delayMs)).toEqual([100]);
    expect(states).toContain("reconnecting");

    timers[0]!.callback();
    expect(FakeTerminalWebSocket.instances).toHaveLength(2);
    FakeTerminalWebSocket.instances[1]!.open();
    expect(openCount).toBe(2);
    expect(client.isOpen()).toBe(true);
  });

  test("does not reconnect after an intentional close", () => {
    const timers: TimerCall[] = [];
    FakeTerminalWebSocket.instances = [];
    const client = new TerminalWsClient("wss://relay.example/ws/terminal", {
      WebSocketCtor: FakeTerminalWebSocket,
      clearTimeout: () => {},
      setTimeout: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
    });

    client.connect();
    FakeTerminalWebSocket.instances[0]!.open();
    client.close();

    expect(timers).toHaveLength(0);
    expect(client.isOpen()).toBe(false);
  });

  test("does not reconnect after terminal_error (attach exhausted)", () => {
    const timers: TimerCall[] = [];
    FakeTerminalWebSocket.instances = [];
    const errors: string[] = [];
    const states: TerminalWsState[] = [];

    const client = new TerminalWsClient("wss://relay.example/ws/terminal", {
      WebSocketCtor: FakeTerminalWebSocket,
      clearTimeout: () => {},
      reconnectInitialDelayMs: 100,
      reconnectMaxDelayMs: 1_000,
      setTimeout: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
    });

    client.onState((state) => states.push(state));
    client.onError((error) => errors.push(error));

    client.connect();
    FakeTerminalWebSocket.instances[0]!.open();
    FakeTerminalWebSocket.instances[0]!.onmessage?.({
      data: JSON.stringify({
        type: "terminal_error",
        session_id: "session",
        error: "Failed to attach existing terminal session after 3 attempts: not found",
      }),
    });
    FakeTerminalWebSocket.instances[0]!.closeFromServer();

    expect(errors).toContain(
      "Failed to attach existing terminal session after 3 attempts: not found",
    );
    expect(states).toContain("error");
    expect(timers).toHaveLength(0);
    expect(FakeTerminalWebSocket.instances).toHaveLength(1);
  });

  test("does not queue input while reconnecting", () => {
    const timers: TimerCall[] = [];
    FakeTerminalWebSocket.instances = [];
    const client = new TerminalWsClient("wss://relay.example/ws/terminal", {
      WebSocketCtor: FakeTerminalWebSocket,
      clearTimeout: () => {},
      setTimeout: (callback, delayMs) => {
        timers.push({ callback, delayMs });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
    });

    client.connect();
    FakeTerminalWebSocket.instances[0]!.open();
    FakeTerminalWebSocket.instances[0]!.closeFromServer();

    expect(() =>
      client.send({
        type: "terminal_input",
        session_id: "session",
        data: "x",
      }),
    ).toThrow("Terminal WebSocket is not connected");
    expect(FakeTerminalWebSocket.instances[0]!.sent).toEqual([]);
    expect(timers).toHaveLength(1);
  });

  test("seals terminal frames when hop E2EE is offered", () => {
    FakeTerminalWebSocket.instances = [];
    const computer = generateX25519KeyPair();
    const pk = encodeB64Url(computer.publicKey);
    const client = new TerminalWsClient("wss://relay.example/ws/terminal", {
      WebSocketCtor: FakeTerminalWebSocket,
      clearTimeout: () => {},
      e2ee: { enabled: true, alg: RELAY_E2EE_ALG, static_pk: pk },
      reconnect: false,
      setTimeout: (callback, delayMs) => {
        void callback;
        void delayMs;
        return 0 as unknown as ReturnType<typeof setTimeout>;
      },
    });

    client.connect();
    const raw = FakeTerminalWebSocket.instances[0]!;
    expect(raw.url).toContain("e2ee=1");
    expect(raw.url).toContain("e2ee_alg=x25519-chacha20poly1305");
    expect(raw.url).toContain("eph_pk=");
    raw.open();
    client.send({
      type: "terminal_input",
      session_id: "session",
      data: "hello-plain",
    });
    expect(raw.sent).toHaveLength(1);
    expect(raw.sent[0]).not.toContain("hello-plain");
    const ephPk = new URL(raw.url).searchParams.get("eph_pk");
    expect(ephPk).toBeTruthy();
    const key = deriveRelayHttpE2eeKey({
      localSecret: computer.secretKey,
      peerPublic: decodeB64Url(ephPk!),
      ephPublic: decodeB64Url(ephPk!),
      staticPublic: computer.publicKey,
    });
    const opened = new TextDecoder().decode(
      openRecord(key, frameAad(ephPk!, "terminal", 0, "frame_c2s"), decodeB64Std(raw.sent[0]!)),
    );
    expect(JSON.parse(opened)).toEqual({
      type: "terminal_input",
      session_id: "session",
      data: "hello-plain",
    });
    client.close();
  });
});

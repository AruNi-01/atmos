// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { MobileWsClient, type MobileWsState } from "./mobile-ws-client";

type TimerCall = {
  callback: () => void;
  delayMs: number;
};

class FakeMobileWebSocket {
  static instances: FakeMobileWebSocket[] = [];

  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeMobileWebSocket.instances.push(this);
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

function createClient({
  maxReconnectAttempts = 5,
  timers,
}: {
  maxReconnectAttempts?: number;
  timers: TimerCall[];
}) {
  return new MobileWsClient("wss://relay.example/ws/client", {
    WebSocketCtor: FakeMobileWebSocket,
    clearTimeout: () => {},
    maxReconnectAttempts,
    reconnectInitialDelayMs: 100,
    reconnectMaxDelayMs: 1_000,
    setTimeout: (callback, delayMs) => {
      timers.push({ callback, delayMs });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
  });
}

describe("MobileWsClient", () => {
  test("reconnects with backoff after a server-side close", () => {
    const timers: TimerCall[] = [];
    const states: MobileWsState[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ timers });

    client.subscribeState((state) => states.push(state));
    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    FakeMobileWebSocket.instances[0]!.closeFromServer();

    expect(timers.map((timer) => timer.delayMs)).toEqual([100]);
    expect(states).toContain("reconnecting");

    timers[0]!.callback();
    expect(FakeMobileWebSocket.instances).toHaveLength(2);
    FakeMobileWebSocket.instances[1]!.open();
    expect(client.state).toBe("open");
  });

  test("stops reconnecting after the configured attempt limit", () => {
    const timers: TimerCall[] = [];
    const states: MobileWsState[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ maxReconnectAttempts: 1, timers });

    client.subscribeState((state) => states.push(state));
    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    FakeMobileWebSocket.instances[0]!.closeFromServer();
    timers[0]!.callback();
    FakeMobileWebSocket.instances[1]!.closeFromServer();

    expect(client.state).toBe("closed");
    expect(states.at(-1)).toBe("closed");
  });

  test("does not reconnect after an intentional close", () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ timers });

    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    client.close();

    expect(timers).toHaveLength(0);
    expect(client.state).toBe("closed");
  });

  test("rejects requests while reconnecting instead of queueing them", async () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ timers });

    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    FakeMobileWebSocket.instances[0]!.closeFromServer();

    await expect(client.request("project_workspace_bootstrap")).rejects.toThrow(
      "Atmos mobile WebSocket is not connected",
    );
    expect(FakeMobileWebSocket.instances[0]!.sent).toEqual([]);
  });
});

// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { MobileWsClient, type MobileWsState } from "./mobile-ws-client";

type TimerCall = {
  callback: () => void;
  delayMs: number;
};

class FakeMobileWebSocket {
  static instances: FakeMobileWebSocket[] = [];

  onclose: ((event?: { code?: number; reason?: string; wasClean?: boolean }) => void) | null = null;
  onerror: ((event?: { message?: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  pingWaiters: Array<(error?: Error) => void> = [];
  throwOnSend: Error | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeMobileWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  close(code?: number, reason = "") {
    this.readyState = 3;
    const resolved = code ?? 1006;
    this.onclose?.({ code: resolved, reason, wasClean: resolved === 1000 });
  }

  closeFromServer() {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: "drop", wasClean: false });
  }

  send(data: string) {
    if (this.throwOnSend) throw this.throwOnSend;
    this.sent.push(data);
  }

  ping(onPong: (error?: Error) => void) {
    this.pingWaiters.push(onPong);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
}

function createClient({
  heartbeatIntervalMs = 0,
  heartbeatTimeoutMs = 10,
  maxReconnectAttempts = 5,
  reconnect,
  requestTimeoutMs,
  timers,
}: {
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maxReconnectAttempts?: number;
  reconnect?: boolean;
  requestTimeoutMs?: number;
  timers: TimerCall[];
}) {
  const byId = new Map<number, TimerCall>();
  let nextId = 1;
  return new MobileWsClient("wss://relay.example/ws/client", {
    WebSocketCtor: FakeMobileWebSocket,
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
    requestTimeoutMs,
    clearTimeout: (id) => {
      const key = id as unknown as number;
      const entry = byId.get(key);
      if (!entry) return;
      byId.delete(key);
      const idx = timers.indexOf(entry);
      if (idx >= 0) timers.splice(idx, 1);
    },
    maxReconnectAttempts,
    reconnect,
    reconnectInitialDelayMs: 100,
    reconnectMaxDelayMs: 1_000,
    setTimeout: (callback, delayMs) => {
      const entry = { callback, delayMs };
      const id = nextId++;
      byId.set(id, entry);
      timers.push(entry);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
  });
}

function lastRequest(socket: FakeMobileWebSocket) {
  const raw = socket.sent.at(-1);
  if (!raw) throw new Error("no request sent");
  return JSON.parse(raw) as {
    type: string;
    payload: { request_id: string; action: string; data?: Record<string, unknown> };
  };
}

function replyOk(socket: FakeMobileWebSocket, data: unknown = {}) {
  const sent = lastRequest(socket);
  socket.emit({
    type: "response",
    payload: {
      request_id: sent.payload.request_id,
      success: true,
      data,
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

  test("slow-retries after the fast attempt limit instead of giving up", () => {
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

    expect(client.state).toBe("reconnecting");
    const slowRetry = timers.find((timer) => timer.delayMs === 60_000);
    expect(slowRetry).toBeDefined();
    slowRetry!.callback();
    expect(FakeMobileWebSocket.instances).toHaveLength(3);
    FakeMobileWebSocket.instances[2]!.open();
    expect(client.state).toBe("open");
  });

  test("retries a failed first handshake and keeps the socket error", () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ timers });

    client.connect();
    FakeMobileWebSocket.instances[0]!.onerror?.({ message: "timed out" });

    expect(client.lastFailure).toBe("timed out");
    expect(client.state).toBe("reconnecting");
    expect(timers.map((timer) => timer.delayMs)).toEqual([100]);
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

  test("times out an unanswered request so in-flight keys can release", async () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ requestTimeoutMs: 40, timers });

    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    const pending = client.request("agent_chat_backfill", {
      chat_id: "chat-1",
      parts: [{ part_id: "part-1", from_offset: 0 }],
    });
    const timeout = timers.find((timer) => timer.delayMs === 40);
    expect(timeout).toBeDefined();
    timeout!.callback();
    await expect(pending).rejects.toThrow(/timeout: agent_chat_backfill/);
  });

  test("send failures reject the request so the UI can show them", async () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ timers });

    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    FakeMobileWebSocket.instances[0]!.throwOnSend = new Error("socket write failed");
    await expect(
      client.request("agent_chat_send", { chat_id: "chat-1", text: "hi" }),
    ).rejects.toThrow("socket write failed");
    expect(client.lastFailure).toBe("socket write failed");
    expect(client.state).toBe("open");
  });

  test("relay_ctrl resubscribes from the current cursor without dropping the socket", async () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const alerts: Array<string | null> = [];
    const client = createClient({ timers });
    client.subscribeAlerts((alert) => alerts.push(alert));

    client.connect();
    const socket = FakeMobileWebSocket.instances[0]!;
    socket.open();
    expect(client.state).toBe("open");

    const subscribed = client.request("agent_chat_subscribe", {
      chat_id: "chat-1",
      after_sequence: 10,
    });
    replyOk(socket, { last_event_seq: 10 });
    await subscribed;

    socket.emit({
      type: "notification",
      payload: {
        event: "agent_chat_event",
        data: {
          chat_id: "chat-1",
          event_id: "e-12",
          revision: 12,
          payload: { type: "text_delta" },
        },
      },
    });

    socket.emit({ type: "relay_ctrl", code: "server_offline" });
    expect(client.state).toBe("open");
    expect(FakeMobileWebSocket.instances).toHaveLength(1);
    expect(alerts).toContain("Atmos Computer went offline. Catching up this chat.");

    const retry = timers.find((timer) => timer.delayMs === 0);
    expect(retry).toBeDefined();
    const sentBefore = socket.sent.length;
    retry!.callback();
    expect(socket.sent.length).toBe(sentBefore + 1);
    expect(lastRequest(socket)).toMatchObject({
      payload: {
        action: "agent_chat_subscribe",
        data: { chat_id: "chat-1", after_sequence: 12 },
      },
    });
    replyOk(socket, { last_event_seq: 12 });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(client.transportAlert).toBeNull();
    expect(client.state).toBe("open");
  });

  test("AppState background pauses reconnect; foreground retries immediately", () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ timers });

    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    client.setForeground(false);
    FakeMobileWebSocket.instances[0]!.closeFromServer();

    expect(client.state).toBe("reconnecting");
    expect(timers).toHaveLength(0);
    expect(FakeMobileWebSocket.instances).toHaveLength(1);

    client.setForeground(true);
    expect(FakeMobileWebSocket.instances).toHaveLength(2);
    FakeMobileWebSocket.instances[1]!.open();
    expect(client.state).toBe("open");
  });

  test("network recovery retries a dropped socket", () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ timers });

    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    client.setNetworkOnline(false);
    FakeMobileWebSocket.instances[0]!.closeFromServer();
    expect(timers).toHaveLength(0);
    expect(client.transportAlert).toBe("No network connection.");

    client.setNetworkOnline(true);
    expect(FakeMobileWebSocket.instances).toHaveLength(2);
    FakeMobileWebSocket.instances[1]!.open();
    expect(client.state).toBe("open");
    expect(client.transportAlert).toBeNull();
  });

  test("heartbeat ping timeout reconnects through WsSession", () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({
      heartbeatIntervalMs: 40,
      heartbeatTimeoutMs: 10,
      timers,
    });

    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    const beat = timers.find((timer) => timer.delayMs === 40);
    expect(beat).toBeDefined();
    beat!.callback();
    expect(FakeMobileWebSocket.instances[0]!.pingWaiters).toHaveLength(1);
    const watchdog = timers.find((timer) => timer.delayMs === 10);
    expect(watchdog).toBeDefined();
    watchdog!.callback();
    expect(client.state).toBe("reconnecting");
    const reconnect = timers.find((timer) => timer.delayMs === 100);
    expect(reconnect).toBeDefined();
    reconnect!.callback();
    expect(FakeMobileWebSocket.instances).toHaveLength(2);
  });

  test("disabled reconnect maps a drop to closed instead of reconnecting", () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ reconnect: false, timers });

    client.connect();
    FakeMobileWebSocket.instances[0]!.open();
    FakeMobileWebSocket.instances[0]!.closeFromServer();

    expect(client.state).toBe("closed");
    expect(timers.filter((timer) => timer.delayMs === 100 || timer.delayMs === 60_000)).toEqual([]);
  });

  test("background pause cancels relay_ctrl resubscribe until foreground", async () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const client = createClient({ timers });
    client.connect();
    const socket = FakeMobileWebSocket.instances[0]!;
    socket.open();
    const subscribed = client.request("agent_chat_subscribe", {
      chat_id: "chat-1",
      after_sequence: 10,
    });
    replyOk(socket, { last_event_seq: 10 });
    await subscribed;

    socket.emit({ type: "relay_ctrl", code: "server_offline" });
    expect(timers.some((timer) => timer.delayMs === 0)).toBe(true);
    const sentBefore = socket.sent.length;
    client.setForeground(false);
    expect(timers.some((timer) => timer.delayMs === 0)).toBe(false);
    expect(socket.sent.length).toBe(sentBefore);

    client.setForeground(true);
    const retry = timers.find((timer) => timer.delayMs === 0);
    expect(retry).toBeDefined();
    retry!.callback();
    expect(lastRequest(socket).payload.action).toBe("agent_chat_subscribe");
  });

  test("resubscribe with a seq gap fetches a snapshot and emits agent_chat_resync", async () => {
    const timers: TimerCall[] = [];
    FakeMobileWebSocket.instances = [];
    const seen: unknown[] = [];
    const client = createClient({ timers });
    client.subscribeMessages((message) => seen.push(message));
    client.connect();
    const socket = FakeMobileWebSocket.instances[0]!;
    socket.open();
    const subscribed = client.request("agent_chat_subscribe", {
      chat_id: "chat-1",
      after_sequence: 10,
    });
    replyOk(socket, { last_event_seq: 10 });
    await subscribed;

    socket.emit({ type: "relay_ctrl", code: "server_offline" });
    const retry = timers.find((timer) => timer.delayMs === 0);
    expect(retry).toBeDefined();
    retry!.callback();
    await flushMicrotasks();
    expect(lastRequest(socket)).toMatchObject({
      payload: { action: "agent_chat_subscribe", data: { chat_id: "chat-1", after_sequence: 10 } },
    });
    const snapshot = {
      meta: { id: "chat-1", last_event_seq: 40 },
      messages: [{ id: "m-new", role: "assistant", parts: [{ type: "text", text: "caught up" }] }],
      queue: [],
      pending_permission: {
        request_id: "perm-1",
        tool: "edit",
        description: "edit file",
        status: "pending",
      },
    };
    replyOk(socket, { last_event_seq: 40 });
    await flushMicrotasks();
    expect(lastRequest(socket)).toMatchObject({
      payload: { action: "agent_chat_get", data: { chat_id: "chat-1" } },
    });
    replyOk(socket, snapshot);
    await flushMicrotasks();
    expect(seen.some((message) => isResync(message, "chat-1"))).toBe(true);
    expect(client.transportAlert).toBeNull();
    expect(client.state).toBe("open");
  });
});

function isResync(message: unknown, chatId: string) {
  if (!message || typeof message !== "object") return false;
  const record = message as { type?: unknown; chat_id?: unknown; snapshot?: unknown };
  return (
    record.type === "agent_chat_resync" && record.chat_id === chatId && record.snapshot != null
  );
}

async function flushMicrotasks() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

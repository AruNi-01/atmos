import { describe, expect, test } from "bun:test";
import { DEFAULT_MOBILE_RECONNECT, DEFAULT_WEB_RECONNECT } from "./defaults";
import { backoffDelayMs, redactUrl } from "./reconnect";
import { createWsSession } from "./session";
import type { WebSocketLike } from "../platform/types";

class MockSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  sent: string[] = [];
  pingWaiters: Array<(error?: Error) => void> = [];
  throwOnSend: Error | null = null;

  send(data: string) {
    if (this.throwOnSend) throw this.throwOnSend;
    this.sent.push(data);
  }

  ping(onPong: (error?: Error) => void) {
    this.pingWaiters.push(onPong);
  }

  close(code = 1000, reason = "close") {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }

  uncleanClose() {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: "drop", wasClean: false });
  }

  pong(error?: Error) {
    const waiter = this.pingWaiters.shift();
    waiter?.(error);
  }
}

function fakeTimers() {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextId = 1;
  let now = 0;
  return {
    now: () => now,
    setTimeout(fn: () => void, ms: number) {
      const id = nextId++;
      timers.set(id, { fn, ms: now + ms });
      return id;
    },
    clearTimeout(id: unknown) {
      timers.delete(id as number);
    },
    flush(ms: number) {
      now += ms;
      for (const [id, t] of [...timers.entries()]) {
        if (t.ms <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    },
    pending() {
      return timers.size;
    },
  };
}

describe("@atmos/api-client WsSession", () => {
  test("connect resolves on open", async () => {
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://localhost/ws?token=secret",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
    });
    const p = session.connect();
    sock!.open();
    await p;
    expect(session.state).toBe("connected");
  });

  test("request/response correlation", async () => {
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
      requestTimeoutMs: 5000,
    });
    const p = session.connect();
    sock!.open();
    await p;
    const req = session.request("fs_get_home_dir", {});
    const sent = JSON.parse(sock!.sent[0]!) as {
      payload: { request_id: string };
    };
    sock!.emit({
      type: "response",
      payload: {
        request_id: sent.payload.request_id,
        success: true,
        data: { path: "/home" },
      },
    });
    await expect(req).resolves.toEqual({ path: "/home" });
  });

  test("request rejects when not connected (no queue)", async () => {
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => new MockSocket(),
      },
      reconnect: { enabled: false },
    });
    await expect(session.request("fs_get_home_dir")).rejects.toThrow(/not connected/);
  });

  test("close flushes pending", async () => {
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
      requestTimeoutMs: 0,
    });
    const p = session.connect();
    sock!.open();
    await p;
    const req = session.request("fs_list_dir", { path: "/" });
    sock!.uncleanClose();
    await expect(req).rejects.toThrow(/closed/);
  });

  test("exhausted stop schedules no more timers", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: {
        ...DEFAULT_MOBILE_RECONNECT,
        maxAttempts: 1,
        initialDelayMs: 100,
        maxDelayMs: 100,
        exhausted: { type: "stop" },
      },
    });
    const p = session.connect();
    sock!.open();
    await p;
    sock!.uncleanClose();
    expect(session.state).toBe("reconnecting");
    ft.flush(100);
    sock!.uncleanClose();
    expect(session.state).toBe("closed");
    expect(ft.pending()).toBe(0);
  });

  test("mobile exhausted slow_retry keeps retrying after a long delay", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    let created = 0;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          created += 1;
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: {
        ...DEFAULT_MOBILE_RECONNECT,
        maxAttempts: 1,
        initialDelayMs: 100,
        maxDelayMs: 100,
      },
    });
    const p = session.connect();
    sock!.open();
    await p;
    sock!.uncleanClose();
    ft.flush(100);
    sock!.uncleanClose();
    expect(session.state).toBe("disconnected");
    expect(ft.pending()).toBe(1);
    const afterFast = created;
    ft.flush(59_999);
    expect(created).toBe(afterFast);
    ft.flush(1);
    expect(created).toBe(afterFast + 1);
    sock!.open();
    expect(session.state).toBe("connected");
  });

  test("web exhausted slow_retry schedules long delay", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: {
        ...DEFAULT_WEB_RECONNECT,
        maxAttempts: 1,
        initialDelayMs: 10,
        maxDelayMs: 10,
        exhausted: { type: "slow_retry", delayMs: 60_000 },
      },
    });
    const p = session.connect();
    sock!.open();
    await p;
    sock!.uncleanClose();
    ft.flush(10);
    sock!.uncleanClose();
    expect(session.state).toBe("disconnected");
    expect(ft.pending()).toBe(1);
  });

  test("requestWhenReady double-checks isValid", async () => {
    let sock: MockSocket | null = null;
    let valid = true;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
    });
    const p = session.connect();
    sock!.open();
    await p;
    valid = false;
    await expect(
      session.requestWhenReady({
        action: "fs_get_home_dir",
        isValid: () => valid,
      }),
    ).rejects.toThrow(/scope changed/);
  });

  test("url factory re-evaluated each connect", async () => {
    const urls: string[] = [];
    let n = 0;
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: () => {
        n += 1;
        return `ws://host/${n}`;
      },
      platform: {
        createWebSocket: (url) => {
          urls.push(url);
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
    });
    const p1 = session.connect();
    sock!.open();
    await p1;
    session.disconnect();
    const p2 = session.connect();
    sock!.open();
    await p2;
    expect(urls).toEqual(["ws://host/1", "ws://host/2"]);
  });

  test("redactUrl masks tokens", () => {
    expect(redactUrl("ws://x/ws?token=abc&client_type=web")).toContain("token=<redacted>");
    expect(redactUrl("ws://x/ws?token=abc")).not.toContain("token=abc");
  });

  test("backoff delay caps", () => {
    expect(
      backoffDelayMs(
        {
          enabled: true,
          initialDelayMs: 1000,
          maxDelayMs: 30_000,
          maxAttempts: 10,
          exhausted: { type: "stop" },
          reconnectOnCleanClose: false,
          reconnectBeforeOpen: false,
        },
        10,
      ),
    ).toBe(30_000);
  });

  test("intentional disconnect does not reconnect", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: DEFAULT_MOBILE_RECONNECT,
    });
    const p = session.connect();
    sock!.open();
    await p;
    session.disconnect();
    expect(session.state).toBe("closed");
    expect(ft.pending()).toBe(0);
  });

  test("mobile retries a handshake that never opens", () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "wss://relay.example/ws/client?token=secret",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: DEFAULT_MOBILE_RECONNECT,
    });
    void session.connect();
    sock!.uncleanClose();
    expect(session.state).toBe("reconnecting");
    expect(ft.pending()).toBe(1);
  });

  test("web does not retry a handshake that never opens", () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://localhost/ws",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: DEFAULT_WEB_RECONNECT,
    });
    void session.connect();
    sock!.uncleanClose();
    expect(session.state).toBe("disconnected");
    expect(ft.pending()).toBe(0);
  });

  test("handshakeTimeoutMs overrides the short default cap", () => {
    const ft = fakeTimers();
    let created = 0;
    const session = createWsSession({
      url: "wss://relay.example/ws/client",
      handshakeTimeoutMs: 8_000,
      platform: {
        createWebSocket: () => {
          created += 1;
          return new MockSocket();
        },
        timers: ft,
      },
      reconnect: { enabled: false },
    });
    void session.connect();
    ft.flush(3_000);
    expect(created).toBe(1);
    expect(session.state).toBe("connecting");
    ft.flush(5_000);
    expect(session.state).toBe("closed");
    expect(created).toBe(1);
  });

  test("concurrent connect shares one handshake", async () => {
    let creates = 0;
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          creates += 1;
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
    });
    const a = session.connect();
    const b = session.connect();
    expect(creates).toBe(1);
    sock!.open();
    await Promise.all([a, b]);
    expect(session.state).toBe("connected");
  });

  test("disconnect during connect rejects waiters", async () => {
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
    });
    const p = session.connect();
    expect(sock).not.toBeNull();
    session.disconnect();
    await expect(p).rejects.toThrow(/disconnected/);
    expect(session.state).toBe("closed");
  });

  test("request times out and releases the pending slot", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: { enabled: false },
      requestTimeoutMs: 50,
    });
    const p = session.connect();
    sock!.open();
    await p;
    const req = session.request("agent_chat_backfill", {
      chat_id: "c1",
      parts: [{ part_id: "p", from_offset: 0 }],
    });
    const firstId = (JSON.parse(sock!.sent[0]!) as { payload: { request_id: string } }).payload
      .request_id;
    ft.flush(50);
    await expect(req).rejects.toThrow(/timeout: agent_chat_backfill/);
    sock!.emit({
      type: "response",
      payload: { request_id: firstId, success: true, data: { leaked: true } },
    });
    const second = session.request("fs_get_home_dir", {});
    const secondId = (JSON.parse(sock!.sent[1]!) as { payload: { request_id: string } }).payload
      .request_id;
    expect(secondId).not.toBe(firstId);
    sock!.emit({
      type: "response",
      payload: { request_id: firstId, success: true, data: { leaked: true } },
    });
    sock!.emit({
      type: "response",
      payload: { request_id: secondId, success: true, data: { path: "/home" } },
    });
    await expect(second).resolves.toEqual({ path: "/home" });
  });

  test("send throw rejects the request", async () => {
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
    });
    const p = session.connect();
    sock!.open();
    await p;
    sock!.throwOnSend = new Error("send failed");
    await expect(session.request("fs_get_home_dir")).rejects.toThrow("send failed");
  });

  test("failPending rejects in-flight requests without closing the socket", async () => {
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
    });
    const p = session.connect();
    sock!.open();
    await p;
    const req = session.request("agent_chat_subscribe", { chat_id: "c1", after_sequence: 3 });
    session.failPending(new Error("relay_ctrl: server_offline"));
    await expect(req).rejects.toThrow(/server_offline/);
    expect(session.state).toBe("connected");
    expect(sock!.readyState).toBe(1);
  });

  test("pauseReconnect skips backoff until resumeReconnect", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    let created = 0;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          created += 1;
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: {
        ...DEFAULT_MOBILE_RECONNECT,
        initialDelayMs: 100,
        maxDelayMs: 100,
      },
    });
    const p = session.connect();
    sock!.open();
    await p;
    session.pauseReconnect();
    sock!.uncleanClose();
    expect(session.state).toBe("disconnected");
    expect(ft.pending()).toBe(0);
    expect(created).toBe(1);
    session.resumeReconnect();
    expect(created).toBe(2);
    sock!.open();
    expect(session.state).toBe("connected");
  });

  test("retryNow reconnects immediately after exhausted stop", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    let created = 0;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          created += 1;
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: {
        enabled: true,
        initialDelayMs: 100,
        maxDelayMs: 100,
        maxAttempts: 1,
        exhausted: { type: "stop" },
        reconnectOnCleanClose: false,
        reconnectBeforeOpen: true,
      },
    });
    const p = session.connect();
    sock!.open();
    await p;
    sock!.uncleanClose();
    ft.flush(100);
    sock!.uncleanClose();
    expect(session.state).toBe("closed");
    expect(created).toBe(2);
    session.retryNow();
    expect(created).toBe(3);
    sock!.open();
    expect(session.state).toBe("connected");
  });

  test("heartbeat ping timeout closes the socket so reconnect can run", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    let created = 0;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          created += 1;
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: {
        ...DEFAULT_MOBILE_RECONNECT,
        initialDelayMs: 25,
        maxDelayMs: 25,
      },
      heartbeatIntervalMs: 40,
      heartbeatTimeoutMs: 10,
    });
    const p = session.connect();
    sock!.open();
    await p;
    ft.flush(40);
    expect(sock!.pingWaiters).toHaveLength(1);
    ft.flush(10);
    expect(session.state).toBe("reconnecting");
    ft.flush(25);
    expect(created).toBe(2);
  });

  test("heartbeat pong keeps the socket open", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 40,
      heartbeatTimeoutMs: 10,
    });
    const p = session.connect();
    sock!.open();
    await p;
    ft.flush(40);
    sock!.pong();
    ft.flush(10);
    expect(session.state).toBe("connected");
    expect(sock!.readyState).toBe(1);
  });

  test("late pong after pause/resume does not cancel the new watchdog", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 40,
      heartbeatTimeoutMs: 10,
    });
    const p = session.connect();
    sock!.open();
    await p;
    ft.flush(40);
    expect(sock!.pingWaiters).toHaveLength(1);
    session.pauseReconnect();
    session.resumeReconnect();
    ft.flush(40);
    expect(sock!.pingWaiters).toHaveLength(2);
    sock!.pong();
    ft.flush(10);
    expect(sock!.readyState).toBe(3);
  });

  test("late error from a replaced socket does not error the new connection", async () => {
    const sockets: MockSocket[] = [];
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          const next = new MockSocket();
          sockets.push(next);
          return next;
        },
      },
      reconnect: { ...DEFAULT_MOBILE_RECONNECT, initialDelayMs: 25, maxDelayMs: 25 },
      requestTimeoutMs: 5000,
    });
    const opened = session.connect();
    sockets[0]!.open();
    await opened;
    expect(session.state).toBe("connected");

    const staleError = sockets[0]!.onerror;
    sockets[0]!.readyState = 2;
    session.retryNow();
    expect(sockets).toHaveLength(2);
    expect(sockets[0]!.onerror).toBeNull();
    expect(sockets[0]!.onmessage).toBeNull();
    expect(sockets[0]!.onclose).toBeNull();
    expect(sockets[0]!.onopen).toBeNull();
    sockets[1]!.open();
    expect(session.state).toBe("connected");

    const pending = session.request("fs_get_home_dir", {});
    staleError?.({ message: "late error from replaced socket" });
    expect(session.state).toBe("connected");
    expect(sockets[1]!.readyState).toBe(1);

    const sent = JSON.parse(sockets[1]!.sent[0]!) as { payload: { request_id: string } };
    sockets[1]!.emit({
      type: "response",
      payload: {
        request_id: sent.payload.request_id,
        success: true,
        data: { path: "/home" },
      },
    });
    await expect(pending).resolves.toEqual({ path: "/home" });
  });

  test("late pong from a replaced socket does not cancel the current watchdog", async () => {
    const ft = fakeTimers();
    const sockets: MockSocket[] = [];
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          const next = new MockSocket();
          sockets.push(next);
          return next;
        },
        timers: ft,
      },
      reconnect: {
        ...DEFAULT_MOBILE_RECONNECT,
        initialDelayMs: 25,
        maxDelayMs: 25,
      },
      heartbeatIntervalMs: 40,
      heartbeatTimeoutMs: 10,
    });
    const p = session.connect();
    sockets[0]!.open();
    await p;
    ft.flush(40);
    expect(sockets[0]!.pingWaiters).toHaveLength(1);
    ft.flush(10);
    ft.flush(25);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    ft.flush(40);
    expect(sockets[1]!.pingWaiters).toHaveLength(1);
    sockets[0]!.pong();
    ft.flush(10);
    expect(sockets[1]!.readyState).toBe(3);
    expect(session.state).toBe("reconnecting");
  });

  test("ping-less sockets keep the heartbeat interval looping", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          Object.defineProperty(sock, "ping", { value: undefined });
          return sock;
        },
        timers: ft,
      },
      reconnect: { enabled: false },
      heartbeatIntervalMs: 40,
      heartbeatTimeoutMs: 10,
    });
    const p = session.connect();
    sock!.open();
    await p;
    ft.flush(40);
    expect(session.state).toBe("connected");
    expect(sock!.readyState).toBe(1);
    ft.flush(40);
    expect(session.state).toBe("connected");
    expect(ft.pending()).toBeGreaterThan(0);
  });

  test("pauseReconnect blocks a direct connect until resume", async () => {
    const ft = fakeTimers();
    let created = 0;
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          created += 1;
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: DEFAULT_MOBILE_RECONNECT,
    });
    session.pauseReconnect();
    await session.connect();
    expect(created).toBe(0);
    session.resumeReconnect();
    expect(created).toBe(1);
    sock!.open();
    expect(session.state).toBe("connected");
  });

  test("retryNow connect promise survives the previous finally", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    let created = 0;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          created += 1;
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: {
        ...DEFAULT_MOBILE_RECONNECT,
        initialDelayMs: 100,
        maxDelayMs: 100,
      },
    });
    const first = session.connect();
    sock!.open();
    sock!.uncleanClose();
    session.retryNow();
    const second = session.connect();
    expect(created).toBe(2);
    await Promise.resolve();
    sock!.open();
    await second;
    expect(session.state).toBe("connected");
    await first;
  });

  test("intentional disconnect does not resume on retryNow", async () => {
    const ft = fakeTimers();
    let sock: MockSocket | null = null;
    let created = 0;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          created += 1;
          sock = new MockSocket();
          return sock;
        },
        timers: ft,
      },
      reconnect: DEFAULT_MOBILE_RECONNECT,
    });
    const p = session.connect();
    sock!.open();
    await p;
    session.disconnect();
    session.retryNow();
    session.resumeReconnect();
    expect(created).toBe(1);
    expect(session.state).toBe("closed");
  });

  test("notification fan-out", async () => {
    let sock: MockSocket | null = null;
    const session = createWsSession({
      url: "ws://x",
      platform: {
        createWebSocket: () => {
          sock = new MockSocket();
          return sock;
        },
      },
      reconnect: { enabled: false },
    });
    const p = session.connect();
    sock!.open();
    await p;
    const seen: unknown[] = [];
    session.onNotification("workspace_updated", (d) => seen.push(d));
    session.onNotification("workspace_updated", (d) => seen.push(d));
    sock!.emit({
      type: "notification",
      payload: { event: "workspace_updated", data: { id: 1 } },
    });
    expect(seen).toEqual([{ id: 1 }, { id: 1 }]);
  });
});

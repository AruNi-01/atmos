import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MOBILE_RECONNECT,
  DEFAULT_WEB_RECONNECT,
} from "./defaults";
import { backoffDelayMs, redactUrl } from "./reconnect";
import { createWsSession } from "./session";
import type { WebSocketLike } from "../platform/types";

class MockSocket implements WebSocketLike {
  readyState = 0;
  onopen: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose:
    | ((ev: { code: number; reason: string; wasClean: boolean }) => void)
    | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close(_code?: number, _reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: "close", wasClean: true });
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
    const req = session.request<{ path: string }>("fs_get_home_dir", {});
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
    await expect(session.request("fs_get_home_dir")).rejects.toThrow(
      /not connected/,
    );
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

  test("mobile exhausted stop schedules no more timers", async () => {
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
      },
    });
    const p = session.connect();
    sock!.open();
    await p;
    sock!.uncleanClose();
    // first reconnect attempt scheduled
    expect(session.state).toBe("reconnecting");
    ft.flush(100);
    // fail reconnect without open so attempt counter is not reset
    sock!.uncleanClose();
    // exhausted stop
    expect(session.state).toBe("closed");
    expect(ft.pending()).toBe(0);
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
    expect(redactUrl("ws://x/ws?token=abc&client_type=web")).toContain(
      "token=<redacted>",
    );
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

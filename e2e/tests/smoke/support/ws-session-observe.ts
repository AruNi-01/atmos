import type { Page, WebSocket } from "@playwright/test";

export type WsFrameDirection = "in" | "out";

export type ObservedWsFrame = {
  direction: WsFrameDirection;
  raw: string;
  parsed: unknown;
};

export type ObservedAppWsSession = {
  url: string;
  frames: ObservedWsFrame[];
  closed: boolean;
  socket: WebSocket;
};

/**
 * Observe the app's main `/ws` sockets (APP-048 frames / APP-049 session).
 * Does not open a second seed socket — only traffic from the page under test.
 */
export function attachAppWsObserver(page: Page): ObservedAppWsSession[] {
  const sessions: ObservedAppWsSession[] = [];

  page.on("websocket", (ws) => {
    if (!isMainAppWsUrl(ws.url())) return;

    const session: ObservedAppWsSession = {
      url: ws.url(),
      frames: [],
      closed: false,
      socket: ws,
    };

    const push = (direction: WsFrameDirection, payload: string | Buffer) => {
      const raw = typeof payload === "string" ? payload : payload.toString("utf8");
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Binary / non-JSON frames are recorded raw.
      }
      session.frames.push({ direction, raw, parsed });
    };

    ws.on("framesent", (event) => push("out", event.payload));
    ws.on("framereceived", (event) => push("in", event.payload));
    ws.on("close", () => {
      session.closed = true;
    });

    sessions.push(session);
  });

  return sessions;
}

export function isMainAppWsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/ws" || parsed.pathname.endsWith("/ws");
  } catch {
    return /\/ws(\?|$)/.test(url);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** APP-048 request envelope (Rust wire). */
export function isWsRequestEnvelope(value: unknown): boolean {
  if (!isRecord(value) || value.type !== "request" || !isRecord(value.payload)) {
    return false;
  }
  const payload = value.payload;
  return (
    typeof payload.request_id === "string" &&
    payload.request_id.length > 0 &&
    typeof payload.action === "string" &&
    payload.action.length > 0 &&
    /^[a-z][a-z0-9_]*$/.test(payload.action)
  );
}

/** APP-048 response envelope (Rust wire: success required boolean). */
export function isWsResponseEnvelope(value: unknown): boolean {
  if (!isRecord(value) || value.type !== "response" || !isRecord(value.payload)) {
    return false;
  }
  const payload = value.payload;
  return (
    typeof payload.request_id === "string" &&
    payload.request_id.length > 0 &&
    typeof payload.success === "boolean"
  );
}

export function isWsErrorEnvelope(value: unknown): boolean {
  if (!isRecord(value) || value.type !== "error" || !isRecord(value.payload)) {
    return false;
  }
  const payload = value.payload;
  return (
    typeof payload.request_id === "string" &&
    typeof payload.code === "string" &&
    typeof payload.message === "string"
  );
}

export function listOutboundActions(sessions: ObservedAppWsSession[]): string[] {
  const actions: string[] = [];
  for (const session of sessions) {
    for (const frame of session.frames) {
      if (frame.direction !== "out") continue;
      if (!isWsRequestEnvelope(frame.parsed)) continue;
      const payload = (frame.parsed as { payload: { action: string } }).payload;
      actions.push(payload.action);
    }
  }
  return actions;
}

export function listInboundResponses(sessions: ObservedAppWsSession[]): Array<{
  requestId: string;
  success: boolean;
}> {
  const out: Array<{ requestId: string; success: boolean }> = [];
  for (const session of sessions) {
    for (const frame of session.frames) {
      if (frame.direction !== "in") continue;
      if (!isWsResponseEnvelope(frame.parsed)) continue;
      const payload = (
        frame.parsed as { payload: { request_id: string; success: boolean } }
      ).payload;
      out.push({ requestId: payload.request_id, success: payload.success });
    }
  }
  return out;
}

export function openAppWsSessions(sessions: ObservedAppWsSession[]): ObservedAppWsSession[] {
  return sessions.filter((session) => !session.closed);
}

/**
 * APP-016 — ServerHub Durable Object: routes browser ↔ daemon traffic.
 *
 * Stateless across hibernation: instead of keeping `serverSock` / `browsers`
 * in instance fields (which evaporate on eviction), every lookup goes through
 * `ctx.getWebSockets(tag)`. WebSocket Hibernation guarantees those references
 * are restored verbatim when the DO is woken back up — so a relay flow that
 * was idle for hours still resumes without a "server_offline" false positive.
 *
 * Cost: Cloudflare's WS Hibernation API does not bill duration while every
 * peer is idle, and pings/pongs handled by the runtime (via
 * `setWebSocketAutoResponse`) never wake the DO. The only billed events are
 * actual app-level frames (HTTP gateway requests, browser sends, daemon
 * sends), which is what we want.
 */

import { DurableObject } from "cloudflare:workers";
import {
  ackDelivery,
  providerFromRelayAddress,
  type DeliveryAckStatus,
} from "./delivery-state";

export interface ServerHubEnv {
  SERVER_HUB: DurableObjectNamespace<ServerHub>;
  DB: D1Database;
}

interface RelayEnvelope {
  v: number;
  stream?: string;
  kind: string;
  from?: string;
  to?: string;
  request_id?: string;
  body?: string;
}

interface HttpRelayRequestBody {
  method: string;
  path: string;
  headers: [string, string][];
  body_b64?: string | null;
}

interface HttpRelayResponseBody {
  status: number;
  headers: [string, string][];
  body_b64?: string | null;
}

interface ExternalEventAckBody {
  delivery_id?: string;
  route_id?: string;
  status?: DeliveryAckStatus;
  error_code?: string;
}

export type PeerMeta =
  | { role: "server"; server_id: string }
  | { role: "client"; sid: string };

type PendingHttp = {
  resolve: (response: Response) => void;
  reject: (err: Error) => void;
};

const HTTP_GATEWAY_TIMEOUT_MS = 60_000;

/** Hibernation tags — pick by role / sid in `ctx.getWebSockets`. */
const TAG_SERVER = "server";
const TAG_CLIENT_ALL = "client";
const tagForClient = (sid: string) => `client:${sid}`;

export class ServerHub extends DurableObject<ServerHubEnv> {
  /** In-flight HTTP gateway requests waiting on a daemon response.
   * Per-invocation only — the CF runtime keeps the DO alive while any
   * `fetch` handler holds an outstanding promise, so we don't need to
   * persist this. */
  private readonly pendingHttp = new Map<string, PendingHttp>();

  constructor(ctx: DurableObjectState, env: ServerHubEnv) {
    super(ctx, env);

    // Defense in depth: if a stale browser tab still sends app-level "ping"
    // text frames (we have removed it from the current client, but cached
    // bundles may persist), the edge auto-replies "pong" without ever
    // waking this DO. Zero billing impact.
    try {
      ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair("ping", "pong"),
      );
    } catch {
      // Older runtimes / tests without setWebSocketAutoResponse — non-fatal.
    }
  }

  private getServerSocket(): WebSocket | null {
    const sockets = this.ctx.getWebSockets(TAG_SERVER);
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        return ws;
      }
    }
    return null;
  }

  private getClientSocket(sid: string): WebSocket | null {
    const sockets = this.ctx.getWebSockets(tagForClient(sid));
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        return ws;
      }
    }
    return null;
  }

  private getAllClientSockets(): WebSocket[] {
    return this.ctx.getWebSockets(TAG_CLIENT_ALL);
  }

  private async markServerSeen(serverId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    try {
      await this.env.DB.prepare(
        "UPDATE computers SET last_seen_at = ?, updated_at = ? WHERE server_id = ?",
      )
        .bind(now, now, serverId)
        .run();
    } catch {
      /* ignore */
    }
  }

  private async clearServerPresence(serverId: string): Promise<void> {
    try {
      await this.env.DB.prepare(
        "UPDATE computers SET last_seen_at = NULL WHERE server_id = ?",
      )
        .bind(serverId)
        .run();
    } catch {
      /* ignore */
    }
  }

  private parseMeta(ws: WebSocket): PeerMeta | null {
    try {
      const raw = ws.deserializeAttachment() as PeerMeta | Record<string, unknown> | null;
      if (
        raw &&
        typeof raw === "object" &&
        (raw as PeerMeta).role === "server" &&
        typeof (raw as { server_id?: string }).server_id === "string"
      ) {
        return { role: "server", server_id: (raw as { server_id: string }).server_id };
      }
      if (
        raw &&
        typeof raw === "object" &&
        (raw as PeerMeta).role === "client" &&
        typeof (raw as { sid?: string }).sid === "string"
      ) {
        return { role: "client", sid: (raw as { sid: string }).sid };
      }
      return null;
    } catch {
      return null;
    }
  }

  private broadcastServerOffline() {
    for (const cw of this.getAllClientSockets()) {
      try {
        cw.send(
          JSON.stringify({
            type: "relay_ctrl",
            code: "server_offline",
          }),
        );
      } catch {
        /* ignore */
      }
    }
    for (const [id, pending] of this.pendingHttp) {
      pending.reject(new Error("server_offline"));
      this.pendingHttp.delete(id);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("X-Relay-Http-Gateway") === "1") {
      return this.handleHttpGateway(request);
    }

    if (request.headers.get("X-Relay-External-Event") === "1") {
      return this.handleExternalEvent(request);
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    const pair = new WebSocketPair();
    const clientSide = pair[0]!;
    const workerSide = pair[1]!;

    if (role === "server") {
      const serverId = url.searchParams.get("server_id")?.trim();
      if (!serverId) {
        return new Response("Missing server_id", { status: 400 });
      }

      const existing = this.getServerSocket();
      if (existing) {
        try {
          existing.close(4000, "replaced-server");
        } catch {
          /* noop */
        }
      }

      workerSide.serializeAttachment({ role: "server", server_id: serverId } satisfies PeerMeta);
      this.ctx.acceptWebSocket(workerSide, [TAG_SERVER]);

      // Bump presence here — *after* the new socket is accepted — so the
      // replacement order (set new) → (close fires for old, which then
      // checks "is any server still up?" and finds the new one) cannot
      // accidentally clear last_seen_at right after we just set it.
      await this.markServerSeen(serverId);

      return new Response(null, { status: 101, webSocket: clientSide });
    }

    if (role === "client") {
      const sid = url.searchParams.get("sid");
      if (!sid) {
        return new Response("Missing sid", { status: 400 });
      }

      const existing = this.getClientSocket(sid);
      if (existing) {
        try {
          existing.close(4000, "replaced-client");
        } catch {
          /* noop */
        }
      }

      workerSide.serializeAttachment({ role: "client", sid } satisfies PeerMeta);
      this.ctx.acceptWebSocket(workerSide, [TAG_CLIENT_ALL, tagForClient(sid)]);

      return new Response(null, { status: 101, webSocket: clientSide });
    }

    return new Response("role must be server|client", { status: 400 });
  }

  private async handleHttpGateway(request: Request): Promise<Response> {
    const up = this.getServerSocket();
    if (!up) {
      return new Response(JSON.stringify({ error: "server_offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    let httpBody: HttpRelayRequestBody;
    try {
      httpBody = (await request.json()) as HttpRelayRequestBody;
    } catch {
      return new Response(JSON.stringify({ error: "invalid_gateway_descriptor" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const requestId = crypto.randomUUID();

    const envelope: RelayEnvelope = {
      v: 1,
      stream: "http",
      kind: "request",
      request_id: requestId,
      body: JSON.stringify(httpBody),
    };

    try {
      const response = await new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingHttp.delete(requestId);
          reject(new Error("gateway_timeout"));
        }, HTTP_GATEWAY_TIMEOUT_MS);

        this.pendingHttp.set(requestId, {
          resolve: (res) => {
            clearTimeout(timer);
            resolve(res);
          },
          reject: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        });

        try {
          up.send(JSON.stringify(envelope));
        } catch (e) {
          this.pendingHttp.delete(requestId);
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
      return response;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "server_offline") {
        return new Response(JSON.stringify({ error: "server_offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (msg === "gateway_timeout") {
        return new Response(JSON.stringify({ error: "gateway_timeout" }), {
          status: 504,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "gateway_error", detail: msg }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private async handleExternalEvent(request: Request): Promise<Response> {
    const up = this.getServerSocket();
    if (!up) {
      return new Response(JSON.stringify({ error: "server_offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    let envelope: RelayEnvelope;
    try {
      envelope = (await request.json()) as RelayEnvelope;
    } catch {
      return new Response(JSON.stringify({ error: "invalid_external_event" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (
      envelope.v !== 1 ||
      envelope.stream !== "system" ||
      envelope.kind !== "external_event" ||
      envelope.to !== "server" ||
      typeof envelope.body !== "string"
    ) {
      return new Response(JSON.stringify({ error: "invalid_external_event" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      up.send(JSON.stringify(envelope));
      return new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "server_send_failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private async handleExternalEventAck(envelope: RelayEnvelope): Promise<void> {
    const provider = providerFromRelayAddress(envelope.to);
    if (!provider) {
      return;
    }

    let ack: ExternalEventAckBody;
    try {
      ack = JSON.parse(envelope.body ?? "{}") as ExternalEventAckBody;
    } catch {
      return;
    }

    if (
      !ack.delivery_id ||
      !ack.route_id ||
      !ack.status ||
      !["accepted", "local_rejected", "error"].includes(ack.status)
    ) {
      return;
    }

    try {
      await ackDelivery(
        this.env,
        {
          provider,
          deliveryId: ack.delivery_id,
          routeId: ack.route_id,
        },
        ack.status,
        ack.error_code ?? null,
      );
    } catch {
      /* ignore ack persistence errors; the server already made the local run decision */
    }
  }

  private fulfillHttpResponse(requestId: string, payload: string) {
    const pending = this.pendingHttp.get(requestId);
    if (!pending) {
      return;
    }

    try {
      const parsed = JSON.parse(payload) as HttpRelayResponseBody;
      if (typeof parsed.status !== "number") {
        throw new Error("invalid_http_response");
      }

      const headers = new Headers();
      for (const [k, v] of parsed.headers ?? []) {
        headers.set(k, v);
      }

      let body: Uint8Array | null = null;
      if (parsed.body_b64) {
        const binary = atob(parsed.body_b64);
        body = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          body[i] = binary.charCodeAt(i);
        }
      }

      pending.resolve(
        new Response(body, {
          status: parsed.status,
          headers,
        }),
      );
    } catch {
      pending.reject(new Error("invalid_http_response"));
    } finally {
      this.pendingHttp.delete(requestId);
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const meta = this.parseMeta(ws);
    if (!meta) {
      ws.close(4002, "no-meta");
      return;
    }

    const payload =
      typeof message === "string" ? message : new TextDecoder().decode(message);

    if (meta.role === "client") {
      const up = this.getServerSocket();
      if (!up) {
        try {
          ws.send(
            JSON.stringify({
              type: "relay_ctrl",
              code: "server_offline",
            }),
          );
        } catch {
          /* noop */
        }
        return;
      }

      const envelope: RelayEnvelope = {
        v: 1,
        stream: "app",
        kind: "frame",
        from: `client:${meta.sid}`,
        to: "server",
        body: payload,
      };

      try {
        up.send(JSON.stringify(envelope));
      } catch {
        /* noop */
      }
      return;
    }

    if (meta.role === "server") {
      try {
        const env = JSON.parse(payload) as RelayEnvelope;
        if (env.stream === "http" && env.kind === "response" && env.request_id) {
          this.fulfillHttpResponse(env.request_id, env.body ?? "{}");
          return;
        }
        if (env.stream === "system" && env.kind === "external_event_ack") {
          await this.handleExternalEventAck(env);
          return;
        }
        if (env.kind === "frame" && env.to?.startsWith("client:")) {
          const sid = env.to.slice("client:".length);
          const target = this.getClientSocket(sid);
          if (target && env.body !== undefined) {
            target.send(env.body);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const meta = this.parseMeta(ws);
    if (meta?.role === "server") {
      // The closing socket is already gone from getWebSockets(). Only clear
      // presence if there is no *other* server WS still alive (which would
      // be the case when the daemon got replaced by a reconnect — we want
      // the new socket's presence to stick, not get clobbered by this close).
      if (!this.getServerSocket()) {
        await this.clearServerPresence(meta.server_id);
        this.broadcastServerOffline();
      }
    }
    // For client roles we don't need to do anything — getClientSocket walks
    // the live tag list each time, so a closed socket is simply absent.
  }

  async webSocketError(ws: WebSocket, _error: unknown) {
    // Treat errors the same as a close — the runtime will then evict the
    // socket and subsequent tag lookups will skip it.
    await this.webSocketClose(ws);
  }
}

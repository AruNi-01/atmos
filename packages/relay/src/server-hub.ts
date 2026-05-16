/** APP-016: routes browser ↔ upstream within one durable object hub. */

import { DurableObject } from "cloudflare:workers";

export interface RelayEnv {
  SERVER_HUB: DurableObjectNamespace<ServerHub>;
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

export type PeerMeta =
  | { role: "server" }
  | { role: "client"; sid: string };

type PendingHttp = {
  resolve: (response: Response) => void;
  reject: (err: Error) => void;
};

const HTTP_GATEWAY_TIMEOUT_MS = 60_000;

export class ServerHub extends DurableObject<RelayEnv> {
  private serverSock: WebSocket | null = null;
  private readonly browsers = new Map<string, WebSocket>();
  private readonly pendingHttp = new Map<string, PendingHttp>();

  constructor(ctx: DurableObjectState, env: RelayEnv) {
    super(ctx, env);
  }

  private parseMeta(ws: WebSocket): PeerMeta | null {
    try {
      const raw = ws.deserializeAttachment() as PeerMeta | Record<string, unknown> | null;
      if (
        raw &&
        typeof raw === "object" &&
        (raw as PeerMeta).role === "server"
      ) {
        return { role: "server" };
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
    for (const [, cw] of this.browsers) {
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

  private rejectAllPendingHttp(reason: string) {
    for (const [id, pending] of this.pendingHttp) {
      pending.reject(new Error(reason));
      this.pendingHttp.delete(id);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("X-Relay-Http-Gateway") === "1") {
      return this.handleHttpGateway(request);
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
      if (this.serverSock) {
        try {
          this.serverSock.close(4000, "replaced-server");
        } catch {
          /* noop */
        }
      }

      workerSide.serializeAttachment({ role: "server" } satisfies PeerMeta);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.ctx as any).acceptWebSocket(workerSide);

      this.serverSock = workerSide;

      workerSide.addEventListener?.("close", () => {
        if (this.serverSock === workerSide) {
          this.serverSock = null;
        }
        this.broadcastServerOffline();
      });

      return new Response(null, { status: 101, webSocket: clientSide });
    }

    if (role === "client") {
      const sid = url.searchParams.get("sid");
      if (!sid) {
        return new Response("Missing sid", { status: 400 });
      }

      const existing = this.browsers.get(sid);
      if (existing) {
        try {
          existing.close(4000, "replaced-client");
        } catch {
          /* noop */
        }
      }

      workerSide.serializeAttachment({ role: "client", sid } satisfies PeerMeta);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.ctx as any).acceptWebSocket(workerSide);

      this.browsers.set(sid, workerSide);

      workerSide.addEventListener?.("close", () => {
        this.browsers.delete(sid);
      });

      return new Response(null, { status: 101, webSocket: clientSide });
    }

    return new Response("role must be server|client", { status: 400 });
  }

  private async handleHttpGateway(request: Request): Promise<Response> {
    const up = this.serverSock;
    if (!up || up.readyState !== WebSocket.OPEN) {
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
      const up = this.serverSock;
      if (!up || up.readyState !== WebSocket.OPEN) {
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
        if (env.kind === "frame" && env.to?.startsWith("client:")) {
          const sid = env.to.slice("client:".length);
          const target = this.browsers.get(sid);
          if (target && target.readyState === WebSocket.OPEN && env.body !== undefined) {
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
    if (meta?.role === "server" && this.serverSock === ws) {
      this.serverSock = null;
      this.broadcastServerOffline();
    }
    if (meta?.role === "client") {
      this.browsers.delete(meta.sid);
    }
  }
}

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
  body?: string;
}

export type PeerMeta =
  | { role: "server" }
  | { role: "client"; sid: string };

export class ServerHub extends DurableObject<RelayEnv> {
  private serverSock: WebSocket | null = null;
  private readonly browsers = new Map<string, WebSocket>();

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
  }

  async fetch(request: Request): Promise<Response> {
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

/**
 * PT Design collaboration room — opaque encrypted fan-out.
 *
 * Same role as Excalidraw's oss-collab server: join a room, forward
 * ciphertext. The Worker never sees the room key or scene JSON.
 * Hibernates while peers are idle so long-lived rooms stay cheap.
 */

import { DurableObject } from "cloudflare:workers";
import { parseClientFrame } from "./pt-design-room-protocol";

export {
  isValidPtDesignRoomId,
  parseClientFrame,
  parsePtDesignRoomPath,
} from "./pt-design-room-protocol";

export interface PtDesignRoomEnv {
  PT_DESIGN_ROOM: DurableObjectNamespace<PtDesignRoom>;
}

const TAG_PEER = "peer";

type PeerMeta = { socketId: string };

export class PtDesignRoom extends DurableObject<PtDesignRoomEnv> {
  constructor(ctx: DurableObjectState, env: PtDesignRoomEnv) {
    super(ctx, env);
    try {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    } catch {
      /* tests / older runtimes */
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket Upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0]!;
    const server = pair[1]!;
    const socketId = crypto.randomUUID();
    server.serializeAttachment({ socketId } satisfies PeerMeta);
    this.ctx.acceptWebSocket(server, [TAG_PEER]);

    this.send(server, { t: "ready", socketId });
    this.broadcastExcept(server, { t: "new-user", socketId });
    this.broadcastAll({ t: "room-user-change", clients: this.clientIds() });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    const frame = parseClientFrame(message);
    if (!frame) return;
    this.broadcastExcept(ws, {
      t: "client-broadcast",
      payload: frame.payload,
      iv: frame.iv,
    });
  }

  async webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    this.broadcastAll({ t: "room-user-change", clients: this.clientIds() });
  }

  private clientIds(): string[] {
    const ids: string[] = [];
    for (const peer of this.ctx.getWebSockets(TAG_PEER)) {
      const id = this.socketIdOf(peer);
      if (id) ids.push(id);
    }
    return ids;
  }

  private socketIdOf(ws: WebSocket): string | null {
    try {
      const meta = ws.deserializeAttachment() as PeerMeta | null;
      return meta?.socketId ?? null;
    } catch {
      return null;
    }
  }

  private send(ws: WebSocket, value: unknown) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(value));
    } catch {
      /* drop */
    }
  }

  private broadcastAll(value: unknown) {
    const raw = JSON.stringify(value);
    for (const peer of this.ctx.getWebSockets(TAG_PEER)) {
      if (peer.readyState !== WebSocket.OPEN) continue;
      try {
        peer.send(raw);
      } catch {
        /* drop */
      }
    }
  }

  private broadcastExcept(sender: WebSocket, value: unknown) {
    const raw = JSON.stringify(value);
    for (const peer of this.ctx.getWebSockets(TAG_PEER)) {
      if (peer === sender || peer.readyState !== WebSocket.OPEN) continue;
      try {
        peer.send(raw);
      } catch {
        /* drop */
      }
    }
  }
}

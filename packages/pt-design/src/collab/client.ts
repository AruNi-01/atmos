import {
  WS_SUBTYPES,
  type CollabRoom,
  type CollabUser,
  type SceneMessage,
} from "./constants";
import { decryptData, encryptData } from "./crypto";
import { colorForCollaborator } from "./names";
import { openOfficialSocket } from "./official";
import {
  b64ToBytes,
  bytesToB64,
  collabWsUrl,
  encodeBroadcast,
  isOfficialCollabHost,
  parseWireIn,
  resolveCollabServers,
} from "./wire";

export type CollabClientHandlers = {
  onScene: (type: "SCENE_INIT" | "SCENE_UPDATE", elements: readonly unknown[]) => void;
  onUsers: (users: CollabUser[]) => void;
  onPeerJoin?: () => void;
};

export type CollabClient = {
  socketId: () => string | undefined;
  whenReady: (timeoutMs?: number) => Promise<boolean>;
  setUsername: (username: string) => void;
  broadcastScene: (type: "SCENE_INIT" | "SCENE_UPDATE", elements: readonly unknown[]) => Promise<void>;
  broadcastPointer: (input: {
    pointer: { x: number; y: number; tool: "pointer" | "laser" };
    button: "up" | "down";
    selectedElementIds?: Record<string, boolean>;
  }) => Promise<void>;
  close: () => void;
};

export function openCollabClient(input: {
  room: CollabRoom;
  username: string;
  serverUrl?: string;
  handlers: CollabClientHandlers;
}): CollabClient {
  const servers = resolveCollabServers(input.serverUrl);
  const users = new Map<string, CollabUser>();
  let username = input.username.trim() || "You";
  let socket: WebSocket | null = null;
  let official: ReturnType<typeof openOfficialSocket> | null = null;
  let socketId: string | undefined;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let relayFails = 0;
  let transport: "relay" | "official" = isOfficialCollabHost(servers.primary)
    ? "official"
    : "relay";
  let sawReady = false;
  const readyWaiters: Array<(ok: boolean) => void> = [];

  const emitUsers = () => {
    input.handlers.onUsers([...users.values()]);
  };

  const rememberUser = (partial: Partial<CollabUser> & { socketId: string; username?: string }) => {
    const prev = users.get(partial.socketId);
    const username = partial.username || prev?.username || "Guest";
    users.set(partial.socketId, {
      socketId: partial.socketId,
      username,
      pointer: partial.pointer ?? prev?.pointer,
      button: partial.button ?? prev?.button,
      selectedElementIds: partial.selectedElementIds ?? prev?.selectedElementIds,
      userState: partial.userState ?? prev?.userState ?? "active",
      color: colorForCollaborator(username, partial.socketId),
    });
    emitUsers();
  };

  const markReady = (id: string) => {
    socketId = id;
    sawReady = true;
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = undefined;
    }
    while (readyWaiters.length) readyWaiters.shift()?.(true);
    void send(
      {
        type: WS_SUBTYPES.IDLE_STATUS,
        payload: { socketId: id, userState: "active", username },
      },
      true,
    );
  };

  const applyCipher = async (encrypted: Uint8Array, iv: Uint8Array) => {
    try {
      const decrypted = await decryptData(iv, encrypted, input.room.roomKey);
      const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as SceneMessage;
      if (parsed.type === WS_SUBTYPES.INIT || parsed.type === WS_SUBTYPES.UPDATE) {
        input.handlers.onScene(parsed.type, parsed.payload.elements ?? []);
        return;
      }
      if (parsed.type === WS_SUBTYPES.MOUSE_LOCATION) {
        rememberUser({
          socketId: parsed.payload.socketId,
          username: parsed.payload.username,
          pointer: parsed.payload.pointer,
          button: parsed.payload.button,
          selectedElementIds: parsed.payload.selectedElementIds,
        });
        return;
      }
      if (parsed.type === WS_SUBTYPES.IDLE_STATUS) {
        rememberUser({
          socketId: parsed.payload.socketId,
          username: parsed.payload.username,
          userState: parsed.payload.userState,
        });
      }
    } catch {
      /* drop malformed / foreign-room frames */
    }
  };

  const send = async (data: SceneMessage, volatile = false) => {
    if (official) {
      await official.send(data, volatile);
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN || !socketId) return;
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const { encryptedBuffer, iv } = await encryptData(input.room.roomKey, encoded);
    socket.send(
      encodeBroadcast(
        bytesToB64(new Uint8Array(encryptedBuffer)),
        bytesToB64(iv),
        volatile,
      ),
    );
  };

  const applyClients = (clients: string[]) => {
    const keep = new Set(clients);
    for (const id of users.keys()) {
      if (!keep.has(id)) users.delete(id);
    }
    for (const id of clients) {
      if (id === socketId) continue;
      if (!users.has(id)) {
        users.set(id, {
          socketId: id,
          username: "Guest",
          userState: "active",
          color: colorForCollaborator("Guest", id),
        });
      }
    }
    emitUsers();
  };

  const toBytes = (value: unknown): Uint8Array => {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (typeof value === "string") return b64ToBytes(value);
    if (Array.isArray(value)) return Uint8Array.from(value);
    throw new Error("Invalid collaboration payload");
  };

  const handleMessage = async (raw: string) => {
    const frame = parseWireIn(raw);
    if (!frame) return;
    if (frame.t === "ready") {
      markReady(frame.socketId);
      return;
    }
    if (frame.t === "new-user") {
      input.handlers.onPeerJoin?.();
      return;
    }
    if (frame.t === "room-user-change") {
      applyClients(frame.clients);
      return;
    }
    try {
      await applyCipher(b64ToBytes(frame.payload), b64ToBytes(frame.iv));
    } catch {
      /* drop malformed / foreign-room frames */
    }
  };

  const failRelayAndMaybeFallback = () => {
    if (closed) return;
    if (!sawReady && servers.fallback && transport === "relay") {
      relayFails += 1;
      if (relayFails >= 1) transport = "official";
    }
    attempt += 1;
    const delay = Math.min(8000, 400 * 2 ** Math.min(attempt, 4));
    retry = setTimeout(connect, delay);
  };

  const connectOfficial = () => {
    official?.close();
    official = openOfficialSocket({
      room: input.room,
      serverUrl: servers.fallback ?? servers.primary,
      onReady: (id) => {
        attempt = 0;
        markReady(id);
      },
      onPeerJoin: () => input.handlers.onPeerJoin?.(),
      onClients: applyClients,
      onCipher: (encrypted, iv) => {
        try {
          void applyCipher(toBytes(encrypted), toBytes(iv));
        } catch {
          /* drop */
        }
      },
    });
  };

  const connectRelay = () => {
    const url = collabWsUrl(servers.primary, input.room.roomId);
    const next = new WebSocket(url);
    socket = next;
    readyTimer = setTimeout(() => {
      if (sawReady || closed || transport !== "relay") return;
      try {
        next.close();
      } catch {
        /* ignore */
      }
    }, 3500);
    next.onopen = () => {
      attempt = 0;
    };
    next.onmessage = (event) => {
      if (typeof event.data === "string") void handleMessage(event.data);
    };
    next.onclose = () => {
      socketId = undefined;
      socket = null;
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = undefined;
      }
      if (closed) return;
      failRelayAndMaybeFallback();
    };
    next.onerror = () => {
      try {
        next.close();
      } catch {
        /* ignore */
      }
    };
  };

  const connect = () => {
    if (closed) return;
    if (transport === "official") {
      connectOfficial();
      return;
    }
    connectRelay();
  };

  connect();

  return {
    socketId: () => socketId,
    whenReady: (timeoutMs = 3500) => {
      if (socketId) return Promise.resolve(true);
      if (closed) return Promise.resolve(false);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const index = readyWaiters.indexOf(finish);
          if (index >= 0) readyWaiters.splice(index, 1);
          resolve(Boolean(socketId));
        }, timeoutMs);
        const finish = (ok: boolean) => {
          clearTimeout(timer);
          resolve(ok);
        };
        readyWaiters.push(finish);
      });
    },
    setUsername: (next) => {
      const resolved = next.trim() || username;
      if (resolved === username) return;
      username = resolved;
      if (!socketId) return;
      void send(
        {
          type: WS_SUBTYPES.IDLE_STATUS,
          payload: { socketId, userState: "active", username },
        },
        true,
      );
    },
    broadcastScene: async (type, elements) => {
      await send({ type, payload: { elements } });
    },
    broadcastPointer: async ({ pointer, button, selectedElementIds }) => {
      if (!socketId) return;
      await send(
        {
          type: WS_SUBTYPES.MOUSE_LOCATION,
          payload: {
            socketId,
            pointer,
            button,
            selectedElementIds,
            username,
          },
        },
        true,
      );
    },
    close: () => {
      closed = true;
      while (readyWaiters.length) readyWaiters.shift()?.(false);
      if (retry) clearTimeout(retry);
      if (readyTimer) clearTimeout(readyTimer);
      official?.close();
      official = null;
      try {
        socket?.close();
      } catch {
        /* ignore */
      }
      socket = null;
      users.clear();
    },
  };
}

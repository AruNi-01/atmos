import { io, type Socket } from "socket.io-client";
import { WS_EVENTS, type CollabRoom, type SceneMessage } from "./constants";
import { encryptData } from "./crypto";

/** Official Excalidraw oss-collab is Socket.IO, not our Relay WS frames. */
export function openOfficialSocket(input: {
  room: CollabRoom;
  serverUrl: string;
  onReady: (socketId: string) => void;
  onPeerJoin: () => void;
  onClients: (clients: string[]) => void;
  onCipher: (encrypted: unknown, iv: unknown) => void;
}): {
  send: (data: SceneMessage, volatile: boolean) => Promise<void>;
  close: () => void;
} {
  const socket: Socket = io(input.serverUrl, {
    transports: ["websocket", "polling"],
    reconnection: true,
  });

  socket.on(WS_EVENTS.INIT_ROOM, () => {
    socket.emit(WS_EVENTS.JOIN_ROOM, input.room.roomId);
  });
  socket.on("connect", () => {
    if (socket.id) input.onReady(socket.id);
  });
  socket.on(WS_EVENTS.NEW_USER, () => {
    input.onPeerJoin();
  });
  socket.on(WS_EVENTS.ROOM_USER_CHANGE, (clients: string[]) => {
    input.onClients(clients);
  });
  socket.on(WS_EVENTS.CLIENT, (encrypted: unknown, iv: unknown) => {
    input.onCipher(encrypted, iv);
  });

  return {
    send: async (data, volatile) => {
      if (!socket.connected) return;
      const encoded = new TextEncoder().encode(JSON.stringify(data));
      const { encryptedBuffer, iv } = await encryptData(input.room.roomKey, encoded);
      socket.emit(
        volatile ? WS_EVENTS.SERVER_VOLATILE : WS_EVENTS.SERVER,
        input.room.roomId,
        encryptedBuffer,
        iv,
      );
    },
    close: () => {
      socket.removeAllListeners();
      socket.close();
    },
  };
}

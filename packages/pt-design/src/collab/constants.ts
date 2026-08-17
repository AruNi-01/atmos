export { DEFAULT_COLLAB_SERVER } from "./wire";
export const ROOM_ID_BYTES = 10;
export const IV_LENGTH_BYTES = 12;
export const ENCRYPTION_KEY_BITS = 128;

export const WS_EVENTS = {
  SERVER: "server-broadcast",
  SERVER_VOLATILE: "server-volatile-broadcast",
  CLIENT: "client-broadcast",
  INIT_ROOM: "init-room",
  JOIN_ROOM: "join-room",
  NEW_USER: "new-user",
  ROOM_USER_CHANGE: "room-user-change",
} as const;

export const WS_SUBTYPES = {
  INIT: "SCENE_INIT",
  UPDATE: "SCENE_UPDATE",
  MOUSE_LOCATION: "MOUSE_LOCATION",
  IDLE_STATUS: "IDLE_STATUS",
} as const;

export type CollabRoom = {
  roomId: string;
  roomKey: string;
};

export type CollabPointer = {
  x: number;
  y: number;
  tool: "pointer" | "laser";
};

export type CollabUser = {
  socketId: string;
  username: string;
  pointer?: CollabPointer;
  button?: "up" | "down";
  selectedElementIds?: Record<string, boolean>;
  userState?: "active" | "away" | "idle";
  color: { background: string; stroke: string };
};

export type SceneMessage =
  | {
      type: typeof WS_SUBTYPES.INIT | typeof WS_SUBTYPES.UPDATE;
      payload: { elements: readonly unknown[] };
    }
  | {
      type: typeof WS_SUBTYPES.MOUSE_LOCATION;
      payload: {
        socketId: string;
        pointer: CollabPointer;
        button: "up" | "down";
        selectedElementIds?: Record<string, boolean>;
        username: string;
      };
    }
  | {
      type: typeof WS_SUBTYPES.IDLE_STATUS;
      payload: { socketId: string; userState: "active" | "away" | "idle"; username: string };
    };

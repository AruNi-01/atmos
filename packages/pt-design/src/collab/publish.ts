import { openCollabClient } from "./client";
import { parseRoomFromString } from "./room";
import { resolveCollaboratorName } from "./names";
import { resolveLocalCollabServer } from "./local-api";
import type { CollabRoom } from "./constants";
import type { PtElement, PtScene } from "../core/types";

function resolveAgentCollabServer(): string | undefined {
  return (
    resolveLocalCollabServer() ??
    (typeof process !== "undefined" ? process.env.ATMOS_RELAY_URL : undefined) ??
    undefined
  );
}

export function roomFromEnv(): CollabRoom | null {
  if (typeof process === "undefined") return null;
  return (
    parseRoomFromString(process.env.PT_DESIGN_COLLAB_ROOM) ??
    parseRoomFromString(process.env.PT_DESIGN_COLLAB)
  );
}

const sessions = new Map<string, AgentCollabHandle>();

export function collabSessionKey(room: CollabRoom): string {
  return `${room.roomId}:${room.roomKey}`;
}

export type AgentCollabHandle = {
  room: CollabRoom;
  latestElements: () => readonly unknown[];
  waitForLiveScene: (timeoutMs?: number) => Promise<readonly unknown[]>;
  broadcastScene: (elements: readonly unknown[]) => Promise<void>;
  broadcastPointer: (pointer: { x: number; y: number }) => Promise<void>;
  close: () => void;
};

export function sceneFromLiveElements(elements: readonly unknown[]): PtScene {
  return {
    elements: elements as PtElement[],
    appState: { viewBackgroundColor: "#ffffff" },
  };
}

export function ensureAgentCollab(input: {
  room: CollabRoom;
  username?: string;
  serverUrl?: string;
}): AgentCollabHandle {
  const key = collabSessionKey(input.room);
  const existing = sessions.get(key);
  if (existing) return existing;

  let latest: readonly unknown[] = [];
  const client = openCollabClient({
    room: input.room,
    username: resolveCollaboratorName("agent", input.username),
    serverUrl: input.serverUrl ?? resolveAgentCollabServer(),
    handlers: {
      onScene: (_type, elements) => {
        latest = elements;
      },
      onUsers: () => undefined,
    },
  });

  const handle: AgentCollabHandle = {
    room: input.room,
    latestElements: () => latest,
    waitForLiveScene: async (timeoutMs = 1800) => {
      await client.whenReady();
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (latest.length > 0) return latest;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return latest;
    },
    broadcastScene: async (elements) => {
      await client.whenReady();
      await client.broadcastScene("SCENE_UPDATE", elements);
    },
    broadcastPointer: async (pointer) => {
      await client.whenReady();
      await client.broadcastPointer({
        pointer: { ...pointer, tool: "pointer" },
        button: "up",
      });
    },
    close: () => {
      client.close();
      sessions.delete(key);
    },
  };
  sessions.set(key, handle);
  return handle;
}

export async function pullLiveScene(input: {
  room: CollabRoom;
  username?: string;
}): Promise<PtScene | null> {
  const handle = ensureAgentCollab(input);
  const elements = await handle.waitForLiveScene();
  if (elements.length === 0) return null;
  return sceneFromLiveElements(elements);
}

export async function publishAgentScene(input: {
  room?: CollabRoom | null;
  elements: readonly unknown[];
  username?: string;
  pointer?: { x: number; y: number };
}): Promise<boolean> {
  const room = input.room ?? roomFromEnv();
  if (!room) return false;
  const handle = ensureAgentCollab({ room, username: input.username });
  await handle.broadcastScene(input.elements);
  if (input.pointer) await handle.broadcastPointer(input.pointer);
  return true;
}

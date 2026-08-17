"use client";

import React from "react";
import { openCollabClient, type CollabClient } from "../collab/client";
import type { CollabRoom, CollabUser } from "../collab/constants";
import { resolveCollaboratorName } from "../collab/names";
import {
  createRoom,
  inviteUrlForRoom,
  parseRoomFromHash,
  parseRoomFromString,
  writeRoomToUrl,
} from "../collab/room";
import { DEFAULT_COLLAB_SERVER } from "../collab/wire";
import type { CollabMode } from "./SharePopover";
import type { ExcalidrawHostApi } from "./scene-bridge";

export const COLLAB_ROOM_STORAGE_KEY = "pt-design:collab-room";
const NAME_STORAGE_KEY = "pt-design:collab-username";
const MODE_STORAGE_KEY = "pt-design:collab-mode";

function readStoredMode(): CollabMode {
  if (typeof localStorage === "undefined") return "local";
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === "invite" ? "invite" : "local";
  } catch {
    return "local";
  }
}

function storeMode(mode: CollabMode) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MODE_STORAGE_KEY, mode);
}

export function readStoredRoom(): CollabRoom | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(COLLAB_ROOM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CollabRoom>;
    if (parsed.roomId && parsed.roomKey) return { roomId: parsed.roomId, roomKey: parsed.roomKey };
  } catch {
    /* ignore */
  }
  return null;
}

function storeRoom(room: CollabRoom) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(COLLAB_ROOM_STORAGE_KEY, JSON.stringify(room));
}

function clearStoredRoom() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(COLLAB_ROOM_STORAGE_KEY);
}

function readStoredName(fallback?: string): string {
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(NAME_STORAGE_KEY)?.trim();
      if (stored) return stored;
    } catch {
      /* ignore */
    }
  }
  return resolveCollaboratorName("human", fallback);
}

function storeName(name: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(NAME_STORAGE_KEY, name);
}

function clearRoomFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.hash.includes("room=")) return;
  url.hash = "";
  const next = `${url.pathname}${url.search}`;
  window.history.replaceState(window.history.state, "", next);
}

function sameRoom(a: CollabRoom | null, b: CollabRoom | null): boolean {
  return Boolean(a && b && a.roomId === b.roomId && a.roomKey === b.roomKey);
}

export function readInitialRoom(): CollabRoom | null {
  if (typeof window === "undefined") return null;
  return parseRoomFromHash(window.location.hash) ?? readStoredRoom();
}

export function useExcalidrawCollab(input: {
  api: ExcalidrawHostApi | null;
  username?: string;
  serverUrl?: string;
  getElements: () => readonly unknown[];
  applyRemoteElements: (elements: readonly unknown[]) => void;
}) {
  const initial = React.useMemo(() => readInitialRoom(), []);
  const [room, setRoom] = React.useState<CollabRoom | null>(initial);
  const [mode, setModeState] = React.useState<CollabMode>(() => readStoredMode());
  const [users, setUsers] = React.useState<CollabUser[]>([]);
  const [shareUrl, setShareUrl] = React.useState<string | null>(
    () => (initial ? inviteUrlForRoom(initial) : null),
  );
  const [username, setUsernameState] = React.useState(() => readStoredName(input.username));
  const clientRef = React.useRef<CollabClient | null>(null);
  const applyRef = React.useRef(input.applyRemoteElements);
  const elementsRef = React.useRef(input.getElements);
  const usernameRef = React.useRef(username);
  const roomRef = React.useRef(room);
  const serverUrlRef = React.useRef(input.serverUrl);
  const modeRef = React.useRef(mode);
  const generationRef = React.useRef(0);
  applyRef.current = input.applyRemoteElements;
  elementsRef.current = input.getElements;
  usernameRef.current = username;
  roomRef.current = room;
  modeRef.current = mode;
  serverUrlRef.current = mode === "invite" ? DEFAULT_COLLAB_SERVER : input.serverUrl;

  const attach = React.useCallback((next: CollabRoom) => {
    clientRef.current?.close();
    storeRoom(next);
    writeRoomToUrl(next);
    setRoom(next);
    setShareUrl(inviteUrlForRoom(next));
    clientRef.current = openCollabClient({
      room: next,
      username: usernameRef.current,
      serverUrl: serverUrlRef.current,
      handlers: {
        onScene: (_type, elements) => {
          applyRef.current(elements);
        },
        onUsers: setUsers,
        onPeerJoin: () => {
          void clientRef.current?.broadcastScene("SCENE_INIT", elementsRef.current());
        },
      },
    });
  }, []);

  React.useEffect(() => {
    const existing = readInitialRoom();
    if (existing) attach(existing);
    return () => {
      generationRef.current += 1;
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [attach, input.serverUrl, mode]);

  React.useEffect(() => {
    const reconnect = () => {
      if (document.visibilityState !== "visible") return;
      const current = roomRef.current ?? readStoredRoom();
      if (!current || clientRef.current) return;
      attach(current);
    };
    document.addEventListener("visibilitychange", reconnect);
    window.addEventListener("pageshow", reconnect);
    return () => {
      document.removeEventListener("visibilitychange", reconnect);
      window.removeEventListener("pageshow", reconnect);
    };
  }, [attach]);

  const start = React.useCallback(async () => {
    const current = roomRef.current ?? readStoredRoom();
    if (current) {
      if (!sameRoom(roomRef.current, current) || !clientRef.current) attach(current);
      const url = inviteUrlForRoom(current);
      setShareUrl(url);
      return url;
    }
    const token = ++generationRef.current;
    const created = await createRoom();
    if (token !== generationRef.current) return null;
    attach(created);
    return inviteUrlForRoom(created);
  }, [attach]);

  const join = React.useCallback(
    (raw: string) => {
      const parsed = parseRoomFromString(raw);
      if (!parsed) return false;
      storeMode("invite");
      setModeState("invite");
      if (sameRoom(roomRef.current, parsed) && clientRef.current) {
        setShareUrl(inviteUrlForRoom(parsed));
        return true;
      }
      attach(parsed);
      return true;
    },
    [attach],
  );

  const stop = React.useCallback(() => {
    generationRef.current += 1;
    clientRef.current?.close();
    clientRef.current = null;
    clearStoredRoom();
    clearRoomFromUrl();
    setRoom(null);
    setUsers([]);
    setShareUrl(null);
  }, []);

  const setMode = React.useCallback(
    (next: CollabMode) => {
      if (next === modeRef.current) return;
      storeMode(next);
      setModeState(next);
    },
    [],
  );

  const setUsername = React.useCallback((next: string) => {
    const resolved = next.trim() || readStoredName();
    setUsernameState(resolved);
    storeName(resolved);
    clientRef.current?.setUsername(resolved);
  }, []);

  const broadcastScene = React.useCallback((elements: readonly unknown[]) => {
    void clientRef.current?.broadcastScene("SCENE_UPDATE", elements);
  }, []);

  const broadcastPointer = React.useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "up" | "down";
      selectedElementIds?: Record<string, boolean>;
    }) => {
      void clientRef.current?.broadcastPointer(payload);
    },
    [],
  );

  return {
    isCollaborating: Boolean(room),
    users,
    room,
    mode,
    setMode,
    shareUrl,
    username,
    setUsername,
    start,
    join,
    stop,
    broadcastScene,
    broadcastPointer,
  };
}

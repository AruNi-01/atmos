import { ROOM_ID_BYTES, type CollabRoom } from "./constants";
import { generateEncryptionKey } from "./crypto";

export const DEFAULT_SHARE_ORIGIN = "https://app.atmos.land";

function envFlag(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isPrivateShareHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "tauri.localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function withPtDesignTab(url: URL): URL {
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("tab", "pt-design");
  return url;
}

/** Public origin for copied share links. Loopback / LAN never go into the clipboard. */
export function resolveShareBase(href?: string): string {
  const override =
    envFlag("PT_DESIGN_SHARE_ORIGIN") ||
    envFlag("NEXT_PUBLIC_PT_DESIGN_SHARE_ORIGIN") ||
    envFlag("PT_DESIGN_SHARE_URL") ||
    envFlag("NEXT_PUBLIC_PT_DESIGN_SHARE_URL");
  if (override) {
    try {
      return `${withPtDesignTab(new URL(override)).origin}/?tab=pt-design`;
    } catch {
      /* fall through */
    }
  }

  const candidate = href ?? (typeof window !== "undefined" ? window.location.href : undefined);
  if (candidate) {
    try {
      const url = new URL(candidate);
      if (isPrivateShareHost(url.hostname) || url.protocol === "http:") {
        return `${url.protocol}//${url.host}/?tab=pt-design`;
      }
      if (url.protocol === "https:") {
        return `${url.origin}/?tab=pt-design`;
      }
    } catch {
      /* fall through */
    }
  }

  return `${DEFAULT_SHARE_ORIGIN}/?tab=pt-design`;
}

function roomFromPair(value: string | null | undefined): CollabRoom | null {
  if (!value) return null;
  const comma = value.indexOf(",");
  if (comma <= 0 || comma === value.length - 1) return null;
  const roomId = value.slice(0, comma).trim();
  const roomKey = value.slice(comma + 1).trim();
  if (!roomId || !roomKey) return null;
  return { roomId, roomKey };
}

export function parseRoomFromHash(hash: string): CollabRoom | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw.includes("=") ? raw : `room=${raw}`);
  return roomFromPair(params.get("room") ?? params.get("pt-room"));
}

export function parseRoomFromSearch(search: string): CollabRoom | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return roomFromPair(params.get("room") ?? params.get("pt-room"));
}

/** Accepts a share URL, `#room=id,key`, or `id,key`. */
export function parseRoomFromString(value: string | undefined | null): CollabRoom | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return parseRoomFromHash(url.hash) ?? parseRoomFromSearch(url.search);
  } catch {
    /* not an absolute URL */
  }
  if (trimmed.startsWith("?") || trimmed.includes("#room=") || trimmed.includes("room=")) {
    try {
      const url = new URL(trimmed, `${DEFAULT_SHARE_ORIGIN}/`);
      return parseRoomFromHash(url.hash) ?? parseRoomFromSearch(url.search) ?? parseRoomFromHash(trimmed);
    } catch {
      return parseRoomFromHash(trimmed);
    }
  }
  return roomFromPair(trimmed);
}

export function roomToHash(room: CollabRoom): string {
  return `#room=${room.roomId},${room.roomKey}`;
}

export function writeRoomToUrl(room: CollabRoom): string {
  if (typeof window === "undefined") return roomToHash(room);
  const url = new URL(window.location.href);
  url.hash = `room=${room.roomId},${room.roomKey}`;
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return url.toString();
}

export function shareUrlForRoom(room: CollabRoom, href?: string): string {
  const url = new URL(resolveShareBase(href));
  url.hash = `room=${room.roomId},${room.roomKey}`;
  return url.toString();
}

/** Public invite link for remote humans. Always hosted, never loopback. */
export function inviteUrlForRoom(room: CollabRoom): string {
  const url = new URL(`${DEFAULT_SHARE_ORIGIN}/?tab=pt-design`);
  url.hash = `room=${room.roomId},${room.roomKey}`;
  return url.toString();
}

export async function createRoom(): Promise<CollabRoom> {
  const bytes = new Uint8Array(ROOM_ID_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  const roomId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const roomKey = await generateEncryptionKey();
  return { roomId, roomKey };
}

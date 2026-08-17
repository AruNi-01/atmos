/** Native WebSocket frames for the Atmos Relay PT Design room DO. */

export const DEFAULT_COLLAB_SERVER = "https://relay.atmos.land";
export const OFFICIAL_COLLAB_SERVER = "https://oss-collab.excalidraw.com";
const OFFICIAL_COLLAB_HOST = new URL(OFFICIAL_COLLAB_SERVER).hostname;

export function isOfficialCollabHost(server: string): boolean {
  try {
    const raw = server.trim();
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.replace(/\.$/, "").toLowerCase() === OFFICIAL_COLLAB_HOST;
  } catch {
    return false;
  }
}

function envFlag(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function collabFallbackDisabled(): boolean {
  const raw = envFlag("PT_DESIGN_COLLAB_FALLBACK") ?? envFlag("NEXT_PUBLIC_PT_DESIGN_COLLAB_FALLBACK");
  return raw === "0" || raw === "false";
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "tauri.localhost" ||
    host.endsWith(".localhost")
  );
}

export function isLocalCollabServer(server: string): boolean {
  try {
    return isLoopbackHost(new URL(server).hostname);
  } catch {
    return isLoopbackHost(server);
  }
}

export function inferLocalCollabServer(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    if (!isLoopbackHost(url.hostname)) return null;
    const apiPort = envFlag("NEXT_PUBLIC_API_PORT") || "30303";
    const pagePort = url.port || (url.protocol === "https:" ? "443" : "80");
    if (pagePort === apiPort) return url.origin;
    return `${url.protocol}//${url.hostname}:${apiPort}`;
  } catch {
    return null;
  }
}

export function resolveCollabServers(explicit?: string): { primary: string; fallback: string | null } {
  const primary =
    explicit ||
    envFlag("PT_DESIGN_COLLAB_URL") ||
    envFlag("NEXT_PUBLIC_PT_DESIGN_COLLAB_URL") ||
    inferLocalCollabServer() ||
    envFlag("ATMOS_API_URL") ||
    envFlag("ATMOS_RELAY_URL") ||
    envFlag("NEXT_PUBLIC_ATMOS_RELAY_URL") ||
    DEFAULT_COLLAB_SERVER;
  if (collabFallbackDisabled() || isOfficialCollabHost(primary) || isLocalCollabServer(primary)) {
    return { primary, fallback: null };
  }
  return { primary, fallback: OFFICIAL_COLLAB_SERVER };
}

export function isValidRoomId(roomId: string): boolean {
  return /^[a-f0-9]{16,64}$/i.test(roomId);
}

export function collabWsUrl(server: string, roomId: string): string {
  const url = new URL(server);
  url.protocol = url.protocol === "http:" || url.protocol === "ws:" ? "ws:" : "wss:";
  url.pathname = `/ws/pt-design/${roomId}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export type WireIn =
  | { t: "ready"; socketId: string }
  | { t: "new-user"; socketId: string }
  | { t: "room-user-change"; clients: string[] }
  | { t: "client-broadcast"; payload: string; iv: string };

export type WireOut = {
  t: "broadcast";
  volatile?: boolean;
  payload: string;
  iv: string;
};

export function parseWireIn(raw: string): WireIn | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WireIn> & { t?: string };
    if (parsed.t === "ready" && typeof parsed.socketId === "string") {
      return { t: "ready", socketId: parsed.socketId };
    }
    if (parsed.t === "new-user" && typeof parsed.socketId === "string") {
      return { t: "new-user", socketId: parsed.socketId };
    }
    if (parsed.t === "room-user-change" && Array.isArray(parsed.clients)) {
      return {
        t: "room-user-change",
        clients: parsed.clients.filter((id): id is string => typeof id === "string"),
      };
    }
    if (
      parsed.t === "client-broadcast" &&
      typeof parsed.payload === "string" &&
      typeof parsed.iv === "string"
    ) {
      return { t: "client-broadcast", payload: parsed.payload, iv: parsed.iv };
    }
    return null;
  } catch {
    return null;
  }
}

export function encodeBroadcast(payload: string, iv: string, volatile = false): string {
  const frame: WireOut = { t: "broadcast", payload, iv, volatile };
  return JSON.stringify(frame);
}

export function bytesToB64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function b64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

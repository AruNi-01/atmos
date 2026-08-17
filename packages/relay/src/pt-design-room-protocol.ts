const MAX_MESSAGE_CHARS = 1_000_000;
export const PT_DESIGN_ROOM_ID_RE = /^[a-f0-9]{16,64}$/i;

export function isValidPtDesignRoomId(roomId: string): boolean {
  return PT_DESIGN_ROOM_ID_RE.test(roomId);
}

/** `/ws/pt-design/:roomId` — also accepts a trailing slash. */
export function parsePtDesignRoomPath(pathname: string): string | null {
  const match = pathname.match(/^\/ws\/pt-design\/([a-f0-9]{16,64})\/?$/i);
  return match?.[1] ?? null;
}

export type PtDesignClientFrame = {
  t: "broadcast";
  volatile?: boolean;
  payload: string;
  iv: string;
};

export function parseClientFrame(raw: string): PtDesignClientFrame | null {
  if (raw.length > MAX_MESSAGE_CHARS) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PtDesignClientFrame>;
    if (parsed.t !== "broadcast") return null;
    if (typeof parsed.payload !== "string" || typeof parsed.iv !== "string") return null;
    if (parsed.payload.length + parsed.iv.length > MAX_MESSAGE_CHARS) return null;
    return {
      t: "broadcast",
      volatile: parsed.volatile === true,
      payload: parsed.payload,
      iv: parsed.iv,
    };
  } catch {
    return null;
  }
}

/**
 * Invite links from `@atmos/pt-design` look like
 * `https://app.atmos.land/?tab=pt-design#room=id,key`.
 * Keep this parser aligned with `packages/pt-design/src/collab/room.ts`.
 */
function roomFromPair(value: string | null | undefined): boolean {
  if (!value) return false;
  const comma = value.indexOf(",");
  if (comma <= 0 || comma === value.length - 1) return false;
  const roomId = value.slice(0, comma).trim();
  const roomKey = value.slice(comma + 1).trim();
  return Boolean(roomId && roomKey);
}

export function hasPtDesignCollabInvite(href?: string): boolean {
  const raw = href ?? (typeof window !== "undefined" ? window.location.href : "");
  if (!raw) return false;
  try {
    const url = new URL(raw, "https://app.atmos.land");
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    const hashParams = hash
      ? new URLSearchParams(hash.includes("=") ? hash : `room=${hash}`)
      : null;
    return roomFromPair(
      hashParams?.get("room") ||
        hashParams?.get("pt-room") ||
        url.searchParams.get("room") ||
        url.searchParams.get("pt-room"),
    );
  } catch {
    return false;
  }
}

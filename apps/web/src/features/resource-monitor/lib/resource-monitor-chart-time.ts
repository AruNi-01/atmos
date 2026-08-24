export function formatHostHistoryLocalTime(receivedAtMs: number): string {
  if (!Number.isFinite(receivedAtMs) || receivedAtMs <= 0) return "";
  return new Date(receivedAtMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function hostHistoryAgeSeconds(receivedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(receivedAtMs) || !Number.isFinite(nowMs) || receivedAtMs <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((nowMs - receivedAtMs) / 1000));
}

export type HostHistoryRelativeKind = "now" | "seconds" | "minutes";

export function hostHistoryRelative(
  ageSeconds: number,
): { kind: HostHistoryRelativeKind; count: number } {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 5) {
    return { kind: "now", count: 0 };
  }
  if (ageSeconds < 60) {
    return { kind: "seconds", count: Math.round(ageSeconds) };
  }
  return { kind: "minutes", count: Math.max(1, Math.round(ageSeconds / 60)) };
}

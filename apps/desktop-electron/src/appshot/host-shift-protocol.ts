/**
 * NDJSON lines from the Desktop Use AppShot inject socket.
 * Kept Electron-free so unit tests can parse payloads without loading electron.
 */

export type HostShiftCapturedPayload = {
  t: "captured";
  app_name: string;
  bundle_id: string | null;
  process_id: number;
  window_id: number;
  window_title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  png_path: string;
  quality: string;
};

export type HostShiftParsedLine =
  | HostShiftCapturedPayload
  | { t: "need_grant"; missing: string[] }
  | { t: "ignored"; reason: string }
  | { t: "chord" }
  | { t: "digit"; digit: number }
  | { t: "ready"; ax: boolean; tap: boolean }
  | { t: "error"; msg: string };

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Parse one NDJSON line from the host inject socket. */
export function parseHostShiftLine(line: string): HostShiftParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  const t = raw.t;
  if (t === "captured") {
    const png_path = asOptionalString(raw.png_path);
    const app_name = asOptionalString(raw.app_name) ?? "Application";
    const x = asFiniteNumber(raw.x);
    const y = asFiniteNumber(raw.y);
    const width = asFiniteNumber(raw.width);
    const height = asFiniteNumber(raw.height);
    const process_id = asFiniteNumber(raw.process_id);
    const window_id = asFiniteNumber(raw.window_id);
    if (!png_path || x == null || y == null || width == null || height == null) {
      return { t: "ignored", reason: "bad_captured" };
    }
    return {
      t: "captured",
      app_name,
      bundle_id: asOptionalString(raw.bundle_id),
      process_id: process_id ?? 0,
      window_id: window_id ?? 0,
      window_title: asOptionalString(raw.window_title),
      x,
      y,
      width,
      height,
      png_path,
      quality: asOptionalString(raw.quality) ?? "window",
    };
  }
  if (t === "need_grant") {
    const missing = Array.isArray(raw.missing)
      ? raw.missing.filter((item): item is string => typeof item === "string")
      : [];
    return { t: "need_grant", missing };
  }
  if (t === "ignored") {
    return {
      t: "ignored",
      reason: asOptionalString(raw.reason) ?? "unknown",
    };
  }
  if (t === "chord") return { t: "chord" };
  if (t === "digit") {
    const digit = asFiniteNumber(raw.digit);
    if (digit == null || digit < 3 || digit > 6) return null;
    return { t: "digit", digit };
  }
  if (t === "ready") {
    return {
      t: "ready",
      ax: raw.ax === true,
      tap: raw.tap === true,
    };
  }
  if (t === "error") {
    return { t: "error", msg: asOptionalString(raw.msg) ?? "error" };
  }
  return null;
}

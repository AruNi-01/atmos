/**
 * AppShot protocol contract — must match
 * apps/desktop/src-tauri/src/appshot/protocol.rs
 */

export const APPSHOT_PROTOCOL_PREFIX = "atmos://appshots/";

/** 13-digit millisecond timestamp (Tauri allocate_timestamp shape). */
export function isValidTimestamp(timestamp: string): boolean {
  return timestamp.length === 13 && /^[0-9]+$/.test(timestamp);
}

/**
 * Clipboard / paste protocol text consumed by web composers.
 * Paths use the portable `~/.atmos/appshots/records/...` form (never absolute home).
 */
export function formatProtocolPrompt(timestamp: string): string {
  if (!isValidTimestamp(timestamp)) {
    throw new Error("invalid appshot timestamp");
  }
  return (
    `${APPSHOT_PROTOCOL_PREFIX}${timestamp}\n` +
    `Appshot record is stored locally in Atmos appshots records for timestamp ${timestamp}. ` +
    `The default location is ~/.atmos/appshots/records/${timestamp}/. ` +
    `Read metadata.json, context.md, and snapshot.png before answering. ` +
    `Inspect snapshot.png when visual context matters.`
  );
}

/** Allocate a unique 13-digit ms timestamp not already present under recordsRoot. */
export function allocateTimestamp(
  recordsRoot: string,
  existsSyncFn: (p: string) => boolean,
  nowMs: number = Date.now(),
  joinFn: (a: string, b: string) => string = (a, b) =>
    a.endsWith("/") || a.endsWith("\\") ? `${a}${b}` : `${a}/${b}`,
): string {
  let millis = Math.trunc(nowMs);
  // Ensure 13 digits (ms since epoch is 13 digits until year ~2286)
  if (millis < 1e12) millis = millis * 1000;
  for (let i = 0; i < 1000; i++) {
    const timestamp = String(millis);
    if (isValidTimestamp(timestamp) && !existsSyncFn(joinFn(recordsRoot, timestamp))) {
      return timestamp;
    }
    millis += 1;
  }
  throw new Error("failed to allocate appshot timestamp");
}

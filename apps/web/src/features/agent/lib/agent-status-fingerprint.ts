import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";

const IDLE = "idle";
const RUNNING = "running";
const PERMISSION = "permission_request";

/**
 * Stable string for Zustand selectors. Unchanged occupancy must not re-render
 * Footer / sidebar when an unrelated session updates.
 */
export function sessionsOccupancyFingerprint(
  sessions: ReadonlyMap<string, AgentStatusRecord>,
): string {
  if (sessions.size === 0) return "";
  const parts: string[] = [];
  for (const session of sessions.values()) {
    parts.push(
      `${session.session_id}:${session.state}:${session.context_id ?? ""}`,
    );
  }
  parts.sort();
  return parts.join("|");
}

export function contextOccupancyFingerprint(
  sessions: ReadonlyMap<string, AgentStatusRecord>,
  contextIds: readonly string[],
): string {
  if (contextIds.length === 0) return "";
  const wanted = new Set(contextIds);
  const occupancy = new Map<string, string>();
  for (const id of contextIds) occupancy.set(id, IDLE);
  for (const session of sessions.values()) {
    const id = session.context_id;
    if (!id || !wanted.has(id)) continue;
    const current = occupancy.get(id) ?? IDLE;
    if (session.state === PERMISSION) {
      occupancy.set(id, PERMISSION);
    } else if (session.state === RUNNING && current === IDLE) {
      occupancy.set(id, RUNNING);
    }
  }
  let out = "";
  for (const id of contextIds) {
    out += id;
    out += ":";
    out += occupancy.get(id) ?? IDLE;
    out += "|";
  }
  return out;
}

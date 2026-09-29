import type { AgentActivity } from "@atmos/api-types/ws/dto/events";

/** Live WS updates win over a REST snapshot that started before they arrived. */
export function mergeActivityHydration(
  snapshot: Map<string, AgentActivity>,
  live: Map<string, AgentActivity>,
  clearedIds: ReadonlySet<string>,
): Map<string, AgentActivity> {
  const next = new Map<string, AgentActivity>();
  for (const [id, rec] of snapshot) {
    if (clearedIds.has(id)) continue;
    next.set(id, rec);
  }
  for (const [id, rec] of live) {
    if (clearedIds.has(id)) continue;
    const snap = next.get(id);
    if (!snap || rec.last_event_at >= snap.last_event_at) {
      next.set(id, rec);
    }
  }
  return next;
}

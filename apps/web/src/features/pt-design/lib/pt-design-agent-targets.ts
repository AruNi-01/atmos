export function instanceIdsFromToolData(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.instanceIds)) {
    return rec.instanceIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  if (typeof rec.instanceId === "string" && rec.instanceId) return [rec.instanceId];
  if (Array.isArray(rec.results)) {
    return rec.results.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (row.ok === false) return [];
      return instanceIdsFromToolData(row.data);
    });
  }
  return [];
}

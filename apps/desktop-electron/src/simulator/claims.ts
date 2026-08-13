import type { ClaimTable, SimulatorClaim } from "./types.ts";

export type ClaimAcquireResult =
  | { ok: true; table: ClaimTable }
  | { ok: false; code: "simulator_in_use"; holder: SimulatorClaim };

export function tryAcquireClaim(
  table: ClaimTable,
  simulatorId: string,
  workspaceId: string,
  instanceId: string,
  since: string,
): ClaimAcquireResult {
  const existing = table[simulatorId];
  if (
    existing &&
    (existing.workspaceId !== workspaceId || existing.instanceId !== instanceId)
  ) {
    return { ok: false, code: "simulator_in_use", holder: existing };
  }
  return {
    ok: true,
    table: {
      ...table,
      [simulatorId]: { workspaceId, instanceId, since },
    },
  };
}

export function releaseClaim(
  table: ClaimTable,
  simulatorId: string,
  workspaceId: string,
): ClaimTable {
  const existing = table[simulatorId];
  if (!existing || existing.workspaceId !== workspaceId) return table;
  const next = { ...table };
  delete next[simulatorId];
  return next;
}

export function takeOverClaim(
  table: ClaimTable,
  simulatorId: string,
  workspaceId: string,
  instanceId: string,
  since: string,
): { table: ClaimTable; previous: SimulatorClaim | null } {
  const previous = table[simulatorId] ?? null;
  return {
    previous,
    table: {
      ...table,
      [simulatorId]: { workspaceId, instanceId, since },
    },
  };
}

export function claimsHeldByWorkspace(
  table: ClaimTable,
  workspaceId: string,
): string[] {
  return Object.entries(table)
    .filter(([, claim]) => claim.workspaceId === workspaceId)
    .map(([id]) => id);
}

import type { ClaimTable, SimulatorClaim } from "./types.ts";

export type ClaimAcquireResult =
  | { ok: true; table: ClaimTable }
  | { ok: false; code: "simulator_in_use"; holder: SimulatorClaim };

export function tryAcquireClaim(
  table: ClaimTable,
  simulatorId: string,
  claim: SimulatorClaim,
): ClaimAcquireResult {
  const existing = table[simulatorId];
  if (
    existing &&
    (existing.workspaceId !== claim.workspaceId || existing.instanceId !== claim.instanceId)
  ) {
    return { ok: false, code: "simulator_in_use", holder: existing };
  }
  return {
    ok: true,
    table: {
      ...table,
      [simulatorId]: claim,
    },
  };
}

export function releaseClaim(
  table: ClaimTable,
  simulatorId: string,
  workspaceId: string,
  instanceId: string,
): ClaimTable {
  const existing = table[simulatorId];
  if (!existing || existing.workspaceId !== workspaceId) return table;
  if (existing.instanceId !== instanceId) return table;
  const next = { ...table };
  delete next[simulatorId];
  return next;
}

export function takeOverClaim(
  table: ClaimTable,
  simulatorId: string,
  claim: SimulatorClaim,
): { table: ClaimTable; previous: SimulatorClaim | null } {
  const previous = table[simulatorId] ?? null;
  return {
    previous,
    table: {
      ...table,
      [simulatorId]: claim,
    },
  };
}

export function dropClaims(table: ClaimTable, ids: Iterable<string>): ClaimTable {
  const drop = new Set(ids);
  if (drop.size === 0) return table;
  const next: ClaimTable = {};
  for (const [id, claim] of Object.entries(table)) {
    if (!drop.has(id)) next[id] = claim;
  }
  return next;
}

export function dropClaimsHeldBy(
  table: ClaimTable,
  opts: { instanceId: string; desktopPid: number },
): ClaimTable {
  const next: ClaimTable = {};
  for (const [id, claim] of Object.entries(table)) {
    if (claim.instanceId === opts.instanceId || claim.desktopPid === opts.desktopPid) {
      continue;
    }
    next[id] = claim;
  }
  return next;
}

export function claimsHeldByWorkspace(
  table: ClaimTable,
  workspaceId: string,
): string[] {
  return Object.entries(table)
    .filter(([, claim]) => claim.workspaceId === workspaceId)
    .map(([id]) => id);
}

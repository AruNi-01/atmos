import { parseHelperStateRecord } from "./handshake.ts";
import type { ClaimTable, SimulatorClaim } from "./types.ts";

export type ListedHelper = {
  pid?: number;
  simulatorId?: string;
  port?: number;
};

export type OrphanPlan = {
  killSimulatorIds: string[];
  killPids: number[];
  dropClaimIds: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function rowsFromUnknown(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const row = asRecord(parsed);
  if (!row) return [];
  for (const key of ["streams", "sessions", "helpers", "items"]) {
    const value = row[key];
    if (Array.isArray(value)) return value;
  }
  if (num(row.pid) || str(row.udid) || str(row["device"]) || str(row.simulatorId)) {
    return [row];
  }
  return [];
}

function normalizeListed(value: unknown): ListedHelper {
  const row = asRecord(value) ?? {};
  return {
    pid: num(row.pid),
    // Upstream JSON field name is `device` (helper-owned).
    simulatorId: str(row.udid) ?? str(row["device"]) ?? str(row.simulatorId) ?? str(row.id),
    port: num(row.port),
  };
}

export function parseHelperList(stdout: string): ListedHelper[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return rowsFromUnknown(parsed)
      .map(normalizeListed)
      .filter((item) => item.pid || item.simulatorId);
  } catch {
    return [];
  }
}

export function listedHelperFromStateRecordRaw(raw: string): ListedHelper | null {
  try {
    const record = parseHelperStateRecord(raw);
    return {
      pid: record.pid,
      simulatorId: record.simulatorId,
      port: record.port,
    };
  } catch {
    return null;
  }
}

function claimOwnerIsLiveOther(
  claim: SimulatorClaim,
  selfPid: number,
  isPidAlive: (pid: number) => boolean,
): boolean {
  const pid = claim.desktopPid;
  if (typeof pid !== "number" || pid <= 0) return false;
  if (pid === selfPid) return false;
  return isPidAlive(pid);
}

function helperOwnedByLiveOther(
  item: ListedHelper,
  claims: ClaimTable,
  selfPid: number,
  isPidAlive: (pid: number) => boolean,
): boolean {
  if (item.simulatorId) {
    const claim = claims[item.simulatorId];
    if (claim && claimOwnerIsLiveOther(claim, selfPid, isPidAlive)) return true;
  }
  if (!item.pid) return false;
  return Object.values(claims).some(
    (claim) =>
      claim.helperPid === item.pid && claimOwnerIsLiveOther(claim, selfPid, isPidAlive),
  );
}

export function planOrphanKills(input: {
  listed: ListedHelper[];
  claims: ClaimTable;
  sessionHelperPids: Set<number>;
  sessionSimulatorIds: Set<string>;
  selfPid: number;
  isPidAlive: (pid: number) => boolean;
}): OrphanPlan {
  const killSimulatorIds = new Set<string>();
  const killPids = new Set<number>();
  const dropClaimIds = new Set<string>();

  for (const item of input.listed) {
    if (item.pid && input.sessionHelperPids.has(item.pid)) continue;
    if (item.simulatorId && input.sessionSimulatorIds.has(item.simulatorId)) {
      continue;
    }
    if (helperOwnedByLiveOther(item, input.claims, input.selfPid, input.isPidAlive)) {
      continue;
    }
    if (item.simulatorId) {
      killSimulatorIds.add(item.simulatorId);
      if (input.claims[item.simulatorId]) dropClaimIds.add(item.simulatorId);
    } else if (item.pid) {
      killPids.add(item.pid);
    }
  }

  for (const [id, claim] of Object.entries(input.claims)) {
    if (input.sessionSimulatorIds.has(id)) continue;
    if (claimOwnerIsLiveOther(claim, input.selfPid, input.isPidAlive)) continue;
    dropClaimIds.add(id);
    killSimulatorIds.add(id);
  }

  return {
    killSimulatorIds: [...killSimulatorIds].sort(),
    killPids: [...killPids].sort((a, b) => a - b),
    dropClaimIds: [...dropClaimIds].sort(),
  };
}

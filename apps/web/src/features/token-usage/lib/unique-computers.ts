import { activeComputers, type ComputerRow } from "@atmos/relay-client";

export const ALL_COMPUTERS_VALUE = "all";

const APP_DEVICE_ID_PATTERN = /^[a-f0-9]{64}$/;

export type DeviceKey = `app:${string}` | `server:${string}` | `local:${string}`;

export type UniqueComputer = {
  key: DeviceKey;
  serverId: string | null;
  label: string;
  isCurrent: boolean;
};

export type LocalDeviceInput = {
  serverId: string | null;
  appDeviceId: string | null;
  displayName: string;
} | null;

function normalizeAppDeviceId(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? "";
  return APP_DEVICE_ID_PATTERN.test(value) ? value : null;
}

function deviceKeyForRow(row: ComputerRow): DeviceKey {
  const appDeviceId = normalizeAppDeviceId(row.app_device_id);
  if (appDeviceId) return `app:${appDeviceId}`;
  return `server:${row.server_id}`;
}

function representativeRank(row: ComputerRow): [number, number, number] {
  return [
    row.online ? 1 : 0,
    row.last_seen_at ?? -1,
    row.created_at,
  ];
}

function pickRepresentative(rows: ComputerRow[]): ComputerRow {
  return rows.reduce((best, row) => {
    const a = representativeRank(row);
    const b = representativeRank(best);
    if (a[0] !== b[0]) return a[0] > b[0] ? row : best;
    if (a[1] !== b[1]) return a[1] > b[1] ? row : best;
    return a[2] >= b[2] ? row : best;
  });
}

function fallbackLabel(row: ComputerRow): string {
  const name = row.display_name?.trim();
  return name || "Computer";
}

export function uniqueComputers(
  computers: ComputerRow[],
  local: LocalDeviceInput,
  currentServerId: string | null,
): UniqueComputer[] {
  const groups = new Map<DeviceKey, ComputerRow[]>();
  for (const row of activeComputers(computers)) {
    const key = deviceKeyForRow(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const localAppId = normalizeAppDeviceId(local?.appDeviceId);
  const localServerId = local?.serverId?.trim() || null;
  const currentId = currentServerId?.trim() || null;

  const devices: UniqueComputer[] = [...groups.entries()].map(([key, rows]) => {
    const representative = pickRepresentative(rows);
    const isCurrent =
      rows.some((row) => row.server_id === currentId) ||
      rows.some((row) => row.server_id === localServerId) ||
      (localAppId != null && key === `app:${localAppId}`);
    return {
      key,
      serverId: representative.server_id,
      label: fallbackLabel(representative),
      isCurrent,
    };
  });

  const localMatched =
    localAppId != null && devices.some((device) => device.key === `app:${localAppId}`);
  const localServerMatched =
    localServerId != null &&
    devices.some((device) => device.serverId === localServerId);
  if (local && !localMatched && !localServerMatched) {
    devices.push({
      key: `local:${localServerId ?? "unregistered"}`,
      serverId: null,
      label: local.displayName.trim() || "Computer",
      isCurrent: true,
    });
  }

  const labelCounts = new Map<string, number>();
  for (const device of devices) {
    labelCounts.set(device.label, (labelCounts.get(device.label) ?? 0) + 1);
  }
  return devices.map((device) => {
    if ((labelCounts.get(device.label) ?? 0) < 2 || !device.serverId) {
      return device;
    }
    return {
      ...device,
      label: `${device.label} · ${device.serverId.slice(0, 8)}`,
    };
  });
}

export function shouldShowComputerSelect(opts: {
  signedIn: boolean;
  uniqueCount: number;
}): boolean {
  return opts.signedIn && opts.uniqueCount >= 2;
}

export function currentUniqueComputer(
  devices: UniqueComputer[],
): UniqueComputer | null {
  return devices.find((device) => device.isCurrent) ?? devices[0] ?? null;
}

export function allComputersFetchTargets(
  devices: UniqueComputer[],
): UniqueComputer[] {
  const seen = new Set<DeviceKey>();
  const targets: UniqueComputer[] = [];
  for (const device of devices) {
    if (seen.has(device.key)) continue;
    seen.add(device.key);
    targets.push(device);
  }
  return targets;
}

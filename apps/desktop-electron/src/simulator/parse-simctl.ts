import type { ProbeRuntime, ProbeSimulator } from "./types.ts";

/**
 * Apple `simctl list -j` groups entries under the key "devices".
 * That name is Apple's vocabulary, not an Atmos identifier.
 */
const APPLE_LIST_GROUP_KEY = "devices";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseSimctlRuntimes(stdout: string): ProbeRuntime[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const root = asRecord(parsed);
  const list = asArray(root?.runtimes);
  const out: ProbeRuntime[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    out.push({
      identifier: str(row.identifier),
      name: str(row.name),
      version: str(row.version),
      isAvailable: bool(row.isAvailable),
      platform: str(row.platform),
    });
  }
  return out;
}

export function parseSimctlSimulators(
  stdout: string,
  runtimes: ProbeRuntime[],
): ProbeSimulator[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const root = asRecord(parsed);
  const grouped = asRecord(root?.[APPLE_LIST_GROUP_KEY]);
  if (!grouped) return [];

  const runtimeById = new Map(runtimes.map((r) => [r.identifier, r]));
  const runtimeByName = new Map(runtimes.map((r) => [r.name, r]));

  const out: ProbeSimulator[] = [];
  for (const [groupKey, entries] of Object.entries(grouped)) {
    const runtime =
      runtimeById.get(groupKey) ?? runtimeByName.get(groupKey) ?? null;
    for (const item of asArray(entries)) {
      const row = asRecord(item);
      if (!row) continue;
      const id = str(row.udid);
      if (!id) continue;
      out.push({
        id,
        name: str(row.name),
        runtimeId: runtime?.identifier || groupKey,
        runtimeName: runtime?.name || groupKey,
        state: str(row.state),
        isAvailable: bool(row.isAvailable, true),
        typeId: str(row.deviceTypeIdentifier),
      });
    }
  }
  return out;
}

/** Match Apple's iPhone product family in simctl names / type identifiers. */
export function isSelectableIosHandset(entry: {
  name: string;
  typeId: string;
}): boolean {
  return /\biPhone\b/.test(entry.name) || /iPhone/.test(entry.typeId);
}

export function parseMacosVersion(raw: string): [number, number, number] | null {
  const match = raw.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [
    Number(match[1]),
    Number(match[2] ?? 0),
    Number(match[3] ?? 0),
  ];
}

export function compareVersions(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function parseRuntimeVersion(runtime: ProbeRuntime): [number, number, number] {
  const fromField = parseMacosVersion(runtime.version);
  if (fromField) return fromField;
  const fromId = runtime.identifier.match(/iOS-(\d+)-(\d+)/);
  if (fromId) return [Number(fromId[1]), Number(fromId[2]), 0];
  return [0, 0, 0];
}

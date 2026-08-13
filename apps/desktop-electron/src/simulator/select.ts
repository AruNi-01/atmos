import {
  isSelectableIosHandset,
  parseRuntimeVersion,
} from "./parse-simctl.ts";
import type { ProbeRuntime, ProbeSimulator } from "./types.ts";

export type SelectResult =
  | { action: "use"; simulator: ProbeSimulator }
  | {
      action: "create";
      runtimeId: string;
      runtimeName: string;
      typeId: string;
    };

export type SelectInput = {
  lastUsedId?: string | null;
  runtimes: ProbeRuntime[];
  simulators: ProbeSimulator[];
  /** Apple simctl device-type identifiers; first iPhone type wins for create. */
  typeIds?: string[];
};

function availableIosRuntimes(runtimes: ProbeRuntime[]): ProbeRuntime[] {
  return runtimes
    .filter((r) => r.isAvailable && r.platform.toLowerCase() === "ios")
    .slice()
    .sort((a, b) => {
      const va = parseRuntimeVersion(a);
      const vb = parseRuntimeVersion(b);
      for (let i = 0; i < 3; i += 1) {
        if (vb[i] !== va[i]) return vb[i] - va[i];
      }
      return 0;
    });
}

function defaultTypeId(typeIds: string[] | undefined): string {
  const match = (typeIds ?? []).find((id) => /iPhone/.test(id));
  return match || "com.apple.CoreSimulator.SimDeviceType.iPhone-16";
}

export function selectSimulator(input: SelectInput): SelectResult | null {
  const iosRuntimes = availableIosRuntimes(input.runtimes);
  if (iosRuntimes.length === 0) return null;

  const available = new Set(iosRuntimes.map((r) => r.identifier));
  const availableNames = new Set(iosRuntimes.map((r) => r.name));

  if (input.lastUsedId) {
    const last = input.simulators.find(
      (s) =>
        s.id === input.lastUsedId &&
        s.isAvailable &&
        (available.has(s.runtimeId) || availableNames.has(s.runtimeName)),
    );
    if (last) return { action: "use", simulator: last };
  }

  for (const runtime of iosRuntimes) {
    const first = input.simulators.find(
      (s) =>
        s.isAvailable &&
        isSelectableIosHandset(s) &&
        (s.runtimeId === runtime.identifier || s.runtimeName === runtime.name),
    );
    if (first) return { action: "use", simulator: first };
  }

  const newest = iosRuntimes[0];
  return {
    action: "create",
    runtimeId: newest.identifier,
    runtimeName: newest.name,
    typeId: defaultTypeId(input.typeIds),
  };
}

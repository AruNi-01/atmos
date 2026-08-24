import type { AtmosComputerConnectionMode } from "@/features/connection/lib/atmos-computer-store";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { desktopInvoke, isElectronShell } from "@/shared/lib/desktop-bridge";

export type ResourceUsageView = {
  cpu_percent: number;
  memory_rss_bytes: number;
  process_count: number;
};

export type DesktopShellGroupKind =
  | "main"
  | "renderer"
  | "gpu"
  | "utility"
  | "other";

export type DesktopShellGroupMetrics = {
  kind: DesktopShellGroupKind;
  usage: ResourceUsageView;
};

export type DesktopShellMetricsSnapshot = {
  supported: boolean;
  collected_at_ms: number;
  logical_cpu_count: number;
  total: ResourceUsageView;
  groups: DesktopShellGroupMetrics[];
};

export const DESKTOP_SHELL_GROUP_KINDS = [
  "main",
  "renderer",
  "gpu",
  "utility",
  "other",
] as const satisfies readonly DesktopShellGroupKind[];

const EMPTY_USAGE: ResourceUsageView = {
  cpu_percent: 0,
  memory_rss_bytes: 0,
  process_count: 0,
};

export function desktopShellMetricsQueryKey(
  connectionMode: AtmosComputerConnectionMode,
  electron: boolean,
) {
  return ["atmos", "desktopShell", "metrics", connectionMode, electron] as const;
}

export function canFetchDesktopShellMetrics(
  isElectron: boolean,
  connectionMode: AtmosComputerConnectionMode,
): boolean {
  return isElectron && connectionMode === "local";
}

export function unsupportedDesktopShellSnapshot(
  nowMs = Date.now(),
): DesktopShellMetricsSnapshot {
  return {
    supported: false,
    collected_at_ms: nowMs,
    logical_cpu_count: 0,
    total: { ...EMPTY_USAGE },
    groups: DESKTOP_SHELL_GROUP_KINDS.map((kind) => ({
      kind,
      usage: { ...EMPTY_USAGE },
    })),
  };
}

function isUsageView(value: unknown): value is ResourceUsageView {
  if (!value || typeof value !== "object") return false;
  const usage = value as Record<string, unknown>;
  return (
    typeof usage.cpu_percent === "number" &&
    Number.isFinite(usage.cpu_percent) &&
    typeof usage.memory_rss_bytes === "number" &&
    Number.isFinite(usage.memory_rss_bytes) &&
    typeof usage.process_count === "number" &&
    Number.isFinite(usage.process_count)
  );
}

function isGroupKind(value: unknown): value is DesktopShellGroupKind {
  return (
    value === "main" ||
    value === "renderer" ||
    value === "gpu" ||
    value === "utility" ||
    value === "other"
  );
}

/** Runtime-validate an unknown IPC payload. Invalid data returns null. */
export function parseDesktopShellMetricsSnapshot(
  data: unknown,
): DesktopShellMetricsSnapshot | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (typeof value.supported !== "boolean") return null;
  if (typeof value.collected_at_ms !== "number" || !Number.isFinite(value.collected_at_ms)) {
    return null;
  }
  if (
    typeof value.logical_cpu_count !== "number" ||
    !Number.isFinite(value.logical_cpu_count)
  ) {
    return null;
  }
  if (!isUsageView(value.total) || !Array.isArray(value.groups)) return null;

  const groups: DesktopShellGroupMetrics[] = [];
  for (const item of value.groups) {
    if (!item || typeof item !== "object") return null;
    const group = item as Record<string, unknown>;
    if (!isGroupKind(group.kind) || !isUsageView(group.usage)) return null;
    groups.push({ kind: group.kind, usage: group.usage });
  }

  return {
    supported: value.supported,
    collected_at_ms: value.collected_at_ms,
    logical_cpu_count: value.logical_cpu_count,
    total: value.total,
    groups,
  };
}

export async function fetchDesktopShellMetrics(): Promise<DesktopShellMetricsSnapshot> {
  if (
    !isElectronShell() ||
    useAtmosComputerStore.getState().connectionMode !== "local"
  ) {
    return unsupportedDesktopShellSnapshot();
  }

  try {
    const raw = await desktopInvoke("get_desktop_shell_metrics");
    return parseDesktopShellMetricsSnapshot(raw) ?? unsupportedDesktopShellSnapshot();
  } catch {
    return unsupportedDesktopShellSnapshot();
  }
}

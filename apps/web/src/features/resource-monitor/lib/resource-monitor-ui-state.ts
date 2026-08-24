import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";
import { isSnapshotStale } from "@/features/resource-monitor/lib/resource-monitor-format";

export type ResourceMonitorUiState =
  | "loading"
  | "disconnected"
  | "unsupported"
  | "stale"
  | "partial"
  | "empty"
  | "ready";

export function resolveResourceMonitorUiState(input: {
  connectionState: string;
  isLoading: boolean;
  snapshot?: ResourceMonitorSnapshot;
  lastUpdatedAtMs?: number;
  nowMs?: number;
}): ResourceMonitorUiState {
  if (input.connectionState !== "connected") return "disconnected";
  if (input.isLoading || input.snapshot == null) return "loading";
  if (input.snapshot.attribution_status === "unsupported") return "unsupported";
  if (isSnapshotStale(input.lastUpdatedAtMs ?? 0, input.nowMs)) return "stale";
  if (input.snapshot.attribution_status === "partial") return "partial";
  if (input.snapshot.projects.length === 0) return "empty";
  return "ready";
}

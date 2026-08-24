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

export type ResourceMonitorStatusBanner = Exclude<ResourceMonitorUiState, "ready">;

/** Primary state plus a one-shot extra partial banner when a stale snapshot is also partial. */
export function resourceMonitorStatusBanners(
  state: ResourceMonitorUiState,
  snapshot?: ResourceMonitorSnapshot,
): ResourceMonitorStatusBanner[] {
  if (state === "ready") return [];
  const banners: ResourceMonitorStatusBanner[] = [state];
  if (state === "stale" && snapshot?.attribution_status === "partial") {
    banners.push("partial");
  }
  return banners;
}

export function shouldRenderResourceMonitorSnapshot(
  state: ResourceMonitorUiState,
): boolean {
  return state !== "disconnected" && state !== "loading";
}

export function shouldShowProjectsEmptyCopy(
  state: ResourceMonitorUiState,
  projectCount: number,
): boolean {
  return projectCount === 0 && state !== "empty";
}

export type ResourceMonitorStatusTone =
  | "info"
  | "warning"
  | "muted"
  | "secondary"
  | "destructive";

/** Semantic badge tone. Info is only for live/ready status, never a gray catch-all. */
export function resourceMonitorStatusTone(
  banner: ResourceMonitorStatusBanner,
): ResourceMonitorStatusTone {
  switch (banner) {
    case "stale":
    case "partial":
      return "warning";
    case "disconnected":
      return "destructive";
    case "unsupported":
      return "muted";
    case "loading":
    case "empty":
      return "secondary";
  }
}

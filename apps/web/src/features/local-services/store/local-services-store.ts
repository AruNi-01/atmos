"use client";

import type { LocalServicesScanRequest } from "@/api/ws/local-services-api";

/**
 * Stable string key for a local-services scan request. Used by
 * localServicesScanQueryOptions to construct the TanStack Query key.
 *
 * The Zustand store (scopes Map + scan/clear/reset actions) that previously
 * lived here has been removed as part of APP-035 — all scan results are now
 * owned by TanStack Query under the computer.localServicesScan key.
 */
export function localServicesScopeKey(request: LocalServicesScanRequest): string {
  return [
    request.scope ?? "all_atmos_projects",
    request.project_id ?? "",
    request.workspace_id ?? "",
    request.include_diagnostics ? "diag" : "default",
  ].join(":");
}

import { wsRequest } from "@/api/ws/request";
import type { ResolvedRunLogLatest, RunLogResolveReason } from "@/features/browser/lib/run-log-context";

function asResolveReason(value: string | null | undefined): RunLogResolveReason | null {
  if (
    value === "last_start" ||
    value === "preferred_window" ||
    value === "run_main" ||
    value === "fallback"
  ) {
    return value;
  }
  return null;
}

export const runLogApi = {
  start: async (params: {
    projectRoot: string;
    windowName: string;
    command?: string;
  }): Promise<{ latestPath: string }> => {
    const result = await wsRequest("run_log_start", {
      project_root: params.projectRoot,
      window_name: params.windowName,
      command: params.command,
    });
    return { latestPath: result.latest_path };
  },

  resolveLatest: async (
    projectRoot: string,
    preferredWindow?: string | null,
  ): Promise<ResolvedRunLogLatest | null> => {
    const result = await wsRequest("run_log_resolve_latest", {
      project_root: projectRoot,
      preferred_window: preferredWindow || undefined,
    });
    const latestPath = result.latest_path?.trim();
    if (!latestPath) return null;
    return {
      latestPath,
      reason: asResolveReason(result.reason),
      otherLatestPaths: result.other_latest_paths ?? [],
    };
  },
};

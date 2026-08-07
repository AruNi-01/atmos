import { wsRequest } from "@/api/ws/request";

export const runLogApi = {
  start: async (params: {
    projectRoot: string;
    windowName: string;
    command?: string;
  }): Promise<{ latestPath: string }> => {
    const result = await wsRequest<{ latest_path: string }>("run_log_start", {
      project_root: params.projectRoot,
      window_name: params.windowName,
      command: params.command,
    });
    return { latestPath: result.latest_path };
  },

  resolveLatest: async (projectRoot: string): Promise<string | null> => {
    const result = await wsRequest<{ latest_path?: string | null }>(
      "run_log_resolve_latest",
      { project_root: projectRoot },
    );
    return result.latest_path ?? null;
  },
};

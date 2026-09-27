export type ChatScope =
  | { workspace_id: string }
  | { project_id: string };

export type ChatScopeBootstrap = {
  projects: Array<{ guid: string; main_file_path: string }>;
  workspaces_by_project?: Record<string, Array<{ guid: string; local_path: string }>>;
};

export type ChatScopeResult =
  | { ok: true; scope: ChatScope; cwd: string | null }
  | { ok: false; error: string };

const UNKNOWN_SCOPE = "No workspace or project matches this id.";

export function resolveChatScope(
  bootstrap: ChatScopeBootstrap | null | undefined,
  scopeId: string,
): ChatScopeResult {
  const id = scopeId.trim();
  if (!bootstrap || id.length === 0) {
    return { ok: false, error: UNKNOWN_SCOPE };
  }

  for (const workspaces of Object.values(bootstrap.workspaces_by_project ?? {})) {
    const workspace = workspaces.find((item) => item.guid === id);
    if (workspace) {
      return {
        ok: true,
        scope: { workspace_id: workspace.guid },
        cwd: workspace.local_path,
      };
    }
  }

  const project = bootstrap.projects.find((item) => item.guid === id);
  if (project) {
    return {
      ok: true,
      scope: { project_id: project.guid },
      cwd: project.main_file_path,
    };
  }

  return { ok: false, error: UNKNOWN_SCOPE };
}

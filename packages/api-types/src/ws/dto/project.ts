import type { WorkspaceLabelModel, WorkspaceModel } from "./workspace";
import type { GroupModel } from "./group";

/** Shared project models (prefer production web nullability). */

export type ProjectModel = {
  guid: string;
  name: string;
  main_file_path: string;
  sidebar_order: number;
  border_color: string | null;
  /** Present on server wire; may be null. Optional for partial client fixtures. */
  logo_path?: string | null;
  target_branch?: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
};

/**
 * A project's `.atmos/scripts/atmos.json` plus whether the user accepted this
 * exact content.
 *
 * `setup` and `run` execute as shell commands and the file travels with the
 * repository, so trust is pinned to `hash`: when the file changes (clone, pull,
 * merge) `trusted` returns to false. Never execute a script while `trusted` is
 * false — confirm with the `project_script_trust` action first.
 */
export type ProjectScripts = {
  scripts: Record<string, string>;
  /** `null` when the project has no script file, in which case `trusted` is true. */
  hash: string | null;
  trusted: boolean;
};

export type ProjectWorkspaceBootstrapResponse = {
  projects: ProjectModel[];
  workspace_labels: WorkspaceLabelModel[];
  workspaces_by_project: Record<string, WorkspaceModel[]>;
  groups?: GroupModel[];
};

export type ProjectCreateRequest = {
  name: string;
  main_file_path: string;
  sidebar_order?: number;
  border_color?: string | null;
};

export type ProjectUpdateRequest = {
  guid: string;
  name?: string | null;
  border_color?: string | null;
  logo_path?: string | null;
  sidebar_order?: number | null;
};

export type ProjectGuidRequest = {
  guid: string;
};

export type ProjectUpdateTargetBranchRequest = {
  guid: string;
  target_branch?: string | null;
};

export type ProjectUpdateOrderRequest = {
  guid: string;
  sidebar_order: number;
};

export type ProjectValidatePathRequest = {
  path: string;
};

export type ProjectCheckCanDeleteResponse = {
  can_delete: boolean;
  active_workspace_count: number;
};

export type ScriptGetRequest = {
  project_guid: string;
};

export type ScriptSaveRequest = {
  project_guid: string;
  scripts: Record<string, string>;
};

export type ProjectScriptTrustRequest = {
  project_guid: string;
  hash: string;
  workspace_id?: string | null;
};

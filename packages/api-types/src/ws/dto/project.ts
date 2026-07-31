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

export type ProjectWorkspaceBootstrapResponse = {
  projects: ProjectModel[];
  workspace_labels: WorkspaceLabelModel[];
  workspaces_by_project: Record<string, WorkspaceModel[]>;
  groups?: GroupModel[];
};

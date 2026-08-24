export type SkillFile = {
  name: string;
  relative_path: string;
  absolute_path: string;
  content: string | null;
  is_main: boolean;
  is_symlink?: boolean;
  symlink_target?: string | null;
};

export type SkillScope =
  | "global"
  | "project"
  | "workspace"
  | "inside_project"
  | "system";

export type SkillPlacement = {
  id: string;
  agent: string;
  scope: SkillScope;
  project_id: string | null;
  project_name: string | null;
  path: string;
  original_path: string;
  resolved_path: string | null;
  status: "enabled" | "disabled";
  entry_kind: "directory" | "file" | "symlink";
  symlink_target: string | null;
  can_delete: boolean;
  can_toggle: boolean;
};

export type SkillInfo = {
  id: string;
  name: string;
  description: string;
  agents: string[];
  scope: SkillScope;
  project_id: string | null;
  project_name: string | null;
  path: string;
  files: SkillFile[];
  title: string | null;
  status: "enabled" | "disabled" | "partial";
  manageable: boolean;
  can_delete: boolean;
  can_toggle: boolean;
  placements: SkillPlacement[];
};

export type SkillScopeRoot = {
  scope: "project" | "workspace";
  id: string;
  name: string;
  path: string;
};

export type SkillsListRequest = {
  force_refresh?: boolean;
};

export type SkillsListResponse = {
  skills: SkillInfo[];
};

export type SkillsGetRequest = {
  scope: string;
  id: string;
};

export type SkillsSetEnabledRequest = {
  id: string;
  enabled: boolean;
  placement_ids?: string[] | null;
  scope_root?: SkillScopeRoot | null;
};

export type SkillsDeleteRequest = {
  id: string;
  placement_ids?: string[] | null;
};

export type WikiSkillInstallResponse = {
  success: boolean;
  path: string;
  message: string;
};

export type SkillInstalledResponse = {
  installed: boolean;
};

export type SyncSingleSystemSkillRequest = {
  skill_name: string;
};

export type SkillsSystemSyncResponse = {
  initiated: boolean;
};

export type ReviewSkillListItem = {
  id: string;
  label: string;
  badge: string;
  description: string;
  bestFor: string;
};

export type ReviewSkillsListResponse = {
  skills: ReviewSkillListItem[];
};

export type ReviewSkillsScaffoldResponse = {
  id: string;
  path: string;
  needs_sync: boolean;
};

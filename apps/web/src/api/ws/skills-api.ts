"use client";

import { wsRequest } from "@/api/ws/request";

export interface SkillFile {
  name: string;
  relative_path: string;
  absolute_path: string;
  content: string | null;
  is_main: boolean;
  is_symlink?: boolean;
  symlink_target?: string | null;
}

export interface SkillPlacement {
  id: string;
  agent: string;
  scope: "global" | "project" | "workspace" | "inside_project" | "system";
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
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  agents: string[];
  scope: "global" | "project" | "workspace" | "inside_project" | "system";
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
}

export type SkillScopeRoot = {
  scope: "project" | "workspace";
  id: string;
  name: string;
  path: string;
};

export const skillsApi = {
  /**
   * 获取已安装的 Skills 列表
   */
  list: async (options?: { forceRefresh?: boolean }): Promise<{ skills: SkillInfo[] }> => {
    return wsRequest<{ skills: SkillInfo[] }>("skills_list", {
      force_refresh: options?.forceRefresh ?? false,
    });
  },

  /**
   * Scan a single project/workspace root for composer toggles (no disk cache).
   */
  scanRoot: async (root: SkillScopeRoot): Promise<{ skills: SkillInfo[] }> => {
    return wsRequest<{ skills: SkillInfo[] }>("skills_scan_root", root);
  },

  /**
   * 获取单个 Skill 详情
   */
  get: async (scope: string, id: string): Promise<SkillInfo> => {
    return wsRequest<SkillInfo>("skills_get", { scope, id });
  },

  setEnabled: async (
    id: string,
    enabled: boolean,
    placementIds?: string[],
    scopeRoot?: SkillScopeRoot,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("skills_set_enabled", {
      id,
      enabled,
      placement_ids: placementIds,
      scope_root: scopeRoot,
    });
  },

  delete: async (id: string, placementIds?: string[]): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("skills_delete", {
      id,
      placement_ids: placementIds,
    });
  },

  /**
   * Install project-wiki skill to ~/.atmos/skills/.system/project-wiki
   */
  installProjectWiki: async (): Promise<{
    success: boolean;
    path: string;
    message: string;
  }> => {
    return wsRequest<{ success: boolean; path: string; message: string }>(
      "wiki_skill_install",
    );
  },

  /**
   * Check if project-wiki, project-wiki-update, and project-wiki-specify are all installed
   * in ~/.atmos/skills/.system/
   */
  isProjectWikiInstalledInSystem: async (): Promise<boolean> => {
    const res = await wsRequest<{ installed: boolean }>(
      "wiki_skill_system_status",
    );
    return res.installed;
  },

  /**
   * Check if all three code review skills (code-reviewer, code-review-expert, typescript-react-reviewer)
   * are installed in ~/.atmos/skills/.system/
   */
  isCodeReviewSkillsInstalledInSystem: async (): Promise<boolean> => {
    const res = await wsRequest<{ installed: boolean }>(
      "code_review_skill_system_status",
    );
    return res.installed;
  },

  /**
   * Check if git-commit skill is installed in ~/.atmos/skills/.system/git-commit/
   */
  isGitCommitSkillInstalledInSystem: async (): Promise<boolean> => {
    const res = await wsRequest<{ installed: boolean }>(
      "git_commit_skill_system_status",
    );
    return res.installed;
  },

  /**
   * Sync a single system skill by name
   */
  syncSingleSystemSkill: async (
    skillName: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("sync_single_system_skill", {
      skill_name: skillName,
    });
  },

  /**
   * Manually trigger sync of all system skills from project/GitHub
   */
  syncSystemSkills: async (): Promise<{ initiated: boolean }> => {
    return wsRequest<{ initiated: boolean }>("skills_system_sync");
  },

  /**
   * List code review skills scanned from ~/.atmos/skills/.system/code_review_skills
   */
  listReviewSkills: async (): Promise<{
    skills: { id: string; label: string; badge: string; description: string; bestFor: string }[];
  }> => {
    return wsRequest("review_skills_list");
  },

  /**
   * Scaffold a custom review skill directory and return its id/path
   */
  scaffoldReviewSkill: async (): Promise<{ id: string; path: string; needs_sync: boolean }> => {
    return wsRequest("review_skills_scaffold");
  },
};

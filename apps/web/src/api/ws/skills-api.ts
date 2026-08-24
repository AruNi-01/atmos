"use client";

import { wsRequest } from "@/api/ws/request";
import type { SkillInfo, SkillScopeRoot } from "@atmos/api-types/ws/dto/skills";

export type {
  SkillFile,
  SkillInfo,
  SkillPlacement,
  SkillScope,
  SkillScopeRoot,
} from "@atmos/api-types/ws/dto/skills";

export const skillsApi = {
  /**
   * 获取已安装的 Skills 列表
   */
  list: async (options?: { forceRefresh?: boolean }): Promise<{ skills: SkillInfo[] }> => {
    return wsRequest("skills_list", {
      force_refresh: options?.forceRefresh ?? false,
    });
  },

  /**
   * Scan a single project/workspace root for composer toggles (no disk cache).
   */
  scanRoot: async (root: SkillScopeRoot): Promise<{ skills: SkillInfo[] }> => {
    return wsRequest("skills_scan_root", root);
  },

  /**
   * 获取单个 Skill 详情
   */
  get: async (scope: string, id: string): Promise<SkillInfo> => {
    return wsRequest("skills_get", { scope, id });
  },

  setEnabled: async (
    id: string,
    enabled: boolean,
    placementIds?: string[],
    scopeRoot?: SkillScopeRoot,
  ): Promise<{ success: boolean }> => {
    return wsRequest("skills_set_enabled", {
      id,
      enabled,
      placement_ids: placementIds,
      scope_root: scopeRoot,
    });
  },

  delete: async (id: string, placementIds?: string[]): Promise<{ success: boolean }> => {
    return wsRequest("skills_delete", {
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
    return wsRequest("wiki_skill_install",
    );
  },

  /**
   * Check if project-wiki, project-wiki-update, and project-wiki-specify are all installed
   * in ~/.atmos/skills/.system/
   */
  isProjectWikiInstalledInSystem: async (): Promise<boolean> => {
    const res = await wsRequest("wiki_skill_system_status",
    );
    return res.installed;
  },

  /**
   * Check if all three code review skills (code-reviewer, code-review-expert, typescript-react-reviewer)
   * are installed in ~/.atmos/skills/.system/
   */
  isCodeReviewSkillsInstalledInSystem: async (): Promise<boolean> => {
    const res = await wsRequest("code_review_skill_system_status",
    );
    return res.installed;
  },

  /**
   * Check if git-commit skill is installed in ~/.atmos/skills/.system/git-commit/
   */
  isGitCommitSkillInstalledInSystem: async (): Promise<boolean> => {
    const res = await wsRequest("git_commit_skill_system_status",
    );
    return res.installed;
  },

  /**
   * Sync a single system skill by name
   */
  syncSingleSystemSkill: async (
    skillName: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest("sync_single_system_skill", {
      skill_name: skillName,
    });
  },

  /**
   * Manually trigger sync of all system skills from project/GitHub
   */
  syncSystemSkills: async (): Promise<{ initiated: boolean }> => {
    return wsRequest("skills_system_sync");
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

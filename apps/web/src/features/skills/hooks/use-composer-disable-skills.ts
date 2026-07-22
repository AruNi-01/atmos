"use client";

import React from "react";
import {
  forceRefreshSkillsList,
  useInvalidateSkillsList,
} from "@/features/skills/hooks/use-skills-query";
import {
  skillsApi,
  type SkillInfo,
  type SkillScopeRoot,
} from "@/api/ws/skills-api";

export type ComposerSkillsContext = {
  mode: "project" | "workspace";
  id: string;
  name: string;
  path: string;
};

function sortSkills(skills: SkillInfo[]) {
  return [...skills].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "enabled") return -1;
      if (b.status === "enabled") return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function useComposerDisableSkills(context: ComposerSkillsContext | null) {
  const invalidateSkillsList = useInvalidateSkillsList();
  const [loading, setLoading] = React.useState(false);
  const [skills, setSkills] = React.useState<SkillInfo[]>([]);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const scopeRoot = React.useMemo<SkillScopeRoot | undefined>(() => {
    if (!context) return undefined;
    return {
      scope: context.mode,
      id: context.id,
      name: context.name,
      path: context.path,
    };
  }, [context]);

  const loadSkills = React.useCallback(async () => {
    if (!context) {
      setSkills([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (context.mode === "workspace") {
        const [rootResult, listResult] = await Promise.all([
          skillsApi.scanRoot({
            scope: "workspace",
            id: context.id,
            name: context.name,
            path: context.path,
          }),
          skillsApi.list({ forceRefresh: true }),
        ]);
        const workplace = rootResult.skills.filter((skill) => skill.can_toggle);
        const globals = listResult.skills.filter(
          (skill) => skill.can_toggle && skill.scope === "global",
        );
        const byId = new Map<string, SkillInfo>();
        for (const skill of [...workplace, ...globals]) {
          byId.set(skill.id, skill);
        }
        setSkills(sortSkills([...byId.values()]));
      } else {
        const listResult = await skillsApi.list({ forceRefresh: true });
        setSkills(
          sortSkills(
            listResult.skills.filter(
              (skill) =>
                skill.can_toggle &&
                (skill.scope === "global" ||
                  (skill.scope === "project" && skill.project_id === context.id)),
            ),
          ),
        );
      }
    } catch (loadError) {
      console.error("Failed to load composer skills:", loadError);
      setSkills([]);
      setError(loadError instanceof Error ? loadError.message : "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, [context]);

  const setEnabled = React.useCallback(
    async (skill: SkillInfo, enabled: boolean) => {
      setPendingId(skill.id);
      setError(null);
      try {
        const root =
          skill.scope === "workspace" ||
          (context?.mode === "workspace" && skill.scope !== "global")
            ? scopeRoot
            : undefined;
        await skillsApi.setEnabled(skill.id, enabled, undefined, root);
        setSkills((current) =>
          sortSkills(
            current.map((item) =>
              item.id === skill.id
                ? {
                    ...item,
                    status: enabled ? "enabled" : "disabled",
                    placements: item.placements.map((placement) => ({
                      ...placement,
                      status: enabled ? "enabled" : "disabled",
                    })),
                  }
                : item,
            ),
          ),
        );
        invalidateSkillsList();
        if (skill.scope !== "workspace") {
          void forceRefreshSkillsList().catch(() => {});
        }
        return true;
      } catch (toggleError) {
        setError(toggleError instanceof Error ? toggleError.message : "Failed to update skill");
        void loadSkills();
        return false;
      } finally {
        setPendingId(null);
      }
    },
    [context?.mode, invalidateSkillsList, loadSkills, scopeRoot],
  );

  return {
    error,
    loading,
    loadSkills,
    pendingId,
    setEnabled,
    skills,
  };
}

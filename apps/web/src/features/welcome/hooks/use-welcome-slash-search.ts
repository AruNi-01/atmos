"use client";

import React from "react";
import Fuse from "fuse.js";
import {
  skillsApi,
  type SkillInfo,
} from "@/api/ws-api";
import type { WelcomeSlashPopoverState } from "@/features/welcome/hooks/use-welcome-slash-navigation";
import {
  useDebouncedPopoverQuery,
  type AgentMenuOption,
} from "@/features/welcome/lib/welcome-page-helpers";
import { filterSlashSkillsForProject } from "@/features/welcome/lib/slash-skill-context";
import type { Project } from "@/shared/types/domain";

export function useWelcomeSlashSearch({
  availableAgents,
  activeProjectId,
  popover,
  projects,
}: {
  availableAgents: AgentMenuOption[];
  activeProjectId?: string | null;
  popover: WelcomeSlashPopoverState;
  projects: Project[];
}) {
  const debouncedSlashQuery = useDebouncedPopoverQuery(popover, 300);
  const [skills, setSkills] = React.useState<SkillInfo[]>([]);
  const [isSkillsLoading, setIsSkillsLoading] = React.useState(false);

  React.useEffect(() => {
    const loadSkills = async () => {
      setIsSkillsLoading(true);
      try {
        const response = await skillsApi.list({ forceRefresh: false });
        // Only keep skills that can be surfaced from slash commands.
        const filteredSkills = response.skills.filter(
          (skill) =>
            skill.scope === "global" ||
            skill.scope === "project" ||
            skill.scope === "inside_project",
        );
        setSkills(filteredSkills);
      } catch (error) {
        console.error("Failed to load skills:", error);
        setSkills([]);
      } finally {
        setIsSkillsLoading(false);
      }
    };

    void loadSkills();
  }, []);

  const visibleSkills = React.useMemo(
    () => filterSlashSkillsForProject(skills, activeProjectId ?? null),
    [activeProjectId, skills],
  );

  const skillsFuse = React.useMemo(
    () =>
      new Fuse(visibleSkills, {
        keys: ["name", "description"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [visibleSkills],
  );

  const projectsFuse = React.useMemo(
    () =>
      new Fuse(projects, {
        keys: ["name"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [projects],
  );

  const agentsFuse = React.useMemo(
    () =>
      new Fuse(availableAgents, {
        keys: ["label", "command"],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [availableAgents],
  );

  const filteredSkills = React.useMemo(() => {
    const query = debouncedSlashQuery;
    if (!query) return visibleSkills;
    const results = skillsFuse.search(query);
    return results.map((r) => r.item);
  }, [debouncedSlashQuery, skillsFuse, visibleSkills]);

  const filteredProjects = React.useMemo(() => {
    const query = debouncedSlashQuery;
    if (!query) return projects;
    const results = projectsFuse.search(query);
    return results.map((r) => r.item);
  }, [debouncedSlashQuery, projects, projectsFuse]);

  const filteredAgents = React.useMemo(() => {
    const query = debouncedSlashQuery;
    if (!query) return availableAgents;
    const results = agentsFuse.search(query);
    return results.map((r) => r.item);
  }, [debouncedSlashQuery, availableAgents, agentsFuse]);

  return {
    filteredAgents,
    filteredProjects,
    filteredSkills,
    isSkillsLoading,
  };
}

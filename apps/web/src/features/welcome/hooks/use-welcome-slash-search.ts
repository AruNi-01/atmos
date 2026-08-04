"use client";

import React from "react";
import Fuse from "fuse.js";
import type { SkillInfo } from "@/api/ws-api";
import { useSkillsListQuery } from "@/features/skills/hooks/use-skills-query";
import type { WelcomeSlashPopoverState } from "@/features/welcome/hooks/use-welcome-slash-navigation";
import {
  useDebouncedPopoverQuery,
  type AgentMenuOption,
} from "@/features/welcome/lib/welcome-page-helpers";
import { filterSlashSkillsForProject } from "@/features/welcome/lib/slash-skill-context";
import type { Project } from "@/shared/types/domain";

function isSlashSurfacedSkill(skill: SkillInfo) {
  return (
    skill.scope === "global" ||
    skill.scope === "project" ||
    skill.scope === "inside_project"
  );
}

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
  const skillsQuery = useSkillsListQuery();

  const allSkills = React.useMemo(
    () => skillsQuery.data?.skills ?? [],
    [skillsQuery.data?.skills],
  );

  const skills = React.useMemo(
    () => allSkills.filter(isSlashSurfacedSkill),
    [allSkills],
  );

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
    allSkills,
    filteredAgents,
    filteredProjects,
    filteredSkills,
    isSkillsLoading: skillsQuery.isPending && !skillsQuery.data,
  };
}

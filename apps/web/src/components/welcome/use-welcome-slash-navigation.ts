"use client";

import React from "react";
import type { SkillInfo } from "@/api/ws-api";
import type { AgentMenuOption } from "@/components/welcome/welcome-page-helpers";

export type WelcomeSlashPopoverState = {
  top: number;
  left: number;
  slashOffset: number;
  query: string;
} | null;

type SlashSection = "skills" | "projects" | "agents";

type SlashNavigationItem<Project> =
  | { type: "skill"; item: SkillInfo }
  | { type: "project"; item: Project }
  | { type: "agent"; item: AgentMenuOption }
  | { type: "show-more"; section: SlashSection };

interface UseWelcomeSlashNavigationArgs<Project> {
  filteredAgents: AgentMenuOption[];
  filteredProjects: Project[];
  filteredSkills: SkillInfo[];
  onSelectAgent: (agent: AgentMenuOption) => void;
  onSelectProject: (project: Project) => void;
  onSelectSkill: (skill: SkillInfo) => void;
  popover: WelcomeSlashPopoverState;
}

export function useWelcomeSlashNavigation<Project>({
  filteredAgents,
  filteredProjects,
  filteredSkills,
  onSelectAgent,
  onSelectProject,
  onSelectSkill,
  popover,
}: UseWelcomeSlashNavigationArgs<Project>) {
  const [expandedSections, setExpandedSections] = React.useState<Record<SlashSection, boolean>>({
    skills: false,
    projects: false,
    agents: false,
  });
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const setItemRef = React.useCallback((index: number, element: HTMLButtonElement | null) => {
    itemRefs.current[index] = element;
  }, []);

  React.useEffect(() => {
    setActiveIndex(0);
    setExpandedSections({
      skills: false,
      projects: false,
      agents: false,
    });
  }, [popover?.query]);

  const visibleItems = React.useMemo<Array<SlashNavigationItem<Project>>>(() => {
    const items: Array<SlashNavigationItem<Project>> = [];
    const skillsToShow = expandedSections.skills ? filteredSkills : filteredSkills.slice(0, 3);
    const projectsToShow = expandedSections.projects
      ? filteredProjects
      : filteredProjects.slice(0, 3);
    const agentsToShow = expandedSections.agents ? filteredAgents : filteredAgents.slice(0, 3);

    items.push(...skillsToShow.map((item) => ({ type: "skill" as const, item })));
    if (filteredSkills.length > 3 && !expandedSections.skills) {
      items.push({ type: "show-more", section: "skills" });
    }

    items.push(...projectsToShow.map((item) => ({ type: "project" as const, item })));
    if (filteredProjects.length > 3 && !expandedSections.projects) {
      items.push({ type: "show-more", section: "projects" });
    }

    items.push(...agentsToShow.map((item) => ({ type: "agent" as const, item })));
    if (filteredAgents.length > 3 && !expandedSections.agents) {
      items.push({ type: "show-more", section: "agents" });
    }

    return items;
  }, [expandedSections, filteredAgents, filteredProjects, filteredSkills]);

  React.useEffect(() => {
    setActiveIndex((prev) => {
      if (prev >= visibleItems.length) {
        return 0;
      }
      return prev;
    });
  }, [visibleItems.length]);

  React.useEffect(() => {
    if (!popover) return;
    const container = listRef.current;
    const activeItem = itemRefs.current[activeIndex];
    if (!container || !activeItem) return;
    activeItem.scrollIntoView({ block: "nearest" });
  }, [activeIndex, popover]);

  React.useEffect(() => {
    if (!popover) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        if (visibleItems.length === 0) return;
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % visibleItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        if (visibleItems.length === 0) return;
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + visibleItems.length) % visibleItems.length);
        return;
      }
      if (event.key !== "Enter") return;
      const item = visibleItems[activeIndex];
      if (!item) return;
      event.preventDefault();
      if (item.type === "skill") {
        onSelectSkill(item.item);
      } else if (item.type === "project") {
        onSelectProject(item.item);
      } else if (item.type === "agent") {
        onSelectAgent(item.item);
      } else if (item.type === "show-more") {
        setExpandedSections((prev) => ({ ...prev, [item.section]: true }));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, onSelectAgent, onSelectProject, onSelectSkill, popover, visibleItems]);

  return {
    activeIndex,
    expandedSections,
    listRef,
    setExpandedSections,
    setItemRef,
  };
}

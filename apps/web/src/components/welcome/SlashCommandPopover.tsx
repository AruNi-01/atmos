import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@workspace/ui";
import { Folder, Loader2, Puzzle } from "lucide-react";

import type { SkillInfo } from "@/api/ws-api";
import { AgentIcon } from "@/components/agent/AgentIcon";
import type { AgentMenuOption } from "@/components/welcome/welcome-page-helpers";

type ExpandedSections = {
  skills: boolean;
  projects: boolean;
  agents: boolean;
};

type ProjectOption = {
  id: string;
  name: string;
};

export type SlashPopoverPosition = {
  top: number;
  left: number;
  slashOffset: number;
  query: string;
};

interface SlashCommandPopoverProps {
  activeIndex: number;
  expandedSections: ExpandedSections;
  filteredAgents: AgentMenuOption[];
  filteredProjects: ProjectOption[];
  filteredSkills: SkillInfo[];
  isSkillsLoading: boolean;
  onClose: () => void;
  onSelectAgent: (agent: AgentMenuOption) => void;
  onSelectProject: (project: ProjectOption) => void;
  onSelectSkill: (skill: SkillInfo) => void;
  popover: SlashPopoverPosition | null;
  setExpandedSections: React.Dispatch<React.SetStateAction<ExpandedSections>>;
  setItemRef: (index: number, element: HTMLButtonElement | null) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}

export function SlashCommandPopover({
  activeIndex,
  expandedSections,
  filteredAgents,
  filteredProjects,
  filteredSkills,
  isSkillsLoading,
  onClose,
  onSelectAgent,
  onSelectProject,
  onSelectSkill,
  popover,
  setExpandedSections,
  setItemRef,
  listRef,
}: SlashCommandPopoverProps) {
  if (!popover || typeof document === "undefined") return null;

  const visibleSkills = expandedSections.skills ? filteredSkills : filteredSkills.slice(0, 3);
  const visibleProjects = expandedSections.projects
    ? filteredProjects
    : filteredProjects.slice(0, 3);
  const visibleAgents = expandedSections.agents ? filteredAgents : filteredAgents.slice(0, 3);
  const skillsShowMore = filteredSkills.length > 3 && !expandedSections.skills ? 1 : 0;
  const projectsShowMore = filteredProjects.length > 3 && !expandedSections.projects ? 1 : 0;

  const skillsCount = expandedSections.skills
    ? filteredSkills.length
    : Math.min(filteredSkills.length, 3);
  const projectsStartIndex = skillsCount + skillsShowMore;
  const projectsCount = expandedSections.projects
    ? filteredProjects.length
    : Math.min(filteredProjects.length, 3);
  const agentsStartIndex = projectsStartIndex + projectsCount + projectsShowMore;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2147483646]" onMouseDown={onClose} />
      <div
        ref={listRef}
        className="fixed z-[2147483647] max-h-80 w-[min(90vw,460px)] overflow-y-auto rounded-md border border-border/70 bg-popover p-1 text-sm text-popover-foreground shadow-md"
        style={{
          top: popover.top,
          left: popover.left,
        }}
      >
        <div className="px-2 py-1 text-sm font-medium text-foreground">Skills</div>
        {isSkillsLoading ? (
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading skills...
          </div>
        ) : filteredSkills.length > 0 ? (
          <>
            {visibleSkills.map((skill, index) => (
              <button
                key={skill.id}
                type="button"
                ref={(el) => {
                  setItemRef(index, el);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                  index === activeIndex && "bg-muted",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectSkill(skill);
                }}
              >
                <Puzzle className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                <span className="ml-2 shrink-0 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  {skill.scope === "global" ? "Global" : "Project"}
                </span>
              </button>
            ))}
            {filteredSkills.length > 3 && !expandedSections.skills ? (
              <button
                type="button"
                ref={(el) => {
                  setItemRef(skillsCount, el);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted",
                  skillsCount === activeIndex && "bg-muted",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setExpandedSections((prev) => ({ ...prev, skills: true }));
                }}
              >
                Show {filteredSkills.length - 3} more
              </button>
            ) : null}
          </>
        ) : (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">No skills available</div>
        )}

        <div className="my-1 h-px bg-border/60" />

        <div className="px-2 py-1 text-sm font-medium text-foreground">Projects</div>
        {filteredProjects.length > 0 ? (
          <>
            {visibleProjects.map((project, index) => {
              const navIndex = projectsStartIndex + index;
              return (
                <button
                  key={project.id}
                  type="button"
                  ref={(el) => {
                    setItemRef(navIndex, el);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                    navIndex === activeIndex && "bg-muted",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelectProject(project);
                  }}
                >
                  <Folder className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                </button>
              );
            })}
            {filteredProjects.length > 3 && !expandedSections.projects ? (
              <button
                type="button"
                ref={(el) => {
                  setItemRef(projectsStartIndex + projectsCount, el);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted",
                  projectsStartIndex + projectsCount === activeIndex && "bg-muted",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setExpandedSections((prev) => ({ ...prev, projects: true }));
                }}
              >
                Show {filteredProjects.length - 3} more
              </button>
            ) : null}
          </>
        ) : (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">No projects available</div>
        )}

        <div className="my-1 h-px bg-border/60" />

        <div className="px-2 py-1 text-sm font-medium text-foreground">Code Agents</div>
        {filteredAgents.length > 0 ? (
          <>
            {visibleAgents.map((agent, index) => {
              const navIndex = agentsStartIndex + index;
              return (
                <button
                  key={agent.id}
                  type="button"
                  ref={(el) => {
                    setItemRef(navIndex, el);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                    navIndex === activeIndex && "bg-muted",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelectAgent(agent);
                  }}
                >
                  <AgentIcon
                    registryId={agent.id}
                    name={agent.label}
                    size={16}
                    isCustom={agent.iconType === "custom"}
                    registryIcon={undefined}
                  />
                  <span className="min-w-0 flex-1 truncate">{agent.label}</span>
                </button>
              );
            })}
            {filteredAgents.length > 3 && !expandedSections.agents ? (
              <button
                type="button"
                ref={(el) => {
                  setItemRef(agentsStartIndex + Math.min(filteredAgents.length, 3), el);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted",
                  agentsStartIndex + Math.min(filteredAgents.length, 3) === activeIndex &&
                    "bg-muted",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setExpandedSections((prev) => ({ ...prev, agents: true }));
                }}
              >
                Show {filteredAgents.length - 3} more
              </button>
            ) : null}
          </>
        ) : (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">No agents available</div>
        )}

        <div className="my-1 h-px bg-border/60" />
        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
          <span>Hidden</span>
          <span>
            {Math.max(0, filteredSkills.length - (expandedSections.skills ? filteredSkills.length : 3))}{" "}
            skills,{" "}
            {Math.max(
              0,
              filteredProjects.length - (expandedSections.projects ? filteredProjects.length : 3),
            )}{" "}
            projects,{" "}
            {Math.max(0, filteredAgents.length - (expandedSections.agents ? filteredAgents.length : 3))}{" "}
            agents
          </span>
        </div>
      </div>
    </>,
    document.body,
  );
}

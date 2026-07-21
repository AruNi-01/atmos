import React from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { cn } from "@workspace/ui";
import { Folder, Loader2, MessageCirclePlus, MessagesSquare, Puzzle } from "lucide-react";

import type { SkillInfo } from "@/api/ws-api";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { SlashCommandOption } from "@/features/welcome/hooks/use-welcome-slash-navigation";
import type { AgentMenuOption } from "@/features/welcome/lib/welcome-page-helpers";

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
  top?: number;
  bottom?: number;
  left: number;
  slashOffset: number;
  query: string;
};

interface SlashCommandPopoverProps {
  activeIndex: number;
  expandedSections: ExpandedSections;
  filteredAgents: AgentMenuOption[];
  filteredCommands?: SlashCommandOption[];
  filteredProjects: ProjectOption[];
  filteredSkills: SkillInfo[];
  isSkillsLoading: boolean;
  onClose: () => void;
  onSelectAgent: (agent: AgentMenuOption) => void;
  onSelectCommand?: (command: SlashCommandOption) => void;
  onSelectProject: (project: ProjectOption) => void;
  onSelectSkill: (skill: SkillInfo) => void;
  popover: SlashPopoverPosition | null;
  setExpandedSections: React.Dispatch<React.SetStateAction<ExpandedSections>>;
  setItemRef: (index: number, element: HTMLButtonElement | null) => void;
  showAgents?: boolean;
  showCommands?: boolean;
  showProjects?: boolean;
  showSkills?: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
}

export function SlashCommandPopover({
  activeIndex,
  expandedSections,
  filteredAgents,
  filteredCommands = [],
  filteredProjects,
  filteredSkills,
  isSkillsLoading,
  onClose,
  onSelectAgent,
  onSelectCommand,
  onSelectProject,
  onSelectSkill,
  popover,
  setExpandedSections,
  setItemRef,
  showAgents = true,
  showCommands = false,
  showProjects = true,
  showSkills = true,
  listRef,
}: SlashCommandPopoverProps) {
  const t = useTranslations("Welcome.components");
  if (!popover || typeof document === "undefined") return null;

  const visibleCommands = showCommands ? filteredCommands : [];
  const visibleSkills = showSkills
    ? expandedSections.skills
      ? filteredSkills
      : filteredSkills.slice(0, 3)
    : [];
  const visibleProjects = showProjects
    ? expandedSections.projects
      ? filteredProjects
      : filteredProjects.slice(0, 3)
    : [];
  const visibleAgents = showAgents
    ? expandedSections.agents
      ? filteredAgents
      : filteredAgents.slice(0, 3)
    : [];
  const skillsShowMore = showSkills && filteredSkills.length > 3 && !expandedSections.skills ? 1 : 0;
  const projectsShowMore = showProjects && filteredProjects.length > 3 && !expandedSections.projects ? 1 : 0;

  const commandsCount = visibleCommands.length;
  const skillsStartIndex = commandsCount;
  const skillsCount = !showSkills
    ? 0
    : expandedSections.skills
    ? filteredSkills.length
    : Math.min(filteredSkills.length, 3);
  const projectsStartIndex = skillsStartIndex + skillsCount + skillsShowMore;
  const projectsCount = !showProjects
    ? 0
    : expandedSections.projects
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
          bottom: popover.bottom,
          left: popover.left,
        }}
      >
        {showCommands && visibleCommands.length > 0 ? (
          <>
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{t("slashPopover.commands")}</div>
            {visibleCommands.map((command, index) => (
              <button
                key={command.id}
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
                  onSelectCommand?.(command);
                }}
              >
                {command.id === "spawn" ? (
                  <MessagesSquare className="size-4 text-green-600 dark:text-green-400" />
                ) : (
                  <MessageCirclePlus className="size-4 text-cyan-600 dark:text-cyan-300" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{command.label}</span>
                  {command.description ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {command.description}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </>
        ) : null}



        {showSkills ? (
          <>
            <div className="mt-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">{t("slashPopover.skills")}</div>
            {isSkillsLoading ? (
              <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t("slashPopover.loadingSkills")}
              </div>
            ) : filteredSkills.length > 0 ? (
              <>
                {visibleSkills.map((skill, index) => (
                  <button
                    key={skill.id}
                    type="button"
                      ref={(el) => {
                      setItemRef(skillsStartIndex + index, el);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-muted",
                      skillsStartIndex + index === activeIndex && "bg-muted",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelectSkill(skill);
                    }}
                  >
                    <Puzzle className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                    <span className="ml-2 shrink-0 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                      {skill.scope === "global" ? t("slashPopover.global") : t("slashPopover.project")}
                    </span>
                  </button>
                ))}
                {filteredSkills.length > 3 && !expandedSections.skills ? (
                  <button
                    type="button"
                    ref={(el) => {
                      setItemRef(skillsStartIndex + skillsCount, el);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted",
                      skillsStartIndex + skillsCount === activeIndex && "bg-muted",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setExpandedSections((prev) => ({ ...prev, skills: true }));
                    }}
                  >
                    {t("slashPopover.showMore", { count: filteredSkills.length - 3 })}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">{t("slashPopover.noSkillsAvailable")}</div>
            )}
          </>
        ) : null}



        {showProjects ? (
          <>
            <div className="mt-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">{t("slashPopover.projects")}</div>
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
                    {t("slashPopover.showMore", { count: filteredProjects.length - 3 })}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">{t("slashPopover.noProjectsAvailable")}</div>
            )}
          </>
        ) : null}



        {showAgents ? (
          <>
            <div className="mt-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">{t("slashPopover.codeAgents")}</div>
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
                    {t("slashPopover.showMore", { count: filteredAgents.length - 3 })}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="px-2.5 py-2 text-xs text-muted-foreground">{t("slashPopover.noAgentsAvailable")}</div>
            )}
          </>
        ) : null}

        {showProjects || showAgents ? (
          <>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
              <span>{t("slashPopover.hidden")}</span>
              <span>
                {t("slashPopover.hiddenSummary", {
                  skills: showSkills
                    ? Math.max(0, filteredSkills.length - (expandedSections.skills ? filteredSkills.length : 3))
                    : 0,
                  projects: showProjects
                    ? Math.max(
                        0,
                        filteredProjects.length - (expandedSections.projects ? filteredProjects.length : 3),
                      )
                    : 0,
                  agents: showAgents
                    ? Math.max(0, filteredAgents.length - (expandedSections.agents ? filteredAgents.length : 3))
                    : 0,
                })}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

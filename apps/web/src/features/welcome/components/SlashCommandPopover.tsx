import React from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import { Switch, cn } from "@workspace/ui";
import {
  ChevronLeft,
  EyeOff,
  Folder,
  Loader2,
  MessageCirclePlus,
  MessagesSquare,
  Puzzle,
} from "lucide-react";

import type { SkillInfo } from "@/api/ws-api";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { SlashCommandOption } from "@/features/welcome/hooks/use-welcome-slash-navigation";
import { scrollActiveListItemIntoView } from "@/features/welcome/lib/popover-list-scroll";
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

export type SlashPopoverView = "menu" | "disable_skills";

export type SlashDisableSkillsState = {
  filter: string;
  loading: boolean;
  pendingId: string | null;
  skills: SkillInfo[];
  error?: string | null;
};

interface SlashCommandPopoverProps {
  activeIndex: number;
  disableSkills?: SlashDisableSkillsState | null;
  expandedSections: ExpandedSections;
  filteredAgents: AgentMenuOption[];
  filteredCommands?: SlashCommandOption[];
  filteredProjects: ProjectOption[];
  filteredSkills: SkillInfo[];
  isSkillsLoading: boolean;
  onBackFromDisableSkills?: () => void;
  onClose: () => void;
  onSelectAgent: (agent: AgentMenuOption) => void;
  onSelectCommand?: (command: SlashCommandOption) => void;
  onSelectProject: (project: ProjectOption) => void;
  onSelectSkill: (skill: SkillInfo) => void;
  onToggleDisableSkill?: (skill: SkillInfo, enabled: boolean) => void;
  popover: SlashPopoverPosition | null;
  setExpandedSections: React.Dispatch<React.SetStateAction<ExpandedSections>>;
  setItemRef: (index: number, element: HTMLButtonElement | null) => void;
  showAgents?: boolean;
  showCommands?: boolean;
  showProjects?: boolean;
  showSkills?: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  view?: SlashPopoverView;
}

function scopeBadgeLabel(
  scope: SkillInfo["scope"],
  t: ReturnType<typeof useTranslations>,
) {
  if (scope === "global") return t("slashPopover.global");
  if (scope === "workspace") return t("slashPopover.workspace");
  return t("slashPopover.project");
}

export function SlashCommandPopover({
  activeIndex,
  disableSkills = null,
  expandedSections,
  filteredAgents,
  filteredCommands = [],
  filteredProjects,
  filteredSkills,
  isSkillsLoading,
  onBackFromDisableSkills,
  onClose,
  onSelectAgent,
  onSelectCommand,
  onSelectProject,
  onSelectSkill,
  onToggleDisableSkill,
  popover,
  setExpandedSections,
  setItemRef,
  showAgents = true,
  showCommands = false,
  showProjects = true,
  showSkills = true,
  listRef,
  view = "menu",
}: SlashCommandPopoverProps) {
  const t = useTranslations("Welcome.components");
  const disableT = useTranslations("skills.composerDisable");
  const [disableActiveIndex, setDisableActiveIndex] = React.useState(0);
  const disableItemRefs = React.useRef<Array<HTMLElement | null>>([]);
  const disableListScrollRef = React.useRef<HTMLDivElement | null>(null);

  const disableFilter = disableSkills?.filter.trim().toLowerCase() ?? "";
  const disableList = React.useMemo(() => {
    const skills = disableSkills?.skills ?? [];
    if (!disableFilter) return skills;
    // Simple substring match on name/title only (description causes noisy false hits).
    const tokens = disableFilter.split(/\s+/).filter(Boolean);
    return skills.filter((skill) => {
      const name = skill.name.toLowerCase();
      const title = (skill.title ?? "").toLowerCase();
      return tokens.every((token) => name.includes(token) || title.includes(token));
    });
  }, [disableFilter, disableSkills?.skills]);

  React.useEffect(() => {
    setDisableActiveIndex(0);
  }, [disableFilter, disableList.length, view]);

  React.useEffect(() => {
    if (view !== "disable_skills") return;
    const container = disableListScrollRef.current;
    if (!container) return;
    scrollActiveListItemIntoView(container, disableItemRefs.current, disableActiveIndex, 3);
  }, [disableActiveIndex, view]);

  React.useEffect(() => {
    if (!popover || view !== "disable_skills") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        // Same as backdrop: leave the chip and start the dismiss countdown.
        onClose();
        return;
      }
      if (disableList.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setDisableActiveIndex((prev) => (prev + 1) % disableList.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setDisableActiveIndex((prev) => (prev - 1 + disableList.length) % disableList.length);
        return;
      }
      if (event.key !== "Enter") return;
      const skill = disableList[disableActiveIndex];
      if (!skill || disableSkills?.pendingId === skill.id) return;
      event.preventDefault();
      event.stopPropagation();
      const enabled = skill.status !== "disabled";
      onToggleDisableSkill?.(skill, !enabled);
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    disableActiveIndex,
    disableList,
    disableSkills?.pendingId,
    onClose,
    onToggleDisableSkill,
    popover,
    view,
  ]);

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

  const handleBackdrop = () => {
    onClose();
  };

  const menuContent = (
    <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
      {showCommands && visibleCommands.length > 0 ? (
        <>
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
            {t("slashPopover.commands")}
          </div>
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
              ) : command.id === "dynamic-skills" ? (
                <EyeOff className="size-4 text-red-600 dark:text-red-400" />
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
          <div className="mt-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
            {t("slashPopover.skills")}
          </div>
          {isSkillsLoading ? (
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t("slashPopover.loadingSkills")}
            </div>
          ) : filteredSkills.length > 0 ? (
            <>
              {visibleSkills.map((skill, index) => {
                const isDisabled = skill.status === "disabled";
                const navIndex = skillsStartIndex + index;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    ref={(el) => {
                      setItemRef(navIndex, el);
                    }}
                    disabled={isDisabled}
                    aria-disabled={isDisabled}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left",
                      isDisabled
                        ? "cursor-default text-muted-foreground opacity-80"
                        : "hover:bg-muted",
                      navIndex === activeIndex && "bg-muted",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (isDisabled) return;
                      onSelectSkill(skill);
                    }}
                  >
                    <Puzzle className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                    {isDisabled ? (
                      <span className="shrink-0 rounded-md border border-red-500/35 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
                        {t("slashPopover.disabled")}
                      </span>
                    ) : null}
                    <span className="shrink-0 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                      {scopeBadgeLabel(skill.scope, t)}
                    </span>
                  </button>
                );
              })}
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
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              {t("slashPopover.noSkillsAvailable")}
            </div>
          )}
        </>
      ) : null}

      {showProjects ? (
        <>
          <div className="mt-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
            {t("slashPopover.projects")}
          </div>
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
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              {t("slashPopover.noProjectsAvailable")}
            </div>
          )}
        </>
      ) : null}

      {showAgents ? (
        <>
          <div className="mt-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
            {t("slashPopover.codeAgents")}
          </div>
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
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              {t("slashPopover.noAgentsAvailable")}
            </div>
          )}
        </>
      ) : null}

      {showProjects || showAgents ? (
        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
          <span>{t("slashPopover.hidden")}</span>
          <span>
            {t("slashPopover.hiddenSummary", {
              skills: showSkills
                ? Math.max(
                    0,
                    filteredSkills.length - (expandedSections.skills ? filteredSkills.length : 3),
                  )
                : 0,
              projects: showProjects
                ? Math.max(
                    0,
                    filteredProjects.length -
                      (expandedSections.projects ? filteredProjects.length : 3),
                  )
                : 0,
              agents: showAgents
                ? Math.max(
                    0,
                    filteredAgents.length - (expandedSections.agents ? filteredAgents.length : 3),
                  )
                : 0,
            })}
          </span>
        </div>
      ) : null}
    </div>
  );

  const disableContent = (
    <div className="flex max-h-80 flex-col">
      <div className="flex items-center gap-1 border-b border-border/70 px-2 py-2">
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={disableT("back")}
          onMouseDown={(event) => {
            event.preventDefault();
            onBackFromDisableSkills?.();
          }}
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {disableT("title")}
        </p>
      </div>
      <div ref={disableListScrollRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {disableSkills?.loading ? (
          <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {disableT("loading")}
          </div>
        ) : disableList.length === 0 ? (
          <div className="px-2.5 py-3 text-xs text-muted-foreground">{disableT("empty")}</div>
        ) : (
          disableList.map((skill, index) => {
            const enabled = skill.status !== "disabled";
            const busy = disableSkills?.pendingId === skill.id;
            const isActive = index === disableActiveIndex;
            return (
              <div
                key={skill.id}
                ref={(el) => {
                  disableItemRefs.current[index] = el;
                }}
                role="option"
                aria-selected={isActive}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
                  isActive ? "bg-muted" : "hover:bg-muted/60",
                )}
                onMouseEnter={() => setDisableActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  onToggleDisableSkill?.(skill, !enabled);
                }}
              >
                <Puzzle className="size-4 shrink-0 text-muted-foreground" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    enabled ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {skill.title || skill.name}
                </span>
                <span className="shrink-0 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  {scopeBadgeLabel(skill.scope, t)}
                </span>
                <Switch
                  checked={enabled}
                  disabled={busy}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  onCheckedChange={(checked) => {
                    onToggleDisableSkill?.(skill, checked);
                  }}
                  aria-label={
                    enabled
                      ? disableT("disableSkill", { name: skill.name })
                      : disableT("enableSkill", { name: skill.name })
                  }
                />
              </div>
            );
          })
        )}
        {disableSkills?.error ? (
          <p className="px-2.5 py-2 text-[11px] text-destructive">{disableSkills.error}</p>
        ) : null}
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2147483646]" onMouseDown={handleBackdrop} />
      <div
        className={cn(
          "fixed z-[2147483647] overflow-hidden rounded-md border border-border/70 bg-popover text-sm text-popover-foreground shadow-md transition-[width] duration-250 ease-out",
          view === "disable_skills" ? "w-[min(92vw,380px)]" : "w-[min(90vw,460px)]",
        )}
        style={{
          top: popover.top,
          bottom: popover.bottom,
          left: popover.left,
        }}
      >
        <div className="relative overflow-hidden">
          <div
            className={cn(
              "transition-all duration-200 ease-out",
              view === "menu"
                ? "translate-x-0 opacity-100"
                : "pointer-events-none absolute inset-0 -translate-x-3 opacity-0",
            )}
          >
            {menuContent}
          </div>
          <div
            className={cn(
              "transition-all duration-200 ease-out",
              view === "disable_skills"
                ? "translate-x-0 opacity-100"
                : "pointer-events-none absolute inset-0 translate-x-3 opacity-0",
            )}
          >
            {disableContent}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

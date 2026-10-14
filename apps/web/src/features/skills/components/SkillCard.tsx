"use client";

import React from "react";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  cn,
  Puzzle,
  Folder,
  Globe,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  FileText,
} from "@workspace/ui";
import { SkillInfo } from "@/api/ws-api";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  getAgentConfig,
  getAgentRegistryId,
  getPrimarySkillAgent,
  sortAgents,
} from "../lib/constants";
import { SkillAgentBadge } from "./SkillAgentBadge";

interface SkillCardProps {
  skill: SkillInfo;
  onClick?: () => void;
}

export const SkillCard: React.FC<SkillCardProps> = ({ skill, onClick }) => {
  const router = useAppRouter();
  const fileCount = skill.files?.length || 0;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      const identifier = encodeURIComponent(skill.id);
      router.push(`/skills?scope=${skill.scope}&skillId=${identifier}`);
    }
  };

  const isProjectScoped = skill.scope === "project" || skill.scope === "inside_project";
  const isSystemScoped = skill.scope === "system";
  const primaryAgent = getPrimarySkillAgent(skill.agents);
  const primaryAgentConfig = primaryAgent ? getAgentConfig(primaryAgent) : null;
  const primaryAgentRegistryId = primaryAgent ? getAgentRegistryId(primaryAgent) : null;
  const scopeLabel = isSystemScoped
    ? "Atmos built-in"
    : skill.scope === "inside_project"
      ? "In project"
      : skill.scope === "global"
        ? "Global"
        : skill.scope === "project"
          ? "Project"
          : skill.scope === "workspace"
            ? "Workspace"
            : skill.scope;

  return (
    <div
      onClick={handleClick}
      className="flex h-[140px] cursor-pointer flex-col rounded-lg border border-border bg-background p-4 hover:border-accent hover:bg-accent/50"
    >
      <div className="flex min-h-0 flex-1 items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          {primaryAgentRegistryId && primaryAgentConfig ? (
            <AgentIcon
              registryId={primaryAgentRegistryId}
              name={primaryAgentConfig.name}
              size={18}
            />
          ) : (
            <Puzzle className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex-1 truncate text-sm font-medium">{skill.title || skill.name}</h3>

            <div className="flex shrink-0 items-center gap-1.5">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "flex cursor-default items-center gap-1 rounded px-1 py-0.5 text-[9px] font-medium",
                        isSystemScoped
                          ? "bg-foreground/80 text-background"
                          : skill.scope === "global"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : skill.scope === "project"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
                      )}
                    >
                      {isSystemScoped ? (
                        <Puzzle className="size-2" />
                      ) : skill.scope === "global" ? (
                        <Globe className="size-2" />
                      ) : (
                        <Folder className="size-2" />
                      )}
                      {scopeLabel}
                    </span>
                  </TooltipTrigger>
                  {isProjectScoped && skill.project_name && (
                    <TooltipContent side="top">
                      <p className="text-xs">From: {skill.project_name}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              {fileCount > 0 && (
                <span className="flex items-center gap-1 rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                  <FileText className="size-2" />
                  {fileCount}
                </span>
              )}
            </div>
          </div>

          {skill.description ? (
            <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
              {skill.description}
            </p>
          ) : (
            <p className="mt-1 flex-1 text-xs text-muted-foreground/50 italic">No description</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex h-[22px] flex-wrap items-center gap-1.5 overflow-hidden">
        {sortAgents(skill.agents).map((agent) => {
          if (agent === "unified") {
            return <SkillAgentBadge key={agent} agent={agent} tooltip="From: .agents/skills" />;
          }

          if (agent === "in-project") {
            return <SkillAgentBadge key={agent} agent={agent} tooltip={`skills/${skill.name}`} />;
          }

          return <SkillAgentBadge key={agent} agent={agent} />;
        })}
      </div>
    </div>
  );
};

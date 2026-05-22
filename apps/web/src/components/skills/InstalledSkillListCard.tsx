import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import type { SkillInfo } from "@/api/ws-api";
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  Folder,
  FolderOpen,
  Globe,
  Puzzle,
} from "lucide-react";
import { getAgentStatus, sortAgents } from "./constants";
import { SkillActionsMenu } from "./SkillActionsMenu";
import { SkillAgentBadge } from "./SkillAgentBadge";

function getScopeMeta(scope: SkillInfo["scope"]) {
  switch (scope) {
    case "global":
      return {
        label: "Global",
        icon: Globe,
        className: "bg-muted text-foreground",
      };
    case "project":
      return {
        label: "Project",
        icon: Folder,
        className: "bg-muted text-foreground",
      };
    case "system":
      return {
        label: "Atmos Built-in",
        icon: Puzzle,
        className: "bg-foreground/80 text-background",
      };
    default:
      return {
        label: "InsideTheProject",
        icon: FolderOpen,
        className: "bg-muted text-foreground",
      };
  }
}

function getStatusMeta(status: SkillInfo["status"]) {
  switch (status) {
    case "enabled":
      return {
        label: "Enabled",
        icon: CircleCheck,
        className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      };
    case "disabled":
      return {
        label: "Disabled",
        icon: CircleX,
        className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
      };
    default:
      return {
        label: "Partial",
        icon: CircleMinus,
        className: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
      };
  }
}

export function InstalledSkillListCard({
  skill,
  onClick,
  onUpdated,
  onDeleted,
}: {
  skill: SkillInfo;
  onClick: () => void;
  onUpdated: (skill: SkillInfo) => void | Promise<void>;
  onDeleted: (skillId: string) => void | Promise<void>;
}) {
  const scopeMeta = getScopeMeta(skill.scope);
  const ScopeIcon = scopeMeta.icon;
  const statusMeta = getStatusMeta(skill.status);
  const StatusIcon = statusMeta.icon;
  const isDisabled = skill.status === "disabled";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex h-full cursor-pointer flex-col rounded-xl border p-5 transition-all duration-200",
        isDisabled
          ? "border-border/70 hover:bg-muted/35"
          : "border-border hover:bg-muted/25 hover:shadow-md",
      )}
    >
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                isDisabled
                  ? "border-border/40 bg-muted/40 text-muted-foreground"
                  : "border-border/50 bg-muted/20 text-primary group-hover:bg-primary/5",
              )}
            >
              <Puzzle className="size-5" />
            </div>
            <div className="min-w-0">
              <h3
                className={cn(
                  "truncate text-sm font-semibold tracking-tight",
                  isDisabled ? "text-foreground/80" : "text-foreground",
                )}
              >
                {skill.title || skill.name}
              </h3>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider cursor-default",
                          scopeMeta.className,
                        )}
                      >
                        <ScopeIcon className="size-2" />
                        {scopeMeta.label}
                      </span>
                    </TooltipTrigger>
                    {(skill.scope === "project" || skill.scope === "inside_project") && skill.project_name && (
                      <TooltipContent side="top">
                        <p className="text-xs">From: {skill.project_name}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>

                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
                    statusMeta.className,
                  )}
                >
                  <StatusIcon className="size-2.5" />
                  {statusMeta.label}
                </span>
              </div>
            </div>
          </div>

          <SkillActionsMenu skill={skill} onUpdated={onUpdated} onDeleted={onDeleted} />
        </div>

        {skill.description ? (
          <p
            className={cn(
              "mt-4 flex-1 line-clamp-3 text-[13px] leading-relaxed text-pretty",
              isDisabled ? "text-muted-foreground/75" : "text-muted-foreground",
            )}
          >
            {skill.description}
          </p>
        ) : (
          <p className="mt-4 flex-1 text-[13px] italic leading-relaxed text-muted-foreground/50">No description</p>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {sortAgents(skill.agents).filter((agent) => agent !== "in-project").map((agent) => {
            const agentStatus = getAgentStatus(skill, agent);
            return (
              <SkillAgentBadge
                key={agent}
                agent={agent}
                status={agentStatus}
                tooltip={agent === "unified" ? "From: .agents/skills" : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

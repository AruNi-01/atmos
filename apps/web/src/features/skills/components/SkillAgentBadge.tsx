"use client";

import React from "react";
import { cn, Bot, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@workspace/ui";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { getAgentConfig, getAgentRegistryId } from "../lib/constants";

interface SkillAgentBadgeProps {
  agent: string;
  status?: "enabled" | "disabled" | "partial";
  tooltip?: string;
}

export const SkillAgentBadge: React.FC<SkillAgentBadgeProps> = ({ agent, status, tooltip }) => {
  const config = getAgentConfig(agent);
  const registryId = getAgentRegistryId(agent);
  const isUnified = agent === "unified";
  const isAtmos = agent === "atmos";
  const isDisabled = status === "disabled";

  const badge = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center transition-opacity",
        // Disabled: grayed-out agent icon only (no EyeOff). Enabled: full brightness.
        isDisabled ? "opacity-35 grayscale" : "opacity-100",
      )}
    >
      {isUnified || isAtmos ? (
        <Bot className={cn("size-4", isDisabled ? "text-muted-foreground" : "text-foreground")} />
      ) : registryId ? (
        <AgentIcon registryId={registryId} name={config.name} size={16} />
      ) : (
        <span
          className={cn(
            "rounded px-1 py-0.5 text-[10px] font-medium",
            isDisabled ? "bg-muted text-muted-foreground" : "bg-muted text-foreground",
          )}
        >
          {config.name}
        </span>
      )}
    </span>
  );

  if (tooltip || isUnified) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent side="top">
            <div className="flex items-center gap-1.5">
              {isUnified && (
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Unified
                </span>
              )}
              {tooltip && <p className="text-xs">{tooltip}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
};

"use client";

import React from 'react';
import { cn, Bot, EyeOff, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@workspace/ui';
import { AgentIcon } from '@/components/agent/AgentIcon';
import { getAgentConfig, getAgentRegistryId } from './constants';

interface SkillAgentBadgeProps {
  agent: string;
  status?: 'enabled' | 'disabled' | 'partial';
  tooltip?: string;
}

export const SkillAgentBadge: React.FC<SkillAgentBadgeProps> = ({ agent, status, tooltip }) => {
  const config = getAgentConfig(agent);
  const registryId = getAgentRegistryId(agent);
  const isUnified = agent === 'unified';
  const isDisabled = status === 'disabled';

  const badge = (
    <span
      className={cn(
        "shrink-0 inline-flex items-center",
        isDisabled ? 'opacity-40' : 'opacity-80',
      )}
    >
      {isDisabled && <EyeOff className="size-3 text-muted-foreground mr-0.5" />}
      {isUnified ? (
        <Bot className="size-4 text-muted-foreground" />
      ) : registryId ? (
        <AgentIcon registryId={registryId} name={config.name} size={16} />
      ) : (
        <span className="text-[10px] font-medium text-muted-foreground px-1 py-0.5 rounded bg-muted">
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
                <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium">
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

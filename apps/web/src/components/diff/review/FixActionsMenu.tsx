"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Loader2,
} from "@workspace/ui";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_OPTIONS, type AgentId } from "@/components/wiki/AgentSelect";
import { AgentIcon } from "@/components/agent/AgentIcon";

interface FixActionsMenuProps {
  disabled: boolean;
  isLoading: boolean;
  agentId: AgentId;
  onAgentChange: (agentId: AgentId) => void;
  onFix: (agentId: AgentId) => void | Promise<void>;
}

function getAgentLabel(id: AgentId) {
  return AGENT_OPTIONS.find((opt) => opt.id === id)?.label ?? id;
}

export const FixActionsMenu: React.FC<FixActionsMenuProps> = ({
  disabled,
  isLoading,
  agentId,
  onAgentChange,
  onFix,
}) => {
  return (
    <div className="flex-1 flex items-stretch rounded-md">
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => void onFix(agentId)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-l-md border border-r-0 border-sidebar-border px-2.5 py-1 text-[13px] font-medium flex-1 min-w-0",
          "bg-background text-foreground hover:bg-sidebar-accent",
          "transition-colors cursor-pointer",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        title="Run fix on open threads"
      >
        {isLoading ? (
          <Loader2 className="size-3.5 animate-spin shrink-0" />
        ) : (
          <AgentIcon registryId={agentId} name={getAgentLabel(agentId)} size={16} />
        )}
        <span>Fix</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled || isLoading}
            className={cn(
              "inline-flex items-center justify-center rounded-r-md border border-sidebar-border px-2 py-1 text-[13px] shrink-0",
              "bg-background text-foreground hover:bg-sidebar-accent",
              "transition-colors cursor-pointer",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            title="Choose agent"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          {AGENT_OPTIONS.map((opt) => {
            const isActive = opt.id === agentId;
            return (
              <DropdownMenuItem
                key={opt.id}
                onClick={() => onAgentChange(opt.id)}
                className="flex items-center gap-2 text-xs"
              >
                <AgentIcon registryId={opt.id} name={opt.label} size={16} />
                <span className="flex-1">{opt.label}</span>
                {isActive && <Check className="size-3.5 text-foreground shrink-0" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

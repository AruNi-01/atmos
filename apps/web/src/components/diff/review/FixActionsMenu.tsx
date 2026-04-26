"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Loader2,
} from "@workspace/ui";
import { Wrench, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_OPTIONS, type AgentId } from "@/components/wiki/AgentSelect";

interface FixActionsMenuProps {
  disabled: boolean;
  isLoading: boolean;
  agentId: AgentId;
  onAgentChange: (agentId: AgentId) => void;
  onFix: (agentId: AgentId) => void | Promise<void>;
}

export const FixActionsMenu: React.FC<FixActionsMenuProps> = ({
  disabled,
  isLoading,
  agentId,
  onAgentChange,
  onFix,
}) => {
  return (
    <div className="flex items-center">
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => void onFix(agentId)}
        className={cn(
          "flex items-center gap-1 rounded-l-md px-2 py-1 text-xs font-medium",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          "transition-colors cursor-pointer",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        title="Run fix on open threads"
      >
        {isLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Wrench className="size-3.5" />
        )}
        <span>Fix</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled || isLoading}
            className={cn(
              "flex items-center justify-center rounded-r-md border-l border-primary-foreground/20 px-1.5 py-1",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "transition-colors cursor-pointer",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            title="Choose agent"
          >
            <ChevronDown className="size-3" />
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
                <span className="flex-1">{opt.label}</span>
                {isActive && <Check className="size-3.5 text-foreground" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

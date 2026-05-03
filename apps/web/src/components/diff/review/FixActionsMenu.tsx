"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Loader2,
} from "@workspace/ui";
import { ChevronDown, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_OPTIONS, type AgentId } from "@/components/wiki/AgentSelect";
import { AgentIcon } from "@/components/agent/AgentIcon";
import type { ReviewFixRunModel } from "@/api/ws-api";

interface FixActionsMenuProps {
  disabled: boolean;
  isLoading: boolean;
  activeRun: ReviewFixRunModel | null;
  agentId: AgentId;
  onAgentChange: (agentId: AgentId) => void;
  onFix: (agentId: AgentId) => void | Promise<void>;
  onCopyPrompt: () => void | Promise<void>;
  onMarkFailed: (run: ReviewFixRunModel) => void | Promise<void>;
}

function getAgentLabel(id: AgentId) {
  return AGENT_OPTIONS.find((opt) => opt.id === id)?.label ?? id;
}

function formatFixRunStatus(status: string) {
  const label = status.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const FixActionsMenu: React.FC<FixActionsMenuProps> = ({
  disabled,
  isLoading,
  activeRun,
  agentId,
  onAgentChange,
  onFix,
  onCopyPrompt,
  onMarkFailed,
}) => {
  const isRunActive = !!activeRun;
  return (
    <div className="flex-1 flex items-stretch min-w-0">
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => void onFix(agentId)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 px-2.5 text-[13px] font-medium flex-1 min-w-0 h-full",
          "text-foreground hover:bg-sidebar-accent/30",
          "transition-colors cursor-pointer",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        title={isRunActive ? "A review fix is already running" : "Run fix on open comments"}
      >
        {isLoading || isRunActive ? (
          <Loader2 className="size-3.5 animate-spin shrink-0" />
        ) : (
          <AgentIcon registryId={agentId} name={getAgentLabel(agentId)} size={16} />
        )}
        <span>{activeRun ? formatFixRunStatus(activeRun.status) : "Fix"}</span>
      </button>
      <div className="w-px self-stretch bg-sidebar-border/40 shrink-0" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={(!isRunActive && disabled) || isLoading}
            className={cn(
              "inline-flex items-center justify-center px-1.5 text-[13px] shrink-0 h-full",
              "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/30",
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
                disabled={isRunActive}
              >
                <AgentIcon registryId={opt.id} name={opt.label} size={16} />
                <span className="flex-1">{opt.label}</span>
                {isActive && <Check className="size-3.5 text-foreground shrink-0" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void onCopyPrompt()}
            className="flex items-center gap-2 text-xs"
            disabled={disabled || isLoading || isRunActive}
          >
            <Copy className="size-4" />
            <span>Copy Prompt</span>
          </DropdownMenuItem>
          {activeRun && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void onMarkFailed(activeRun)}
                className="flex items-center gap-2 text-xs"
              >
                Mark failed
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

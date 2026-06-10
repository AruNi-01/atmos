"use client";

import React from "react";
import {
  DropdownMenuItem,
  Loader2,
} from "@workspace/ui";
import { ChevronDown, Copy, Bot } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { type AgentId } from "@/features/wiki/components/AgentSelect";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { ReviewAgentRunModel } from "@/api/ws-api";
import { TerminalAgentSelectorWithRunConfig } from "@/features/agent/components/TerminalAgentSelectorWithRunConfig";
import { AGENT_OPTIONS } from "@/features/wiki/components/AgentSelect";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";

interface FixActionsMenuProps {
  disabled: boolean;
  isLoading: boolean;
  activeRun: ReviewAgentRunModel | null;
  agentId: AgentId;
  runConfig: TerminalAgentRunConfigInput | null;
  onAgentChange: (agentId: AgentId) => void;
  onRunConfigChange: (value: TerminalAgentRunConfigInput | null) => void;
  onFix: (agentId: AgentId, runConfig: TerminalAgentRunConfigInput | null) => void | Promise<void>;
  onCopyPrompt: () => void | Promise<void>;
  onMarkFailed: (run: ReviewAgentRunModel) => void | Promise<void>;
  onOpenAgentReview: () => void;
}

function getAgentLabel(id: AgentId) {
  return AGENT_OPTIONS.find((opt) => opt.id === id)?.label ?? id;
}

function formatAgentRunStatus(status: string) {
  const label = status.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const FixActionsMenu: React.FC<FixActionsMenuProps> = ({
  disabled,
  isLoading,
  activeRun,
  agentId,
  runConfig,
  onAgentChange,
  onRunConfigChange,
  onFix,
  onCopyPrompt,
  onMarkFailed,
  onOpenAgentReview,
}) => {
  const isRunActive = !!activeRun;
  return (
    <div className="flex-1 flex items-stretch min-w-0">
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => void onFix(agentId, runConfig)}
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
        <span className="truncate min-w-0">{activeRun ? formatAgentRunStatus(activeRun.status) : "Fix"}</span>
      </button>
        <div className="w-px self-stretch bg-sidebar-border/40 shrink-0" />
      <TerminalAgentSelectorWithRunConfig
        variant="menu"
        options={AGENT_OPTIONS}
        value={agentId}
        onValueChange={onAgentChange}
        runConfig={runConfig}
        onRunConfigChange={onRunConfigChange}
        purpose="interactive"
        trigger={
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
        }
        menuHeader={
          <DropdownMenuItem
            onClick={() => onOpenAgentReview()}
            className="flex items-center gap-2 text-xs"
          >
            <Bot className="size-4" />
            <span>Agent Review</span>
          </DropdownMenuItem>
        }
        menuFooter={
          <>
            <DropdownMenuItem
              onClick={() => void onCopyPrompt()}
              className="flex items-center gap-2 text-xs"
              disabled={disabled || isLoading || isRunActive}
            >
              <Copy className="size-4" />
              <span>Copy Prompt</span>
            </DropdownMenuItem>
            {activeRun ? (
              <>
                <DropdownMenuItem
                  onClick={() => void onMarkFailed(activeRun)}
                  className="flex items-center gap-2 text-xs"
                >
                  Mark failed
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        }
      />
    </div>
  );
};

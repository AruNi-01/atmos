"use client";

import React from "react";
import {
  DropdownMenuItem,
} from "@workspace/ui";
import { Bot, Settings2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { type AgentId } from "@/features/wiki/components/AgentSelect";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { ReviewAgentRunModel } from "@/api/ws-api";
import { TerminalAgentSelectorWithRunConfig } from "@/features/agent/components/TerminalAgentSelectorWithRunConfig";
import { AGENT_OPTIONS } from "@/features/wiki/components/AgentSelect";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";
import { AgentFixToolbarPrimitive } from "@/features/agent-fix/components/AgentFixToolbarPrimitive";

interface FixActionsMenuProps {
  disabled: boolean;
  isLoading: boolean;
  activeRun: ReviewAgentRunModel | null;
  agentId: AgentId;
  runConfig: TerminalAgentRunConfigInput | null;
  runConfigByAgentId: Record<string, TerminalAgentRunConfigInput | null | undefined>;
  onAgentChange: (agentId: AgentId) => void;
  onRunConfigChange: (agentId: AgentId, value: TerminalAgentRunConfigInput | null) => void;
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
  runConfigByAgentId,
  onAgentChange,
  onRunConfigChange,
  onFix,
  onCopyPrompt,
  onMarkFailed,
  onOpenAgentReview,
}) => {
  const isRunActive = !!activeRun;
  return (
    <AgentFixToolbarPrimitive
      variant="review"
      title={isRunActive ? "A review fix is already running" : "Run fix on open comments"}
      renderSettings={(settingsClassName) => (
        <TerminalAgentSelectorWithRunConfig
          variant="menu"
          options={AGENT_OPTIONS}
          value={agentId}
          onValueChange={(nextAgentId) => onAgentChange(nextAgentId as AgentId)}
          runConfig={runConfig}
          runConfigByAgentId={runConfigByAgentId}
          onRunConfigChange={(nextAgentId, nextValue) => {
            onRunConfigChange(nextAgentId as AgentId, nextValue);
          }}
          purpose="interactive"
          trigger={
            <button
              type="button"
              disabled={(!isRunActive && disabled) || isLoading}
              className={cn(
                "inline-flex shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-50",
                settingsClassName,
              )}
              title="Choose agent"
              aria-label="Choose review fix agent"
            >
              <Settings2 className="size-3.5" />
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
            activeRun ? (
              <DropdownMenuItem
                onClick={() => void onMarkFailed(activeRun)}
                className="flex items-center gap-2 text-xs"
              >
                Mark failed
              </DropdownMenuItem>
            ) : null
          }
        />
      )}
      copyAction={{
        ariaLabel: "Copy review fix prompt",
        disabled: disabled || isLoading || isRunActive,
        label: "Prompt",
        onClick: onCopyPrompt,
        title: "Copy Prompt",
      }}
      primaryAction={{
        disabled: disabled || isLoading,
        icon: <AgentIcon registryId={agentId} name={getAgentLabel(agentId)} size={16} />,
        isLoading: isLoading || isRunActive,
        label: activeRun ? formatAgentRunStatus(activeRun.status) : "Agent Fix",
        onClick: () => onFix(agentId, runConfig),
      }}
    />
  );
};

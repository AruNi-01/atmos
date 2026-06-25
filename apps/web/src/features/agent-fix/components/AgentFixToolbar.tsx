"use client";

import React from "react";
import { Bot, Copy, Loader2 } from "lucide-react";
import { Button, cn } from "@workspace/ui";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { AgentFixSettingsPopover } from "@/features/agent-fix/components/AgentFixSettingsPopover";
import { useAgentFixActions } from "@/features/agent-fix/hooks/use-agent-fix-actions";
import { useAgentFixConfig } from "@/features/agent-fix/hooks/use-agent-fix-config";
import type { AgentFixPromptSource } from "@/features/agent-fix/types";

export function AgentFixToolbar({
  className,
  size = "sm",
  source,
  variant = "inline",
}: {
  className?: string;
  size?: "sm" | "xs";
  source: AgentFixPromptSource;
  variant?: "bottom" | "inline";
}) {
  const {
    availableAgents,
    rememberSelectedAgent,
    runConfigByAgentId,
    selectedAgent,
    selectedAgentId,
    setRunConfigForAgent,
    setSelectedAgentId,
  } = useAgentFixConfig();
  const runConfig = selectedAgent ? runConfigByAgentId[selectedAgent.id] ?? null : null;
  const { copyPrompt, isCopying, isLaunching, launchAgentFix } = useAgentFixActions({
    agent: selectedAgent,
    rememberAgent: rememberSelectedAgent,
    runConfig,
    source,
  });
  const disabledReason = source.disabledReason?.trim();
  const disableLaunch = !!disabledReason || !selectedAgent || isLaunching || isCopying;
  const isBottom = variant === "bottom";
  const segmentClass = isBottom
    ? "text-foreground/90 transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background hover:text-foreground"
    : "text-secondary-foreground transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-secondary/80 hover:text-secondary-foreground";
  const controlHeightClass = size === "xs" ? "h-6" : "h-8";
  const settingsSizeClass = size === "xs" ? "size-6" : "size-8";
  const iconSizeClass = size === "xs" ? "size-3" : "size-3.5";
  const agentIconSize = size === "xs" ? 13 : 15;
  const textSizeClass = size === "xs" ? "text-[11px]" : "text-xs";
  const segmentPaddingClass = size === "xs" ? "px-2" : "px-2.5";

  return (
    <div
      className={cn(
        "flex min-w-0 items-stretch overflow-hidden rounded-md border shadow-none",
        isBottom
          ? "w-full border-border/60 bg-muted/30"
          : "border-transparent bg-secondary",
        className,
      )}
      title={disabledReason || undefined}
    >
      <AgentFixSettingsPopover
        agents={availableAgents}
        disabled={isLaunching || isCopying}
        selectedAgentId={selectedAgentId}
        onSelectedAgentChange={setSelectedAgentId}
        runConfig={runConfig}
        runConfigByAgentId={runConfigByAgentId}
        onRunConfigChange={setRunConfigForAgent}
        className={cn(
          "rounded-none border-0 border-r border-border/50 bg-transparent shadow-none",
          settingsSizeClass,
          segmentClass,
        )}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isCopying || isLaunching}
        onClick={() => void copyPrompt()}
        className={cn(
          "min-w-0 rounded-none border-r border-border/50 font-medium shadow-none",
          controlHeightClass,
          segmentPaddingClass,
          textSizeClass,
          segmentClass,
        )}
        aria-label="Copy Agent Fix prompt"
        title="Copy Prompt"
      >
        {isCopying ? <Loader2 className={cn(iconSizeClass, "animate-spin")} /> : <Copy className={iconSizeClass} />}
        <span className="truncate">Prompt</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disableLaunch}
        onClick={() => void launchAgentFix()}
        className={cn(
          "min-w-0 rounded-none font-medium shadow-none",
          controlHeightClass,
          segmentPaddingClass,
          textSizeClass,
          segmentClass,
          isBottom && "flex-1",
        )}
      >
        {isLaunching ? (
          <Loader2 className={cn(iconSizeClass, "animate-spin")} />
        ) : selectedAgent ? (
          <AgentIcon registryId={selectedAgent.id} name={selectedAgent.label} size={agentIconSize} />
        ) : (
          <Bot className={iconSizeClass} />
        )}
        <span className="truncate">Agent Fix</span>
      </Button>
    </div>
  );
}

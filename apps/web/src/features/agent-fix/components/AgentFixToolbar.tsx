"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";
import { cn } from "@workspace/ui";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { AgentFixSettingsPopover } from "@/features/agent-fix/components/AgentFixSettingsPopover";
import { AgentFixToolbarPrimitive } from "@/features/agent-fix/components/AgentFixToolbarPrimitive";
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
  const t = useTranslations("agent.fixToolbar");
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
  const agentIconSize = size === "xs" ? 13 : 15;

  return (
    <AgentFixToolbarPrimitive
      className={className}
      size={size}
      variant={variant}
      title={disabledReason || undefined}
      renderSettings={(settingsClassName) => (
        <AgentFixSettingsPopover
          agents={availableAgents}
          disabled={isLaunching || isCopying}
          selectedAgentId={selectedAgentId}
          onSelectedAgentChange={setSelectedAgentId}
          runConfig={runConfig}
          runConfigByAgentId={runConfigByAgentId}
          onRunConfigChange={setRunConfigForAgent}
          className={settingsClassName}
        />
      )}
      copyAction={{
        ariaLabel: t("copyAction.ariaLabel"),
        disabled: isCopying || isLaunching,
        isLoading: isCopying,
        label: t("copyAction.label"),
        onClick: copyPrompt,
        title: t("copyAction.title"),
      }}
      primaryAction={{
        disabled: disableLaunch,
        icon: selectedAgent ? (
          <AgentIcon registryId={selectedAgent.id} name={selectedAgent.label} size={agentIconSize} />
        ) : (
          <Bot className={cn(size === "xs" ? "size-3" : "size-3.5", "shrink-0")} />
        ),
        isLoading: isLaunching,
        label: t("primaryAction.label"),
        onClick: launchAgentFix,
      }}
    />
  );
}

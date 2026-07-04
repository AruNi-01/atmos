"use client";

import React from "react";
import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";
import { TerminalAgentSelectorWithRunConfig } from "@/features/agent/components/TerminalAgentSelectorWithRunConfig";
import {
  buildInteractiveAgentCommand,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";

export const AGENT_OPTIONS = TERMINAL_AGENT_DEFINITIONS;

export type AgentId = string;

export function getInteractiveAgentParams(
  agent: (typeof AGENT_OPTIONS)[number],
  overrideFlags?: string,
): string {
  const hasInteractiveParams = Object.prototype.hasOwnProperty.call(agent, "interactiveParams");
  const interactiveParams = agent.interactiveParams ?? "";
  if (overrideFlags !== undefined) {
    const flags = overrideFlags.trim();
    if (isNonInteractivePromptFlagsWithoutPrompt(agent.id, flags)) {
      return interactiveParams;
    }
    if (flags !== agent.params) return flags;
  }
  return hasInteractiveParams ? interactiveParams : overrideFlags?.trim() || agent.params || "";
}

function isNonInteractivePromptFlagsWithoutPrompt(agentId: string, flags: string): boolean {
  if (agentId === "pi") {
    return flags === "-p" || flags === "--print";
  }
  if (agentId === "hermes") {
    return /(?:^|\s)(?:-q|--query)\s*$/.test(flags);
  }
  if (agentId === "openclaw") {
    return flags === "agent --agent main --local --json --message";
  }
  if (agentId === "antigravity") {
    return /(?:^|\s)(?:-p|--print|--prompt-interactive|-i)\s*$/.test(flags);
  }
  return false;
}

export function buildCommand(
  agentId: AgentId,
  prompt: string,
  runConfig?: TerminalAgentRunConfigInput | null,
): string {
  const agent = AGENT_OPTIONS.find((a) => a.id === agentId);
  if (!agent) return "";

  const interactiveParams = getInteractiveAgentParams(agent);
  const launchCommand = [agent.cmd, interactiveParams].filter(Boolean).join(" ");
  return buildInteractiveAgentCommand({
    agentId,
    launchCommand,
    prompt,
    runConfig,
  });
}

interface AgentSelectProps {
  value: AgentId;
  onValueChange: (value: AgentId) => void;
  className?: string;
  /**
   * Helper text shown under the select. Defaults to the wiki-specific guidance because
   * this component originated in the wiki flow; non-wiki callers (e.g. code review) should
   * pass their own copy so we don't mention "wiki content" outside of wiki dialogs.
   */
  helperText?: React.ReactNode;
  enableRunConfig?: boolean;
  runConfig?: TerminalAgentRunConfigInput | null;
  runConfigByAgentId?: Record<string, TerminalAgentRunConfigInput | null | undefined>;
  onRunConfigChange?: (agentId: AgentId, value: TerminalAgentRunConfigInput | null) => void;
}

export const AgentSelect: React.FC<AgentSelectProps> = ({
  value,
  onValueChange,
  className,
  helperText = "Prefer models with strong text editing capabilities (e.g. Claude, Gemini, GPT). Coding-focused models may produce lower quality wiki content.",
  enableRunConfig = false,
  runConfig = null,
  runConfigByAgentId,
  onRunConfigChange,
}) => {
  if (enableRunConfig && onRunConfigChange) {
    return (
      <TerminalAgentSelectorWithRunConfig
        variant="field"
        className={className}
        options={AGENT_OPTIONS}
        value={value}
        onValueChange={onValueChange}
        runConfig={runConfig}
        runConfigByAgentId={runConfigByAgentId}
        onRunConfigChange={onRunConfigChange}
        helperText={helperText}
        purpose="interactive"
      />
    );
  }

  return (
    <TerminalAgentSelectorWithRunConfig
      variant="field"
      className={className}
      options={AGENT_OPTIONS}
      value={value}
      onValueChange={onValueChange}
      runConfig={null}
      onRunConfigChange={() => {}}
      showRunConfig={false}
      helperText={helperText}
      purpose="interactive"
    />
  );
};

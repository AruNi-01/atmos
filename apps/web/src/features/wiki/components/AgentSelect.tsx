"use client";

import React from "react";
import { shellQuote } from "@/shared/lib/shell-quote";
import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";
import { TerminalAgentSelectorWithRunConfig } from "@/features/agent/components/TerminalAgentSelectorWithRunConfig";
import {
  buildStructuredRunConfigArgs,
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
  return false;
}

export function buildCommand(
  agentId: AgentId,
  prompt: string,
  runConfig?: TerminalAgentRunConfigInput | null,
): string {
  const agent = AGENT_OPTIONS.find((a) => a.id === agentId);
  if (!agent) return "";

  const strategy = agent.promptStrategy ?? (agent.useEcho ? "stdin" : "arg");
  const structuredArgs = buildStructuredRunConfigArgs(agentId, runConfig).map((item) =>
    shellQuote(item),
  );

  if (prompt.trim() === "") {
    const interactiveParams = getInteractiveAgentParams(agent);
    return [agent.cmd, interactiveParams, ...structuredArgs].filter(Boolean).join(" ");
  }

  const quoted = shellQuote(prompt);

  if (strategy === "stdin") {
    const params = agent.params ? ` ${agent.params}` : "";
    return `echo ${quoted} | ${[`${agent.cmd}${params}`, ...structuredArgs].filter(Boolean).join(" ")}`;
  }

  const parts: string[] = [agent.cmd];

  if (agent.params) {
    parts.push(agent.params);
  }

  parts.push(...structuredArgs, quoted);

  return parts.join(" ");
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
  onRunConfigChange?: (value: TerminalAgentRunConfigInput | null) => void;
}

export const AgentSelect: React.FC<AgentSelectProps> = ({
  value,
  onValueChange,
  className,
  helperText = "Prefer models with strong text editing capabilities (e.g. Claude, Gemini, GPT). Coding-focused models may produce lower quality wiki content.",
  enableRunConfig = false,
  runConfig = null,
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

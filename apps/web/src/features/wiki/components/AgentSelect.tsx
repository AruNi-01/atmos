"use client";

import React from "react";
import { shellQuote } from "@/shared/lib/shell-quote";
import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";
import {
  DEFAULT_AGENT_YOLO_MODE,
  readYoloModeFromSettings,
  resolveAgentLaunchFlags,
} from "@/features/agent/lib/terminal-agent-yolo";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";
import { TerminalAgentSelectorWithRunConfig } from "@/features/agent/components/TerminalAgentSelectorWithRunConfig";
import {
  buildInteractiveAgentRunPlan,
  buildStructuredRunConfigArgs,
  type TerminalAgentRunMode,
  type TerminalAgentRunPlan,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";

export const AGENT_OPTIONS = TERMINAL_AGENT_DEFINITIONS;

export type AgentId = string;

/** Current YOLO mode from loaded function settings (defaults to on). */
export function getAgentYoloModeSync(): boolean {
  const settings = useFunctionSettingsStore.getState().settings as
    | Record<string, unknown>
    | null
    | undefined;
  return readYoloModeFromSettings(settings);
}

export function getInteractiveAgentParams(
  agent: (typeof AGENT_OPTIONS)[number],
  overrideFlags?: string,
  yoloEnabled: boolean = getAgentYoloModeSync(),
): string {
  const resolved = resolveAgentLaunchFlags(agent, yoloEnabled);
  const yoloOn = resolveAgentLaunchFlags(agent, true);
  const yoloOff = resolveAgentLaunchFlags(agent, false);
  const hasInteractiveParams =
    Object.prototype.hasOwnProperty.call(agent, "interactiveParams") ||
    Object.prototype.hasOwnProperty.call(agent, "yoloInteractiveParams");
  const interactiveParams = resolved.interactiveParams;
  if (overrideFlags !== undefined) {
    const flags = overrideFlags.trim();
    if (isNonInteractivePromptFlagsWithoutPrompt(agent.id, flags)) {
      // Map headless prompt-only flags → interactive defaults for current YOLO mode.
      if (flags === yoloOn.params) return yoloOn.interactiveParams;
      if (flags === yoloOff.params) return yoloOff.interactiveParams;
      return interactiveParams;
    }
    // Saved headless automation flags → matching interactive defaults.
    if (flags === yoloOn.params) return yoloOn.interactiveParams;
    if (flags === yoloOff.params) return yoloOff.interactiveParams;
    // True custom override.
    if (flags !== resolved.params) return flags;
  }
  return hasInteractiveParams ? interactiveParams : overrideFlags?.trim() || resolved.params || "";
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

export function buildCommandPlan(
  agentId: AgentId,
  prompt: string,
  runConfig?: TerminalAgentRunConfigInput | null,
  mode: TerminalAgentRunMode = "interactive",
  yoloEnabled: boolean = getAgentYoloModeSync(),
): TerminalAgentRunPlan {
  const agent = AGENT_OPTIONS.find((a) => a.id === agentId);
  if (!agent) return { launchCommand: "" };
  const resolved = resolveAgentLaunchFlags(agent, yoloEnabled);

  if (prompt.trim() === "") {
    const interactiveParams = getInteractiveAgentParams(agent, undefined, yoloEnabled);
    const structuredArgs = buildStructuredRunConfigArgs(agentId, runConfig).map((item) =>
      shellQuote(item),
    );
    return {
      launchCommand: [agent.cmd, interactiveParams, ...structuredArgs].filter(Boolean).join(" "),
    };
  }

  if (mode === "interactive") {
    const interactiveParams = getInteractiveAgentParams(agent, undefined, yoloEnabled);
    const launchCommand = [agent.cmd, interactiveParams].filter(Boolean).join(" ");
    return buildInteractiveAgentRunPlan({
      agentId,
      launchCommand,
      prompt,
      runConfig,
      mode,
    });
  }

  const launchParts: string[] = [agent.cmd];
  if (resolved.params) {
    launchParts.push(resolved.params);
  }
  return buildInteractiveAgentRunPlan({
    agentId,
    launchCommand: launchParts.join(" "),
    prompt,
    runConfig,
    mode: "headless",
  });
}

export function buildCommand(
  agentId: AgentId,
  prompt: string,
  runConfig?: TerminalAgentRunConfigInput | null,
  mode: TerminalAgentRunMode = "interactive",
): string {
  return buildCommandPlan(agentId, prompt, runConfig, mode).launchCommand;
}

export function toTerminalPaneAgent(agentId: AgentId) {
  const agent = AGENT_OPTIONS.find((item) => item.id === agentId);
  if (!agent) return undefined;
  return {
    id: agent.id,
    label: agent.label,
    command: agent.cmd,
    iconType: "built-in" as const,
  };
}

export type WikiTerminalRun = {
  command: string;
  tuiFollowUpPrompt?: string;
  agentId: AgentId;
};

export function buildWikiTerminalRun(
  agentId: AgentId,
  prompt: string,
  runConfig?: TerminalAgentRunConfigInput | null,
): WikiTerminalRun {
  const plan = buildCommandPlan(agentId, prompt, runConfig, "interactive");
  return {
    command: plan.launchCommand,
    tuiFollowUpPrompt: plan.tuiFollowUpPrompt,
    agentId,
  };
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

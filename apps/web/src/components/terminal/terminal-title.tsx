"use client";

import React from "react";
import { Bot, Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@workspace/ui";
import { AgentIcon } from "@/components/agent/AgentIcon";
import type { TerminalPaneAgent } from "./types";

const RUNTIME_WRAPPER_COMMANDS = new Set([
  "node",
  "bun",
  "npm",
  "pnpm",
  "yarn",
  "npx",
  "python",
  "python3",
  "uv",
  "go",
  "cargo",
  "deno",
  "env",
]);

function normalizeAgentCommand(value: string): string {
  const firstToken = value.trim().split(/\s+/)[0] ?? "";
  const withoutPath = firstToken.split("/").filter(Boolean).pop() ?? firstToken;
  return withoutPath.toLowerCase();
}

export function isPathLikeTitle(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/") ||
    trimmed === "~" ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.startsWith("../") ||
    trimmed.includes("/")
  );
}

function isRuntimeWrapperTitle(value: string | undefined): boolean {
  const normalized = value?.trim().split(/\s+/)[0]?.split("/").filter(Boolean).pop()?.toLowerCase();
  return Boolean(normalized && RUNTIME_WRAPPER_COMMANDS.has(normalized));
}

function isVersionLikeTitle(value: string | undefined): boolean {
  if (!value) return false;
  return /^v?\d+(?:\.\d+)+(?:[-+][\w.-]+)?$/i.test(value.trim());
}

export function resolveAgentForTitle(
  title: string | undefined,
  agents: TerminalPaneAgent[],
): TerminalPaneAgent | undefined {
  if (!title || isPathLikeTitle(title)) return undefined;
  const normalizedTitle = normalizeAgentCommand(title);
  if (!normalizedTitle) return undefined;

  // Special handling for echo and pipe commands
  // If title is "echo", check if any agent has a pipeCommand that matches
  if (normalizedTitle === "echo") {
    return agents.find((agent) => agent.pipeCommand);
  }

  // If title contains a pipe, try to match the command after the pipe
  if (title.includes("|")) {
    const afterPipe = title.split("|").slice(1).join("|").trim();
    const normalizedAfterPipe = normalizeAgentCommand(afterPipe);
    if (normalizedAfterPipe) {
      return agents.find((agent) => {
        const normalizedCommand = normalizeAgentCommand(agent.command);
        const normalizedPipeCommand = agent.pipeCommand ? normalizeAgentCommand(agent.pipeCommand) : "";
        return (
          (normalizedCommand !== "" && normalizedAfterPipe.includes(normalizedCommand)) ||
          (normalizedPipeCommand !== "" && normalizedAfterPipe.includes(normalizedPipeCommand))
        );
      });
    }
  }

  // Standard matching for non-pipe commands
  return agents.find((agent) => {
    const normalizedCommand = normalizeAgentCommand(agent.command);
    return normalizedCommand !== "" && normalizedTitle.includes(normalizedCommand);
  });
}

function resolveAgentForLabel(
  label: string | undefined,
  agents: TerminalPaneAgent[],
): TerminalPaneAgent | undefined {
  if (!label) return undefined;
  const normalizedLabel = label.trim().toLowerCase();
  return agents.find((agent) => agent.label.trim().toLowerCase() === normalizedLabel);
}

export function getTerminalDisplayTitle(options: {
  baseTitle: string | undefined;
  dynamicTitle: string | undefined;
  configuredAgents?: TerminalPaneAgent[];
  agent?: TerminalPaneAgent;
}) {
  const { baseTitle, dynamicTitle, configuredAgents = [], agent } = options;
  const dynamicTitleIsVersion = isVersionLikeTitle(dynamicTitle);
  const matchedDynamicAgent = resolveAgentForTitle(dynamicTitle, configuredAgents);
  const labelAgent = dynamicTitleIsVersion
    ? resolveAgentForLabel(baseTitle, configuredAgents)
    : undefined;
  const fallbackAgent = isRuntimeWrapperTitle(dynamicTitle)
    ? agent
    : dynamicTitleIsVersion
    ? labelAgent ?? agent
    : undefined;
  return (matchedDynamicAgent ?? fallbackAgent ?? labelAgent)?.label
    ?? (dynamicTitleIsVersion ? baseTitle : dynamicTitle)
    ?? baseTitle
    ?? "";
}

export function getTerminalDisplayMeta(options: {
  baseTitle: string | undefined;
  dynamicTitle: string | undefined;
  configuredAgents?: TerminalPaneAgent[];
  agent?: TerminalPaneAgent;
}) {
  const { baseTitle, dynamicTitle, configuredAgents = [], agent } = options;
  const dynamicTitleIsVersion = isVersionLikeTitle(dynamicTitle);
  const matchedDynamicAgent = resolveAgentForTitle(dynamicTitle, configuredAgents);
  const labelAgent = dynamicTitleIsVersion
    ? resolveAgentForLabel(baseTitle, configuredAgents)
    : undefined;
  const fallbackAgent = isRuntimeWrapperTitle(dynamicTitle)
    ? agent
    : dynamicTitleIsVersion
    ? labelAgent ?? agent
    : undefined;
  const toolbarAgent = matchedDynamicAgent ?? fallbackAgent ?? labelAgent;

  return {
    toolbarAgent,
    displayTitle: toolbarAgent?.label ?? (dynamicTitleIsVersion ? baseTitle : dynamicTitle) ?? baseTitle ?? "",
  };
}

interface TerminalTitleWithAgentProps {
  displayTitle: string;
  toolbarAgent: TerminalPaneAgent | undefined;
  className?: string;
}

export function TerminalTitleWithAgent({
  displayTitle,
  toolbarAgent,
  className,
}: TerminalTitleWithAgentProps) {
  return (
    <div className={cn("flex items-center", className)}>
      {toolbarAgent?.iconType === "built-in" ? (
        <AgentIcon registryId={toolbarAgent.id} name={toolbarAgent.label} size={14} />
      ) : toolbarAgent?.iconType === "custom" ? (
        <Bot className="size-3.5 text-muted-foreground" />
      ) : (
        <TerminalIcon className="size-3.5 text-muted-foreground" />
      )}
      <span className="ml-0.5">{displayTitle}</span>
    </div>
  );
}

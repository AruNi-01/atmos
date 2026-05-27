"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import { shellQuote } from "@/shared/lib/shell-quote";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";

export const AGENT_OPTIONS = TERMINAL_AGENT_DEFINITIONS;

export type AgentId = string;

export function buildCommand(
  agentId: AgentId,
  prompt: string
): string {
  const agent = AGENT_OPTIONS.find((a) => a.id === agentId);
  if (!agent) return "";

  const quoted = shellQuote(prompt);
  const strategy = agent.promptStrategy ?? (agent.useEcho ? "stdin" : "arg");
  const params = agent.params ? ` ${agent.params}` : "";

  if (prompt.trim() === "") {
    return `${agent.cmd}${params}`;
  }

  if (strategy === "stdin") {
    return `echo ${quoted} | ${agent.cmd}${params}`;
  }

  const parts: string[] = [agent.cmd];

  if (agent.params) {
    parts.push(agent.params, quoted);
  } else {
    parts.push(quoted);
  }

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
}

export const AgentSelect: React.FC<AgentSelectProps> = ({
  value,
  onValueChange,
  className,
  helperText = "Prefer models with strong text editing capabilities (e.g. Claude, Gemini, GPT). Coding-focused models may produce lower quality wiki content.",
}) => {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
        Code Agent
      </label>
      <Select value={value} onValueChange={(v) => onValueChange(v as AgentId)}>
        <SelectTrigger className="w-full cursor-pointer">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AGENT_OPTIONS.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              <div className="flex items-center gap-2">
                <AgentIcon registryId={opt.id} name={opt.label} size={16} />
                {opt.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helperText ? (
        <p className="text-[11px] text-muted-foreground mt-1.5">{helperText}</p>
      ) : null}
    </div>
  );
};

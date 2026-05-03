"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui";
import { shellQuote } from "@/lib/shell-quote";
import { AgentIcon } from "@/components/agent/AgentIcon";

export const AGENT_OPTIONS = [
  { id: "claude", label: "Claude Code", cmd: "claude", params: "--dangerously-skip-permissions" },
  { id: "codex", label: "Codex", cmd: "codex", params: "--dangerously-bypass-approvals-and-sandbox" },
  { id: "gemini", label: "Gemini", cmd: "gemini", params: "--yolo" },
  { id: "amp", label: "Amp", cmd: "amp", params: "" },
  { id: "droid", label: "Droid", cmd: "droid", params: "" },
  { id: "opencode", label: "OpenCode", cmd: "opencode", params: "--prompt" },
  { id: "kimi", label: "Kimi", cmd: "kimi", params: "" },
  { id: "cursor", label: "Cursor Agent", cmd: "agent", params: "--force" },
  { id: "kilocode", label: "Kilo Code", cmd: "kilocode", params: "" },
  { id: "kiro", label: "Kiro", cmd: "kiro-cli", params: "chat --agent atmos --trust-all-tools" },
] as const;

export type AgentId = (typeof AGENT_OPTIONS)[number]["id"];

export function buildCommand(
  agentId: AgentId,
  prompt: string
): string {
  const agent = AGENT_OPTIONS.find((a) => a.id === agentId);
  if (!agent) return "";

  const quoted = shellQuote(prompt);
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
}

export const AgentSelect: React.FC<AgentSelectProps> = ({
  value,
  onValueChange,
  className,
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
      <p className="text-[11px] text-muted-foreground mt-1.5">
        Prefer models with strong text editing capabilities (e.g. Claude, Gemini, GPT). Coding-focused models may produce lower quality wiki content.
      </p>
    </div>
  );
};

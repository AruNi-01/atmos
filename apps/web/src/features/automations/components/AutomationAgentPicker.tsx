"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import { Bot, CheckCircle2 } from "lucide-react";

import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { AutomationAgentCapability } from "@/features/automations/types";

export function AutomationAgentPicker({
  agents,
  selectedAgentId,
  onSelect,
}: {
  agents: AutomationAgentCapability[];
  selectedAgentId: string;
  onSelect: (agentId: string) => void;
}) {
  if (agents.length === 0) {
    return (
      <div className="flex h-10 items-center rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground">
        Loading agents
      </div>
    );
  }

  return (
    <div className="grid max-h-[178px] gap-2 overflow-auto pr-1">
      {agents.map((agent) => {
        const selected = agent.agent_id === selectedAgentId;
        return (
          <Tooltip key={agent.agent_id}>
            <TooltipTrigger asChild>
              <span>
                <button
                  type="button"
                  disabled={!agent.automation_supported}
                  onClick={() => onSelect(agent.agent_id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-background hover:bg-muted/35",
                    !agent.automation_supported && "cursor-not-allowed opacity-60",
                  )}
                >
                  {agent.agent_id ? (
                    <AgentIcon registryId={agent.agent_id} name={agent.label} size={18} />
                  ) : (
                    <Bot className="size-4 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{agent.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {agent.automation_supported ? "Ready for non-interactive runs" : agent.unavailable_reason}
                    </span>
                  </span>
                  {selected ? <CheckCircle2 className="size-4 text-primary" /> : null}
                </button>
              </span>
            </TooltipTrigger>
            {!agent.automation_supported && agent.unavailable_reason ? (
              <TooltipContent side="left">{agent.unavailable_reason}</TooltipContent>
            ) : null}
          </Tooltip>
        );
      })}
    </div>
  );
}

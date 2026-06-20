"use client";

import React from "react";
import { Bot, Terminal as TerminalIcon } from "lucide-react";
import { cn } from "@workspace/ui";
import {
  getTerminalDisplayMeta,
  getTerminalDisplayTitle,
  isPathLikeTitle,
  resolveAgentForTitle,
} from "@atmos/shared/terminal";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { TerminalPaneAgent } from "../types/index";

export {
  getTerminalDisplayMeta,
  getTerminalDisplayTitle,
  isPathLikeTitle,
  resolveAgentForTitle,
};

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

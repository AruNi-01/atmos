"use client";

import { Bot, Terminal as TerminalIcon } from "lucide-react";
import type { TerminalTitleAgent } from "@atmos/shared/terminal";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { cn } from "@/shared/lib/utils";

export function ResourceMonitorSessionName({
  name,
  toolbarAgent,
  className,
}: {
  name: string;
  toolbarAgent: TerminalTitleAgent | undefined;
  className?: string;
}) {
  const icon =
    toolbarAgent?.iconType === "built-in" ? (
      <AgentIcon
        registryId={toolbarAgent.id}
        name={toolbarAgent.label}
        size={12}
      />
    ) : toolbarAgent?.iconType === "custom" ? (
      <Bot className="size-3 text-muted-foreground" aria-hidden />
    ) : (
      <TerminalIcon className="size-3 text-muted-foreground" aria-hidden />
    );

  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <span className="flex size-3 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

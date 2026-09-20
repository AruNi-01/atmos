"use client";

import { Bot, Terminal as TerminalIcon } from "lucide-react";
import type { TerminalTitleAgent } from "@atmos/shared/terminal";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { cn } from "@/shared/lib/utils";

export function ResourceMonitorSessionIcon({
  toolbarAgent,
}: {
  toolbarAgent: TerminalTitleAgent | undefined;
}) {
  if (toolbarAgent?.iconType === "built-in") {
    return (
      <AgentIcon
        registryId={toolbarAgent.id}
        name={toolbarAgent.label}
        size={12}
      />
    );
  }
  if (toolbarAgent?.iconType === "custom") {
    return <Bot className="size-3 text-muted-foreground" aria-hidden />;
  }
  return <TerminalIcon className="size-3 text-muted-foreground" aria-hidden />;
}

export function ResourceMonitorSessionName({
  name,
  toolbarAgent,
  className,
  showIcon = true,
}: {
  name: string;
  toolbarAgent: TerminalTitleAgent | undefined;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {showIcon ? (
        <span className="flex size-3 shrink-0 items-center justify-center">
          <ResourceMonitorSessionIcon toolbarAgent={toolbarAgent} />
        </span>
      ) : null}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

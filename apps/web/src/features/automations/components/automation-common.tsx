"use client";

import { Badge, cn } from "@workspace/ui";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  LoaderCircle,
  Square,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type {
  AutomationAgentCapability,
  AutomationArtifactKind,
  AutomationRunStatus,
} from "@/features/automations/types";

export const ARTIFACT_OPTIONS: Array<{
  kind: AutomationArtifactKind;
  label: string;
  description: string;
}> = [
  { kind: "final", label: "Result", description: "final.md" },
  { kind: "output", label: "Output Log", description: "output.log" },
  { kind: "prompt", label: "Prompt", description: "prompt.md" },
  { kind: "events", label: "Events", description: "events.jsonl" },
  { kind: "run_json", label: "Run JSON", description: "run.json" },
];

const STATUS_STYLES: Record<
  AutomationRunStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  running: {
    label: "Running",
    icon: LoaderCircle,
    className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "Cancelled",
    icon: Square,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  interrupted: {
    label: "Interrupted",
    icon: AlertCircle,
    className: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
};

export function MetadataItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/15 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm text-foreground">{value || "None"}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: AutomationRunStatus }) {
  const meta = STATUS_STYLES[status] ?? STATUS_STYLES.interrupted;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1.5", meta.className)}>
      <Icon className={cn("size-3.5", status === "running" && "animate-spin")} />
      {meta.label}
    </Badge>
  );
}

export function AutomationAgentLabel({
  agent,
  agentId,
  className,
  iconSize = 14,
}: {
  agent: AutomationAgentCapability | null;
  agentId: string;
  className?: string;
  iconSize?: number;
}) {
  const label = agent?.label ?? agentId;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {agentId ? (
        <AgentIcon registryId={agentId} name={label} size={iconSize} />
      ) : (
        <Bot className="shrink-0 text-muted-foreground" style={{ width: iconSize, height: iconSize }} />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

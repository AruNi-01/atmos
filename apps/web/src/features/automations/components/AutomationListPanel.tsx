"use client";

import { Badge, Button, cn } from "@workspace/ui";
import { Workflow } from "lucide-react";

import { StatusBadge } from "@/features/automations/components/automation-common";
import {
  formatDateTime,
  formatScheduleLabel,
  formatTargetKind,
  statusMeta,
} from "@/features/automations/lib/automation-format";
import type {
  AutomationAgentCapability,
  AutomationSummary,
} from "@/features/automations/types";

export function AutomationListPanel({
  automations,
  agents,
  loading,
  error,
  selectedAutomationGuid,
  supportedAgentCount,
  createDisabled,
  onSelect,
  onCreate,
}: {
  automations: AutomationSummary[];
  agents: AutomationAgentCapability[];
  loading: boolean;
  error: string | null;
  selectedAutomationGuid: string | null;
  supportedAgentCount: number;
  createDisabled: boolean;
  onSelect: (guid: string) => void;
  onCreate: () => void;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Definitions</div>
          <div className="text-xs text-muted-foreground">{supportedAgentCount} agents ready for unattended runs</div>
        </div>
        <Button size="sm" variant="outline" disabled={createDisabled} onClick={onCreate}>
          <Workflow className="size-3.5" />
          New
        </Button>
      </div>

      {error ? (
        <div className="m-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {loading && automations.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-md border border-border bg-muted/20" />
            ))}
          </div>
        ) : automations.length === 0 ? (
          <div className="flex h-full min-h-64 items-center justify-center rounded-md border border-dashed border-border bg-muted/10 px-6 text-center">
            <div>
              <div className="mx-auto flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Workflow className="size-5" />
              </div>
              <div className="mt-3 text-sm font-medium text-foreground">No automations</div>
              <div className="mt-1 text-xs text-muted-foreground">Create one after a supported agent is available.</div>
              <Button className="mt-4" size="sm" disabled={createDisabled} onClick={onCreate}>
                New Automation
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {automations.map((automation) => (
              <AutomationListRow
                key={automation.guid}
                automation={automation}
                agent={agents.find((item) => item.agent_id === automation.agent_id) ?? null}
                selected={automation.guid === selectedAutomationGuid}
                onSelect={() => onSelect(automation.guid)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AutomationListRow({
  automation,
  agent,
  selected,
  onSelect,
}: {
  automation: AutomationSummary;
  agent: AutomationAgentCapability | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = statusMeta(automation.last_status);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-transparent bg-background hover:border-border hover:bg-muted/35",
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium text-foreground">{automation.display_name}</div>
          {automation.schedule_paused ? <Badge variant="outline">Paused</Badge> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{agent?.label ?? automation.agent_id}</span>
          <span className="text-border">/</span>
          <span>{formatTargetKind(automation.target_kind)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {status ? <StatusBadge status={status.status} /> : <Badge variant="secondary">Never run</Badge>}
          <span className="text-xs tabular-nums text-muted-foreground">{automation.run_count} runs</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
        <span>{formatScheduleLabel(automation)}</span>
        {automation.next_run_at ? <span>{formatDateTime(automation.next_run_at)}</span> : null}
      </div>
    </button>
  );
}

"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
  Tabs,
  TabsList,
  TabsTab,
} from "@workspace/ui";
import {
  CalendarClock,
  Clock3,
  Ellipsis,
  Folder,
  History,
  LoaderCircle,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Timer,
  Trash2,
} from "lucide-react";

import {
  AutomationAgentLabel,
  StatusBadge,
} from "@/features/automations/components/automation-common";
import {
  formatDateTime,
  formatScheduleLabel,
  formatTarget,
  statusMeta,
} from "@/features/automations/lib/automation-format";
import type {
  AutomationAgentCapability,
  AutomationSummary,
} from "@/features/automations/types";
import type { AutomationTargetFilter } from "@/shared/lib/nuqs/searchParams";
import type { Project } from "@/shared/types/domain";

const TARGET_FILTERS: Array<{ value: AutomationTargetFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "project", label: "Project" },
  { value: "workspace", label: "Workspace" },
  { value: "standalone", label: "Standalone" },
];

export function AutomationListPanel({
  automations,
  agents,
  loading,
  error,
  supportedAgentCount,
  createDisabled,
  busyAction,
  projects,
  targetFilter,
  searchQuery,
  onReload,
  onCreate,
  onEdit,
  onOpenHistory,
  onTargetFilterChange,
  onSearchQueryChange,
  onRunAction,
}: {
  automations: AutomationSummary[];
  agents: AutomationAgentCapability[];
  loading: boolean;
  error: string | null;
  supportedAgentCount: number;
  createDisabled: boolean;
  busyAction: string | null;
  projects: Project[];
  targetFilter: AutomationTargetFilter;
  searchQuery: string;
  onReload: () => void;
  onCreate: () => void;
  onEdit: (guid: string) => void;
  onOpenHistory: (guid: string) => void;
  onTargetFilterChange: (value: AutomationTargetFilter) => void;
  onSearchQueryChange: (value: string) => void;
  onRunAction: (action: "run" | "pause" | "resume" | "delete", automation: AutomationSummary) => Promise<void>;
}) {
  const [deleteTarget, setDeleteTarget] = React.useState<AutomationSummary | null>(null);
  const agentById = React.useMemo(
    () => new Map(agents.map((agent) => [agent.agent_id, agent])),
    [agents],
  );

  const filterCounts = React.useMemo(() => {
    return TARGET_FILTERS.reduce<Record<AutomationTargetFilter, number>>(
      (acc, filter) => {
        acc[filter.value] = automations.filter((automation) => matchesTargetFilter(automation, filter.value)).length;
        return acc;
      },
      { all: 0, project: 0, workspace: 0, standalone: 0 },
    );
  }, [automations]);

  const filteredAutomations = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return automations.filter((automation) => {
      if (!matchesTargetFilter(automation, targetFilter)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const agent = agentById.get(automation.agent_id);
      const haystack = [
        automation.display_name,
        automation.agent_id,
        agent?.label,
        formatTarget(automation, projects),
        formatScheduleLabel(automation),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [agentById, automations, projects, searchQuery, targetFilter]);

  const deleteBusy = deleteTarget ? busyAction === `delete:${deleteTarget.guid}` : false;

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-background/50">
      <ScrollArea className="h-full scrollbar-on-hover">
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
          <div className="space-y-2 pb-8 pt-10">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Timer className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Automations</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {automations.length} automations · {supportedAgentCount} supported agents
                </p>
              </div>
            </div>
          </div>

          <div className="sticky top-0 z-10 -mx-4 bg-background/85 px-4 pb-6 pt-2 backdrop-blur-md sm:-mx-8 sm:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative group min-w-0 flex-1">
                <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                <Input
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  placeholder="Search by name, target, or agent..."
                  className="h-11 rounded-xl border-border/50 bg-muted/20 pl-10 shadow-sm transition-all focus:bg-background focus-visible:ring-1 focus-visible:ring-primary/20"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs
                  value={targetFilter}
                  onValueChange={(value) => onTargetFilterChange(value as AutomationTargetFilter)}
                  className="shrink-0"
                >
                  <TabsList className="h-9">
                    {TARGET_FILTERS.map((filter) => (
                      <TabsTab
                        key={filter.value}
                        value={filter.value}
                        className="px-3 text-xs"
                      >
                        {filter.label}
                        <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground">
                          {filterCounts[filter.value]}
                        </span>
                      </TabsTab>
                    ))}
                  </TabsList>
                </Tabs>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-xl"
                  onClick={onReload}
                  disabled={loading}
                  aria-label="Refresh automations"
                >
                  {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                </Button>
                <Button size="sm" disabled={createDisabled} onClick={onCreate}>
                  <Timer className="size-4" />
                  New
                </Button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="pb-12">
            {loading && automations.length === 0 ? (
              <div className="grid gap-2.5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-[104px] animate-pulse rounded-xl border border-border bg-background"
                  />
                ))}
              </div>
            ) : filteredAutomations.length === 0 ? (
              <EmptyAutomationList
                hasQuery={Boolean(searchQuery.trim())}
                hasAutomations={automations.length > 0}
                createDisabled={createDisabled}
                onClear={() => onSearchQueryChange("")}
                onCreate={onCreate}
              />
            ) : (
              <div className="grid gap-2.5">
                <AnimatePresence mode="popLayout" initial={false}>
                  {filteredAutomations.map((automation, index) => (
                    <AutomationListRow
                      key={automation.guid}
                      automation={automation}
                      agent={agentById.get(automation.agent_id) ?? null}
                      projects={projects}
                      busyAction={busyAction}
                      index={index}
                      onRun={() => void onRunAction("run", automation)}
                      onHistory={() => onOpenHistory(automation.guid)}
                      onEdit={() => onEdit(automation.guid)}
                      onDelete={() => setDeleteTarget(automation)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="w-[min(92vw,420px)]">
          <DialogHeader>
            <DialogTitle>Delete automation?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.display_name ?? "This automation"} will be removed with its schedule and trigger route.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteTarget || deleteBusy}
              onClick={async () => {
                if (!deleteTarget) {
                  return;
                }
                await onRunAction("delete", deleteTarget);
                setDeleteTarget(null);
              }}
            >
              {deleteBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AutomationListRow({
  automation,
  agent,
  projects,
  busyAction,
  index,
  onRun,
  onHistory,
  onEdit,
  onDelete,
}: {
  automation: AutomationSummary;
  agent: AutomationAgentCapability | null;
  projects: Project[];
  busyAction: string | null;
  index: number;
  onRun: () => void;
  onHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const status = statusMeta(automation.last_status);
  const scheduleLabel = formatScheduleLabel(automation);
  const targetLabel = formatTarget(automation, projects);
  const runBusy = busyAction === `run:${automation.guid}`;
  const deleteBusy = busyAction === `delete:${automation.guid}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.018, 0.16) }}
      className="group relative flex w-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/35 hover:shadow-md lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Timer className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
              {automation.display_name}
            </h3>
            {automation.schedule_paused ? <Badge variant="outline">Paused</Badge> : null}
            {status ? <StatusBadge status={status.status} /> : <Badge variant="secondary">Never run</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              <Folder className="size-3.5 shrink-0" />
              <span className="truncate">{targetLabel}</span>
            </span>
            <span className="text-border">/</span>
            <AutomationAgentLabel agent={agent} agentId={automation.agent_id} />
            <span className="text-border">/</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {automation.run_count} runs
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground/80">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              {scheduleLabel}
            </span>
            {automation.next_run_at ? (
              <>
                <span className="text-border">/</span>
                <span className="tabular-nums">next {formatDateTime(automation.next_run_at)}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 pl-14 lg:pl-4">
        <Button variant="outline" size="sm" disabled={runBusy} onClick={onRun}>
          {runBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run Now
        </Button>
        <Button variant="outline" size="sm" onClick={onHistory}>
          <History className="size-4" />
          History
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9" aria-label="Automation actions">
              {deleteBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Ellipsis className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              disabled={deleteBusy}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

function EmptyAutomationList({
  hasQuery,
  hasAutomations,
  createDisabled,
  onClear,
  onCreate,
}: {
  hasQuery: boolean;
  hasAutomations: boolean;
  createDisabled: boolean;
  onClear: () => void;
  onCreate: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-6 py-16 text-center"
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
        {hasQuery || hasAutomations ? <Search className="size-8" /> : <Timer className="size-8" />}
      </div>
      <h3 className="text-lg font-semibold text-foreground">
        {hasQuery || hasAutomations ? "No matching automations" : "No automations yet"}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {hasQuery || hasAutomations
          ? "Adjust the search or target filter to find another automation."
          : "Create an automation after at least one non-interactive agent is available."}
      </p>
      <div className="mt-5 flex items-center gap-2">
        {hasQuery ? (
          <Button variant="outline" onClick={onClear}>
            Clear search
          </Button>
        ) : null}
        {!hasAutomations ? (
          <Button disabled={createDisabled} onClick={onCreate}>
            <Timer className="size-4" />
            New Automation
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}

function matchesTargetFilter(automation: AutomationSummary, filter: AutomationTargetFilter) {
  if (filter === "all") {
    return true;
  }
  if (filter === "project") {
    return automation.target_kind === "project" || automation.target_kind === "new_workspace";
  }
  return automation.target_kind === filter;
}

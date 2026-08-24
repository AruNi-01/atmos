"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
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
  Switch,
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
  Search,
  Timer,
  Trash2,
} from "lucide-react";

import {
  AutomationAgentLabel,
  StatusBadge,
} from "@/features/automations/components/automation-common";
import {
  formatAutomationAgentConfigSuffix,
  formatDateTime,
  formatScheduleLabel,
  formatTarget,
  isAutomationEnabled,
  isAutomationPaused,
  statusMeta,
  supportsAutomationEnabledToggle,
} from "@/features/automations/lib/automation-format";
import type {
  AutomationAgentCapability,
  AutomationRunSummary,
  AutomationSummary,
} from "@/features/automations/types";
import type { Project } from "@/shared/types/domain";
import { AutomationDashboardTabs } from "@/features/automations/components/AutomationDashboardTabs";
import { AutomationListFilterMenu } from "@/features/automations/components/AutomationListFilterMenu";
import { AutomationRunFilterMenu } from "@/features/automations/components/AutomationRunFilterMenu";
import { AutomationRunHistoryList } from "@/features/automations/components/AutomationRunHistoryList";
import {
  EMPTY_AUTOMATION_LIST_FILTERS,
  getActiveAutomationFilterCount,
  matchesAutomationListFilters,
  type AutomationListFilters,
} from "@/features/automations/lib/automation-list-filters";
import {
  EMPTY_AUTOMATION_RUN_FILTERS,
  type AutomationRunListFilters,
} from "@/features/automations/lib/automation-run-filters";
import type { AutomationsListTab } from "@/shared/lib/nuqs/searchParams";

export function AutomationListPanel({
  automations,
  agents,
  loading,
  error,
  supportedAgentCount,
  createDisabled,
  busyAction,
  projects,
  listTab,
  listFilters,
  runFilters,
  searchQuery,
  runs,
  runsLoading,
  selectedRunGuid,
  onCreate,
  onEdit,
  onListTabChange,
  onListFiltersChange,
  onRunFiltersChange,
  onSearchQueryChange,
  onSelectRun,
  onViewRuns,
  onRunAction,
  onToggleEnabled,
}: {
  automations: AutomationSummary[];
  agents: AutomationAgentCapability[];
  loading: boolean;
  error: string | null;
  supportedAgentCount: number;
  createDisabled: boolean;
  busyAction: string | null;
  projects: Project[];
  listTab: AutomationsListTab;
  listFilters: AutomationListFilters;
  runFilters: AutomationRunListFilters;
  searchQuery: string;
  runs: AutomationRunSummary[];
  runsLoading: boolean;
  selectedRunGuid: string | null;
  onCreate: () => void;
  onEdit: (guid: string) => void;
  onListTabChange: (tab: AutomationsListTab) => void;
  onListFiltersChange: (filters: AutomationListFilters) => void;
  onRunFiltersChange: (filters: AutomationRunListFilters) => void;
  onSearchQueryChange: (value: string) => void;
  onSelectRun: (guid: string) => void;
  onViewRuns: (guid: string) => void;
  onRunAction: (action: "run" | "pause" | "resume" | "delete", automation: AutomationSummary) => Promise<void>;
  onToggleEnabled: (automation: AutomationSummary, enabled: boolean) => Promise<void>;
}) {
  const t = useTranslations("automation.listPanel");
  const [deleteTarget, setDeleteTarget] = React.useState<AutomationSummary | null>(null);
  const agentById = React.useMemo(
    () => new Map(agents.map((agent) => [agent.agent_id, agent])),
    [agents],
  );
  const hasActiveFilters = getActiveAutomationFilterCount(listFilters) > 0;

  const filteredAutomations = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return automations.filter((automation) => {
      if (!matchesAutomationListFilters(automation, listFilters)) {
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
        formatAutomationAgentConfigSuffix(automation.agent_config_json),
        formatTarget(automation, projects),
        formatScheduleLabel(automation),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [agentById, automations, listFilters, projects, searchQuery]);

  const deleteBusy = deleteTarget ? busyAction === `delete:${deleteTarget.guid}` : false;

  return (
    // Must fill the absolute inset parent; flex-1 alone does nothing there and
    // the panel grows with content, so outer overflow-hidden clips with no scroll.
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background/50">
      <ScrollArea className="min-h-0 flex-1 scrollbar-on-hover">
        <div className="mx-auto w-full max-w-6xl px-6 sm:px-8">
          <div className="space-y-2 pb-8 pt-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Timer className="size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {listTab === "history"
                      ? t("historySummary", { runCount: runs.length })
                      : t("summary", {
                          automationCount: automations.length,
                          supportedAgentCount,
                        })}
                  </p>
                </div>
              </div>
              <AutomationDashboardTabs tab={listTab} onTabChange={onListTabChange} />
            </div>
          </div>

          <div className="sticky top-0 z-10 -mx-4 bg-background/85 px-4 pb-6 pt-2 backdrop-blur-md sm:-mx-8 sm:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="relative group min-w-0 flex-1">
                  <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 group-focus-within:text-primary" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    placeholder={
                      listTab === "history"
                        ? t("searchRunsPlaceholder")
                        : t("searchPlaceholder")
                    }
                    className="h-11 rounded-xl border-border/50 bg-muted/20 pl-10 shadow-sm transition-all focus:bg-background focus-visible:ring-1 focus-visible:ring-primary/20"
                  />
                </div>
                {listTab === "history" ? (
                  <AutomationRunFilterMenu
                    filters={runFilters}
                    runs={runs}
                    automations={automations}
                    onFiltersChange={onRunFiltersChange}
                  />
                ) : (
                  <AutomationListFilterMenu
                    filters={listFilters}
                    automations={automations}
                    onFiltersChange={onListFiltersChange}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={createDisabled} onClick={onCreate}>
                  <Timer className="size-4" />
                  {t("newButton")}
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
            {listTab === "history" ? (
              <AutomationRunHistoryList
                runs={runs}
                automations={automations}
                agents={agents}
                loading={runsLoading}
                searchQuery={searchQuery}
                filters={runFilters}
                selectedRunGuid={selectedRunGuid}
                onSelectRun={onSelectRun}
                onClear={() => {
                  onSearchQueryChange("");
                  onRunFiltersChange(EMPTY_AUTOMATION_RUN_FILTERS);
                }}
              />
            ) : loading && automations.length === 0 ? (
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
                hasFilters={hasActiveFilters}
                hasAutomations={automations.length > 0}
                createDisabled={createDisabled}
                onClear={() => {
                  onSearchQueryChange("");
                  onListFiltersChange(EMPTY_AUTOMATION_LIST_FILTERS);
                }}
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
                      onViewRuns={() => onViewRuns(automation.guid)}
                      onEdit={() => onEdit(automation.guid)}
                      onDelete={() => setDeleteTarget(automation)}
                      onToggleEnabled={(enabled) => void onToggleEnabled(automation, enabled)}
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
            <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {deleteTarget?.display_name
                ? t("deleteDialog.descriptionNamed", { name: deleteTarget.display_name })
                : t("deleteDialog.descriptionFallback")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
              {t("deleteDialog.cancel")}
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
              {t("deleteDialog.confirm")}
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
  onViewRuns,
  onEdit,
  onDelete,
  onToggleEnabled,
}: {
  automation: AutomationSummary;
  agent: AutomationAgentCapability | null;
  projects: Project[];
  busyAction: string | null;
  index: number;
  onRun: () => void;
  onViewRuns: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
}) {
  const t = useTranslations("automation.listPanel");
  const status = statusMeta(automation.last_status);
  const scheduleLabel = formatScheduleLabel(automation);
  const targetLabel = formatTarget(automation, projects);
  const enabled = isAutomationEnabled(automation);
  const canToggleEnabled = supportsAutomationEnabledToggle(automation);
  const runBusy = busyAction === `run:${automation.guid}`;
  const toggleBusy =
    busyAction === `toggle:${automation.guid}` ||
    busyAction === `pause:${automation.guid}` ||
    busyAction === `resume:${automation.guid}`;
  const deleteBusy = busyAction === `delete:${automation.guid}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.018, 0.16) }}
      className="group relative flex w-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border bg-background p-4 text-left hover:border-primary/30 hover:bg-muted/35 hover:shadow-md lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <Timer className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
              {automation.display_name}
            </h3>
            {isAutomationPaused(automation) ? <Badge variant="outline">{t("row.paused")}</Badge> : null}
            {status ? <StatusBadge status={status.status} /> : <Badge variant="secondary">{t("row.neverRun")}</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              <Folder className="size-3.5 shrink-0" />
              <span className="truncate">{targetLabel}</span>
            </span>
            <span className="text-border">/</span>
            <AutomationAgentLabel
              agent={agent}
              agentId={automation.agent_id}
              agentConfigJson={automation.agent_config_json}
            />
            <span className="text-border">/</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {t("row.runs", { count: automation.run_count })}
            </span>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground/80">
            <span className="inline-flex min-w-0 items-center gap-1">
              <CalendarClock className="size-3.5 shrink-0" />
              <span className="truncate">{scheduleLabel}</span>
            </span>
            {automation.next_run_at ? (
              <>
                <span className="text-border">/</span>
                <span className="tabular-nums">
                  {t("row.nextRun", { dateTime: formatDateTime(automation.next_run_at) })}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 pl-14 lg:pl-4">
        {canToggleEnabled ? (
          <Switch
            checked={enabled}
            disabled={toggleBusy}
            aria-label={t("row.toggleAria", {
              action: enabled ? t("row.disableAction") : t("row.enableAction"),
              name: automation.display_name,
            })}
            onCheckedChange={(checked) => onToggleEnabled(Boolean(checked))}
          />
        ) : null}
        <Button size="sm" disabled={runBusy} onClick={onRun}>
          {runBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
          {t("row.runNow")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          data-testid="automation-row-view-runs"
          onClick={onViewRuns}
        >
          <History className="size-4" />
          {t("row.viewRuns")}
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9" aria-label={t("row.actionsAria")}>
              {deleteBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Ellipsis className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
              <Pencil className="size-4" />
              {t("row.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              disabled={deleteBusy}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              {t("row.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}

function EmptyAutomationList({
  hasQuery,
  hasFilters,
  hasAutomations,
  createDisabled,
  onClear,
  onCreate,
}: {
  hasQuery: boolean;
  hasFilters: boolean;
  hasAutomations: boolean;
  createDisabled: boolean;
  onClear: () => void;
  onCreate: () => void;
}) {
  const t = useTranslations("automation.listPanel");
  const showFilteredEmpty = hasAutomations && (hasQuery || hasFilters);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-6 py-16 text-center"
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
        {showFilteredEmpty ? <Search className="size-8" /> : <Timer className="size-8" />}
      </div>
      <h3 className="text-lg font-semibold text-foreground">
        {showFilteredEmpty ? t("empty.queryTitle") : t("empty.defaultTitle")}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {showFilteredEmpty ? t("empty.queryDescription") : t("empty.defaultDescription")}
      </p>
      <div className="mt-5 flex items-center gap-2">
        {showFilteredEmpty ? (
          <Button variant="outline" onClick={onClear}>
            {hasFilters ? t("empty.clearFilters") : t("empty.clearSearch")}
          </Button>
        ) : null}
        {!hasAutomations ? (
          <Button disabled={createDisabled} onClick={onCreate}>
            <Timer className="size-4" />
            {t("empty.newAutomation")}
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}



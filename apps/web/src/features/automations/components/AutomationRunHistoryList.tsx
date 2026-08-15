"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@workspace/ui";
import {
  CalendarClock,
  Clock3,
  Folder,
  History,
  Search,
  Timer,
} from "lucide-react";

import {
  AutomationAgentLabel,
  StatusBadge,
} from "@/features/automations/components/automation-common";
import {
  formatAutomationAgentConfigSuffix,
  formatDateTime,
  formatTargetKind,
  parseGithubRunSource,
} from "@/features/automations/lib/automation-format";
import {
  compareRunsByStartedAtDesc,
  getActiveAutomationRunFilterCount,
  matchesAutomationRunFilters,
  type AutomationRunListFilters,
} from "@/features/automations/lib/automation-run-filters";
import type {
  AutomationAgentCapability,
  AutomationRunSummary,
  AutomationSummary,
} from "@/features/automations/types";

export function AutomationRunHistoryList({
  runs,
  automations,
  agents,
  loading,
  searchQuery,
  filters,
  selectedRunGuid,
  onSelectRun,
  onClear,
}: {
  runs: AutomationRunSummary[];
  automations: AutomationSummary[];
  agents: AutomationAgentCapability[];
  loading: boolean;
  searchQuery: string;
  filters: AutomationRunListFilters;
  selectedRunGuid: string | null;
  onSelectRun: (guid: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations("automation.runHistoryList");
  const automationById = React.useMemo(
    () => new Map(automations.map((item) => [item.guid, item])),
    [automations],
  );
  const agentById = React.useMemo(
    () => new Map(agents.map((agent) => [agent.agent_id, agent])),
    [agents],
  );
  const hasActiveFilters = getActiveAutomationRunFilterCount(filters) > 0;

  const filteredRuns = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return runs
      .filter((run) => {
        const automation = automationById.get(run.automation_guid);
        if (!matchesAutomationRunFilters(run, automation, filters)) {
          return false;
        }
        if (!query) {
          return true;
        }
        const githubSource = parseGithubRunSource(run);
        const agent = run.agent_id ? agentById.get(run.agent_id) : null;
        const haystack = [
          automation?.display_name,
          run.guid,
          run.agent_id,
          run.agent_label,
          agent?.label,
          formatAutomationAgentConfigSuffix(run.agent_config_json ?? automation?.agent_config_json),
          run.trigger_kind,
          githubSource?.repository,
          githubSource?.event,
          formatTargetKind(run.target_kind),
          run.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice()
      .sort(compareRunsByStartedAtDesc);
  }, [agentById, automationById, filters, runs, searchQuery]);

  if (loading && runs.length === 0) {
    return (
      <div className="grid gap-2.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="h-[104px] animate-pulse rounded-xl border border-border bg-background"
          />
        ))}
      </div>
    );
  }

  if (filteredRuns.length === 0) {
    const hasNarrowing = Boolean(searchQuery.trim()) || hasActiveFilters;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-6 py-16 text-center"
      >
        <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
          {hasNarrowing ? <Search className="size-8" /> : <History className="size-8" />}
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          {hasNarrowing ? t("empty.queryTitle") : t("empty.defaultTitle")}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {hasNarrowing ? t("empty.queryDescription") : t("empty.defaultDescription")}
        </p>
        {hasNarrowing ? (
          <Button variant="outline" className="mt-5" onClick={onClear}>
            {hasActiveFilters ? t("empty.clearFilters") : t("empty.clearSearch")}
          </Button>
        ) : null}
      </motion.div>
    );
  }

  return (
    <div className="grid gap-2.5">
      <AnimatePresence mode="popLayout" initial={false}>
        {filteredRuns.map((run, index) => (
          <AutomationRunHistoryRow
            key={run.guid}
            run={run}
            automation={automationById.get(run.automation_guid) ?? null}
            agent={
              run.agent_id
                ? (agentById.get(run.agent_id) ?? null)
                : null
            }
            selected={run.guid === selectedRunGuid}
            index={index}
            onSelect={() => onSelectRun(run.guid)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function AutomationRunHistoryRow({
  run,
  automation,
  agent,
  selected,
  index,
  onSelect,
}: {
  run: AutomationRunSummary;
  automation: AutomationSummary | null;
  agent: AutomationAgentCapability | null;
  selected: boolean;
  index: number;
  onSelect: () => void;
}) {
  const t = useTranslations("automation.runHistoryList");
  const githubSource = parseGithubRunSource(run);
  const triggerLabel = githubSource
    ? [githubSource.repository, githubSource.event].filter(Boolean).join(" / ")
    : run.trigger_kind === "scheduled"
      ? t("trigger.scheduled")
      : run.trigger_kind === "github"
        ? t("trigger.github")
        : t("trigger.manual");

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.018, 0.16) }}
      onClick={onSelect}
      className={
        selected
          ? "group relative flex w-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-primary/40 bg-primary/5 p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/10 hover:shadow-md lg:flex-row lg:items-center lg:justify-between"
          : "group relative flex w-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/35 hover:shadow-md lg:flex-row lg:items-center lg:justify-between"
      }
    >
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <History className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
              {automation?.display_name ?? t("unknownAutomation")}
            </h3>
            <StatusBadge status={run.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              <Folder className="size-3.5 shrink-0" />
              <span className="truncate">{formatTargetKind(run.target_kind)}</span>
            </span>
            <span className="text-border">/</span>
            <AutomationAgentLabel
              agent={agent}
              agentId={run.agent_id ?? automation?.agent_id ?? ""}
              agentConfigJson={run.agent_config_json ?? automation?.agent_config_json}
            />
            <span className="text-border">/</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {triggerLabel}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground/80">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              {formatDateTime(run.started_at)}
            </span>
            {run.completed_at ? (
              <>
                <span className="text-border">/</span>
                <span className="tabular-nums">
                  {t("completed", { dateTime: formatDateTime(run.completed_at) })}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end pl-14 text-xs text-muted-foreground lg:pl-4">
        <Timer className="mr-1.5 size-3.5" />
        {t("openDetails")}
      </div>
    </motion.button>
  );
}

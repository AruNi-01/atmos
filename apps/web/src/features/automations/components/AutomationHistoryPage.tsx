"use client";

import {
  Badge,
  Button,
} from "@workspace/ui";
import {
  ArrowLeft,
  LoaderCircle,
  Play,
  Timer,
  TimerReset,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";

import { RunDetailPanel } from "@/features/automations/components/RunDetailPanel";
import { RunHistoryPanel } from "@/features/automations/components/RunHistoryPanel";
import {
  AutomationAgentLabel,
  StatusBadge,
} from "@/features/automations/components/automation-common";
import {
  formatDateTime,
  formatScheduleLabel,
  formatTarget,
} from "@/features/automations/lib/automation-format";
import type {
  AutomationAgentCapability,
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationDetail,
  AutomationRunSummary,
  AutomationSummary,
} from "@/features/automations/types";
import type { Project } from "@/shared/types/domain";

const AgentChatPanel = dynamic(
  () => import("@/features/agent/components/AgentChatPanel").then((module) => module.AgentChatPanel),
  { ssr: false },
);

export function AutomationHistoryPage({
  automation,
  detail,
  detailLoading,
  runs,
  runsLoading,
  selectedRun,
  selectedRunGuid,
  artifact,
  artifactLoading,
  busyAction,
  projects,
  agents,
  standaloneChatOpen,
  onBack,
  onCloseStandaloneChat,
  onRefreshRuns,
  onRunAction,
  onSelectRun,
  onCancelRun,
  onFetchArtifact,
  onContinueInTerminal,
}: {
  automation: AutomationSummary | null;
  detail: AutomationDetail | null;
  detailLoading: boolean;
  runs: AutomationRunSummary[];
  runsLoading: boolean;
  selectedRun: AutomationRunSummary | null;
  selectedRunGuid: string | null;
  artifact: AutomationArtifactResponse | null;
  artifactLoading: boolean;
  busyAction: string | null;
  projects: Project[];
  agents: AutomationAgentCapability[];
  standaloneChatOpen: boolean;
  onBack: () => void;
  onCloseStandaloneChat: () => void;
  onRefreshRuns: () => void;
  onRunAction: (action: "run" | "pause" | "resume" | "delete", automation: AutomationSummary) => Promise<void>;
  onSelectRun: (guid: string) => void;
  onCancelRun: (run: AutomationRunSummary) => Promise<void>;
  onFetchArtifact: (run: AutomationRunSummary, kind: AutomationArtifactKind) => Promise<void>;
  onContinueInTerminal: (run: AutomationRunSummary) => Promise<void>;
}) {
  const visibleAutomation = detail ?? automation;
  const agent = visibleAutomation
    ? (agents.find((item) => item.agent_id === visibleAutomation.agent_id) ?? null)
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-background px-6 py-4">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Button variant="ghost" size="icon" className="mt-0.5 size-9 shrink-0" onClick={onBack} aria-label="Back">
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
                  {visibleAutomation?.display_name ?? "Automation history"}
                </h2>
                {visibleAutomation?.schedule_paused ? <Badge variant="outline">Paused</Badge> : null}
                {visibleAutomation?.last_status ? <StatusBadge status={visibleAutomation.last_status} /> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {visibleAutomation ? (
                  <>
                    <AutomationAgentLabel agent={agent} agentId={visibleAutomation.agent_id} />
                    <span className="text-border">/</span>
                    <span>{formatTarget(visibleAutomation, projects)}</span>
                    <span className="text-border">/</span>
                    <span>{formatScheduleLabel(visibleAutomation)}</span>
                    {visibleAutomation.next_run_at ? (
                      <>
                        <span className="text-border">/</span>
                        <span>next {formatDateTime(visibleAutomation.next_run_at)}</span>
                      </>
                    ) : null}
                  </>
                ) : detailLoading ? (
                  <span>Loading automation...</span>
                ) : (
                  <span>Automation not found</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pl-[3.25rem] lg:pl-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshRuns}
              disabled={runsLoading || !visibleAutomation}
            >
              {runsLoading ? <LoaderCircle className="size-4 animate-spin" /> : <TimerReset className="size-4" />}
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => visibleAutomation && void onRunAction("run", visibleAutomation)}
              disabled={!visibleAutomation || busyAction === `run:${visibleAutomation.guid}`}
            >
              {visibleAutomation && busyAction === `run:${visibleAutomation.guid}` ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Run Now
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-6 py-6">
        <div className={standaloneChatOpen
          ? "mx-auto grid h-full w-full max-w-[1600px] grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)_420px]"
          : "mx-auto grid h-full w-full max-w-7xl grid-cols-1 gap-5 xl:grid-cols-[390px_minmax(0,1fr)]"
        }>
          <RunHistoryPanel
            runs={runs}
            loading={runsLoading}
            selectedRunGuid={selectedRunGuid}
            busyAction={busyAction}
            onRefresh={onRefreshRuns}
            onSelectRun={onSelectRun}
            onCancelRun={onCancelRun}
          />
          <div className="min-h-0 overflow-hidden rounded-md border border-border bg-background">
            {visibleAutomation ? (
              <RunDetailPanel
                run={selectedRun}
                artifact={artifact}
                artifactLoading={artifactLoading}
                busyAction={busyAction}
                onCancelRun={onCancelRun}
                onFetchArtifact={onFetchArtifact}
                onContinueInTerminal={onContinueInTerminal}
              />
            ) : (
              <div className="flex h-full min-h-0 items-center justify-center text-center">
                <div>
                  <Timer className="mx-auto size-8 text-muted-foreground" />
                  <div className="mt-3 text-sm font-medium text-foreground">Automation unavailable</div>
                  <div className="mt-1 text-xs text-muted-foreground">Return to the list and choose another item.</div>
                </div>
              </div>
            )}
          </div>
          {standaloneChatOpen ? (
            <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-background xl:min-h-0">
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">Standalone Conversation</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Continue this automation without a project terminal.</div>
                </div>
                <Button variant="ghost" size="icon" className="size-8" onClick={onCloseStandaloneChat} aria-label="Close conversation">
                  <X className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <AgentChatPanel variant="sidebar" publishStatus={false} active={standaloneChatOpen} />
              </div>
            </section>
          ) : null}
        </div>
      </div>

    </div>
  );
}

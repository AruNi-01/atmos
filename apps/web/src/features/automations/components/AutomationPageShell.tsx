"use client";

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { LoaderCircle, RefreshCw, Workflow } from "lucide-react";

import { AutomationDetailPanel } from "@/features/automations/components/AutomationDetailPanel";
import { AutomationListPanel } from "@/features/automations/components/AutomationListPanel";
import type {
  AutomationAgentCapability,
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationDetail,
  AutomationRunSummary,
  AutomationSummary,
} from "@/features/automations/types";
import type { Project } from "@/shared/types/domain";

export function AutomationPageShell({
  automations,
  agents,
  loading,
  error,
  selectedAutomationGuid,
  selectedAutomation,
  selectedDetail,
  detailLoading,
  runs,
  runsLoading,
  selectedRun,
  selectedRunGuid,
  artifact,
  artifactLoading,
  busyAction,
  projects,
  onReload,
  onCreate,
  onEdit,
  onSelectAutomation,
  onRefreshRuns,
  onRunAction,
  onSelectRun,
  onCancelRun,
  onFetchArtifact,
}: {
  automations: AutomationSummary[];
  agents: AutomationAgentCapability[];
  loading: boolean;
  error: string | null;
  selectedAutomationGuid: string | null;
  selectedAutomation: AutomationSummary | null;
  selectedDetail: AutomationDetail | null;
  detailLoading: boolean;
  runs: AutomationRunSummary[];
  runsLoading: boolean;
  selectedRun: AutomationRunSummary | null;
  selectedRunGuid: string | null;
  artifact: AutomationArtifactResponse | null;
  artifactLoading: boolean;
  busyAction: string | null;
  projects: Project[];
  onReload: () => void;
  onCreate: () => void;
  onEdit: () => void;
  onSelectAutomation: (guid: string) => void;
  onRefreshRuns: () => void;
  onRunAction: (action: "run" | "pause" | "resume" | "delete", automation: AutomationSummary) => Promise<void>;
  onSelectRun: (guid: string) => void;
  onCancelRun: (run: AutomationRunSummary) => Promise<void>;
  onFetchArtifact: (run: AutomationRunSummary, kind: AutomationArtifactKind) => Promise<void>;
}) {
  const supportedAgentCount = agents.filter((agent) => agent.automation_supported).length;
  const newAutomationDisabled = loading || supportedAgentCount === 0;
  const newAutomationReason = loading
    ? "Loading automation capabilities"
    : supportedAgentCount === 0
      ? "Install a supported non-interactive terminal agent first"
      : "Create automation";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <div className="border-b border-border bg-background px-6 py-4">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-foreground">
                <Workflow className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">Automations</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{automations.length} definitions</span>
                  <span className="text-border">/</span>
                  <span>{supportedAgentCount} supported agents</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onReload}
                    disabled={loading}
                    aria-label="Refresh automations"
                    title="Refresh automations"
                  >
                    {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button disabled={newAutomationDisabled} onClick={onCreate}>
                      <Workflow className="size-4" />
                      New Automation
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{newAutomationReason}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-6 py-5">
          <div className="mx-auto grid h-full w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <AutomationListPanel
              automations={automations}
              agents={agents}
              loading={loading}
              error={error}
              selectedAutomationGuid={selectedAutomationGuid}
              supportedAgentCount={supportedAgentCount}
              onSelect={onSelectAutomation}
              onCreate={onCreate}
              createDisabled={newAutomationDisabled}
            />
            <AutomationDetailPanel
              automation={selectedAutomation}
              detail={selectedDetail}
              detailLoading={detailLoading}
              runs={runs}
              runsLoading={runsLoading}
              selectedRun={selectedRun}
              selectedRunGuid={selectedRunGuid}
              artifact={artifact}
              artifactLoading={artifactLoading}
              busyAction={busyAction}
              projects={projects}
              agents={agents}
              onEdit={onEdit}
              onRefreshRuns={onRefreshRuns}
              onRunAction={onRunAction}
              onSelectRun={onSelectRun}
              onCancelRun={onCancelRun}
              onFetchArtifact={onFetchArtifact}
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextShimmer,
  cn,
} from "@workspace/ui";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { WorkspaceSetupProgressView } from "@/features/workspace/components/WorkspaceSetupProgress";
import {
  useWorkspaceCreationStore,
  type WorkspaceCreateJob,
} from "@/features/workspace/store/workspace-creation-store";
import {
  getWorkspaceSetupPopoverWidth,
  getWorkspaceSetupProgressValue,
  getWorkspaceSetupSteps,
  isWorkspaceSetupBlocking,
} from "@/features/workspace/lib/workspace-setup";
import type { WorkspaceSetupProgress } from "@/features/project/store/use-project-store";
import { WorkspaceStatusPopover } from "./WorkspaceStatusPopover";
import { useWorkspaceCreateAutoOpen } from "./use-workspace-create-auto-open";

function jobTitle(
  job: WorkspaceCreateJob,
  workspaceName: string | null,
  creatingFallback: string,
): string {
  return job.label || workspaceName || creatingFallback;
}

function jobProgress(
  job: WorkspaceCreateJob,
  setupProgress: Record<string, WorkspaceSetupProgress>,
): WorkspaceSetupProgress | null {
  return job.workspaceId ? setupProgress[job.workspaceId] ?? null : null;
}

export function HeaderWorkspaceJobs() {
  useWorkspaceCreateAutoOpen();
  const t = useTranslations("header.workspaceJobs");
  const router = useAppRouter();
  const { workspaceId: currentWorkspaceId } = useContextParams();
  const projects = useProjects();
  const jobs = useWorkspaceCreationStore((state) => state.jobs);
  const latestJobId = useWorkspaceCreationStore((state) => state.latestJobId);
  const markOpened = useWorkspaceCreationStore((state) => state.markOpened);
  const setupProgress = useProjectStore((state) => state.setupProgress);
  const clearSetupProgress = useProjectStore((state) => state.clearSetupProgress);
  const [open, setOpen] = React.useState(false);
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === "undefined" ? 1200 : window.innerWidth,
  );

  React.useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  const currentWorkspace = projects
    .flatMap((project) => project.workspaces)
    .find((workspace) => workspace.id === currentWorkspaceId);
  const currentSetupProgress = currentWorkspaceId ? setupProgress[currentWorkspaceId] ?? null : null;

  const backgroundJobs = jobs.filter((job) => job.workspaceId !== currentWorkspaceId);
  const latestBackgroundJob = backgroundJobs[backgroundJobs.length - 1] ?? null;

  const workspaceNameById = React.useMemo(() => {
    const names = new Map<string, string>();
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        names.set(workspace.id, workspace.displayName || workspace.name);
      }
    }
    return names;
  }, [projects]);

  const titleFor = React.useCallback(
    (job: WorkspaceCreateJob) =>
      jobTitle(
        job,
        job.workspaceId ? workspaceNameById.get(job.workspaceId) ?? null : null,
        t("creating"),
      ),
    [t, workspaceNameById],
  );

  const openWorkspace = (workspaceId: string) => {
    markOpened(workspaceId);
    setOpen(false);
    if (workspaceId !== currentWorkspaceId) {
      router.push(`/workspace?id=${workspaceId}`);
    }
  };

  const selectedJob = backgroundJobs.find((job) => job.id === selectedJobId) ?? null;
  const detailJob = selectedJob ?? (backgroundJobs.length === 1 ? backgroundJobs[0] : null);
  const showList = backgroundJobs.length > 1;
  const selectedProgress = detailJob ? jobProgress(detailJob, setupProgress) : null;
  const selectedEnterable =
    !!detailJob?.workspaceId && !isWorkspaceSetupBlocking(selectedProgress ?? undefined);
  const selectedIsLatest = detailJob?.id === latestJobId;
  const detailWidth = selectedProgress
    ? getWorkspaceSetupPopoverWidth(getWorkspaceSetupSteps(selectedProgress).length, viewportWidth)
    : 360;

  const latestTitle = latestBackgroundJob ? titleFor(latestBackgroundJob) : t("creating");

  return (
    <div className="desktop-no-drag flex min-w-0 items-center gap-1">
      {currentWorkspace && currentSetupProgress ? (
        <WorkspaceStatusPopover
          progress={currentSetupProgress}
          onFinish={() => clearSetupProgress(currentWorkspace.id)}
        />
      ) : null}

      {latestBackgroundJob ? (
        <Popover
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) setSelectedJobId(null);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className="grid h-7 max-w-[280px] grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-transparent bg-muted/40 px-2 text-left hover:border-border hover:bg-muted/60"
              aria-label={
                backgroundJobs.length > 1
                  ? t("countAria", { count: backgroundJobs.length })
                  : latestTitle
              }
            >
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <TextShimmer
                as="span"
                duration={1.6}
                className="block min-w-0 truncate text-[12px] font-medium"
              >
                {latestTitle}
              </TextShimmer>
              {backgroundJobs.length > 1 ? (
                <span className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                  {backgroundJobs.length}
                </span>
              ) : (
                <span aria-hidden="true" className="w-0" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-auto max-w-[calc(100vw-24px)] overflow-visible border-0 bg-transparent p-0 shadow-none"
          >
            <div className="flex items-start gap-1">
              {showList ? (
                <div className="flex w-[280px] shrink-0 flex-col rounded-md border border-border/70 bg-popover/96 shadow-md">
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                    {t("listTitle", { count: backgroundJobs.length })}
                  </div>
                  <div className="flex flex-col gap-1 p-2 pt-0">
                    {backgroundJobs.map((job) => {
                      const progress = jobProgress(job, setupProgress);
                      const percent = progress ? Math.round(getWorkspaceSetupProgressValue(progress)) : null;
                      const stepLabel = progress?.stepTitle ?? (job.workspaceId ? t("preparing") : t("creating"));
                      const isLatest = job.id === latestJobId;
                      const isSelected = job.id === detailJob?.id;
                      return (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() =>
                            setSelectedJobId((current) => (current === job.id ? null : job.id))
                          }
                          className={cn(
                            "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left",
                            isSelected ? "bg-muted" : "hover:bg-muted/70",
                          )}
                        >
                          <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium">{titleFor(job)}</span>
                              {percent != null ? (
                                <span className="tabular-nums text-[11px] text-muted-foreground">
                                  {percent}%
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {stepLabel}
                              {isLatest ? ` · ${t("autoOpen")}` : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {detailJob ? (
                <div
                  style={{ width: Math.min(detailWidth, Math.max(280, viewportWidth - (showList ? 308 : 24))) }}
                  className="min-w-0 max-h-[min(72vh,var(--radix-popover-content-available-height))] overflow-y-auto rounded-md border border-border/70 bg-popover/96 shadow-md"
                >
                  {showList ? (
                    <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {titleFor(detailJob)}
                      </span>
                      {selectedEnterable && detailJob.workspaceId ? (
                        <Button
                          type="button"
                          size="xs"
                          onClick={() => openWorkspace(detailJob.workspaceId!)}
                        >
                          {t("open")}
                        </Button>
                      ) : selectedIsLatest ? (
                        <span className="pr-1 text-[11px] text-muted-foreground">{t("autoOpen")}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedProgress ? (
                    <WorkspaceSetupProgressView
                      progress={selectedProgress}
                      onFinish={() => {
                        if (detailJob.workspaceId) {
                          clearSetupProgress(detailJob.workspaceId);
                        }
                      }}
                      compact
                      pauseAutoFinishEnabled={open}
                    />
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-5">
                      <Loader2 className="mt-0.5 size-4 animate-spin text-primary" />
                      <div>
                        <p className="text-sm font-medium">{titleFor(detailJob)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{t("creatingHint")}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

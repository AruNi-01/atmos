"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  getWorkspaceCreateOriginKey,
  useWorkspaceCreationStore,
} from "@/features/workspace/store/workspace-creation-store";
import { WorkspaceSetupProgressView } from "@/features/workspace/components/WorkspaceSetupProgress";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
import { useSidebarLayout } from "@/app-shell/SidebarLayoutContext";
import {
  APP_FOOTER_HEIGHT_PX,
  CENTER_STAGE_GUTTER_X_PX,
  CENTER_STAGE_GUTTER_Y_PX,
  CENTER_STAGE_RADIUS_CLASS,
  DEFAULT_LEFT_SIDEBAR_SIZE,
} from "@/app-shell/sidebar-layout-constants";
import { cn } from "@/shared/lib/utils";

export function WorkspaceSetupBlockingOverlay() {
  const t = useTranslations("header.workspaceJobs");
  const { currentView, workspaceId: currentWorkspaceId, projectId } = useContextParams();
  const currentOriginKey = getWorkspaceCreateOriginKey({
    currentView,
    workspaceId: currentWorkspaceId,
    projectId,
  });
  const jobs = useWorkspaceCreationStore((state) => state.jobs);
  const latestJobId = useWorkspaceCreationStore((state) => state.latestJobId);
  const blockingJob = useMemo(() => {
    const latest = jobs.find((job) => job.id === latestJobId);
    if (latest?.blocking) return latest;
    return [...jobs].reverse().find((job) => job.blocking) ?? null;
  }, [jobs, latestJobId]);
  const progress = useProjectStore((state) =>
    blockingJob?.workspaceId ? state.setupProgress[blockingJob.workspaceId] ?? null : null,
  );
  const { isLeftCollapsed, liveLeftSidebarSize, isLeftSidebarDragging } = useSidebarLayout();
  const overlayLeftSize =
    !isLeftCollapsed && liveLeftSidebarSize > 0.5
      ? liveLeftSidebarSize
      : DEFAULT_LEFT_SIDEBAR_SIZE;

  const show =
    !!blockingJob &&
    blockingJob.originKey === currentOriginKey &&
    blockingJob.workspaceId !== currentWorkspaceId &&
    (blockingJob.workspaceId == null || isWorkspaceSetupBlocking(progress));

  if (!show) {
    return null;
  }

  const gutterX = CENTER_STAGE_GUTTER_X_PX;
  const gutterY = CENTER_STAGE_GUTTER_Y_PX;
  const leftInset = isLeftCollapsed
    ? gutterX
    : `calc(${overlayLeftSize}% + 1px + ${gutterX}px)`;
  const transitionProperty = isLeftSidebarDragging ? "translate" : "left, translate";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t("creating")}
      data-workspace-setup-blocking-overlay=""
      className={cn(
        "absolute z-[48] overflow-hidden bg-background",
        CENTER_STAGE_RADIUS_CLASS,
        "ring-1 ring-border/40 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]",
      )}
      style={{
        top: gutterY,
        right: gutterX,
        bottom: APP_FOOTER_HEIGHT_PX + gutterY,
        left: leftInset,
        transitionProperty,
        transitionDuration: "400ms",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {progress ? (
        <WorkspaceSetupProgressView progress={progress} onFinish={() => undefined} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <Loader2 className="size-5 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium">{blockingJob.label || t("creating")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("creatingHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

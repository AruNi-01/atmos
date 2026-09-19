"use client";

import { useMemo } from "react";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  getWorkspaceCreateOriginKey,
  selectAutoOpenJob,
  selectAutoOpenWorkspaceId,
  useWorkspaceCreationStore,
} from "@/features/workspace/store/workspace-creation-store";
import { isWorkspaceSetupBlocking, setupProgressUiEqual } from "@/features/workspace/lib/workspace-setup";
import { WORKSPACE_AUTO_ENTER_DELAY_MS } from "./header-workspace-jobs";
import { usePausedDeadlineCountdown } from "./use-paused-deadline-countdown";

export function useWorkspaceCreateAutoOpen(input: {
  paused: boolean;
  onAutoEnter: (workspaceId: string) => void;
}): { workspaceId: string | null; remainingSeconds: number } {
  const { currentView, workspaceId, projectId } = useContextParams();
  const jobs = useWorkspaceCreationStore((state) => state.jobs);
  const latestJobId = useWorkspaceCreationStore((state) => state.latestJobId);
  const autoOpenedWorkspaceId = useWorkspaceCreationStore((state) => state.autoOpenedWorkspaceId);
  const setupProgress = useProjectStore((state) => state.setupProgress, setupProgressUiEqual);
  const latestJob = selectAutoOpenJob({ jobs, latestJobId });
  const enterImmediately = latestJob?.blocking === true;
  const currentOriginKey = getWorkspaceCreateOriginKey({
    currentView,
    workspaceId,
    projectId,
  });
  const candidateId = useMemo(
    () =>
      selectAutoOpenWorkspaceId({
        jobs,
        latestJobId,
        autoOpenedWorkspaceId,
        currentOriginKey,
        currentWorkspaceId: workspaceId,
        isEnterable: (id) => !isWorkspaceSetupBlocking(setupProgress[id]),
      }),
    [
      autoOpenedWorkspaceId,
      currentOriginKey,
      jobs,
      latestJobId,
      setupProgress,
      workspaceId,
    ],
  );

  const countdown = usePausedDeadlineCountdown({
    sessionKey: candidateId,
    durationMs: enterImmediately ? 0 : WORKSPACE_AUTO_ENTER_DELAY_MS,
    paused: Boolean(candidateId && input.paused && !enterImmediately),
    onComplete: () => {
      if (candidateId) input.onAutoEnter(candidateId);
    },
  });

  return {
    workspaceId: candidateId,
    remainingSeconds: candidateId ? countdown.remainingSeconds : 0,
  };
}

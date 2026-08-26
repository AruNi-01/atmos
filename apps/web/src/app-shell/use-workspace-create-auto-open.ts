"use client";

import { useMemo } from "react";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  getWorkspaceCreateOriginKey,
  selectAutoOpenWorkspaceId,
  useWorkspaceCreationStore,
} from "@/features/workspace/store/workspace-creation-store";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";
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
  const setupProgress = useProjectStore((state) => state.setupProgress);
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
    durationMs: WORKSPACE_AUTO_ENTER_DELAY_MS,
    paused: Boolean(candidateId && input.paused),
    onComplete: () => {
      if (candidateId) input.onAutoEnter(candidateId);
    },
  });

  return {
    workspaceId: candidateId,
    remainingSeconds: candidateId ? countdown.remainingSeconds : 0,
  };
}

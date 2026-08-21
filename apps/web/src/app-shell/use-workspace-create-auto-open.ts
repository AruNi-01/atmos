"use client";

import { useEffect } from "react";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  getWorkspaceCreateOriginKey,
  selectAutoOpenWorkspaceId,
  useWorkspaceCreationStore,
} from "@/features/workspace/store/workspace-creation-store";
import { isWorkspaceSetupBlocking } from "@/features/workspace/lib/workspace-setup";

export function useWorkspaceCreateAutoOpen() {
  const router = useAppRouter();
  const { currentView, workspaceId, projectId } = useContextParams();
  const jobs = useWorkspaceCreationStore((state) => state.jobs);
  const latestJobId = useWorkspaceCreationStore((state) => state.latestJobId);
  const autoOpenedWorkspaceId = useWorkspaceCreationStore((state) => state.autoOpenedWorkspaceId);
  const markOpened = useWorkspaceCreationStore((state) => state.markOpened);
  const setupProgress = useProjectStore((state) => state.setupProgress);
  const currentOriginKey = getWorkspaceCreateOriginKey({
    currentView,
    workspaceId,
    projectId,
  });

  useEffect(() => {
    const nextWorkspaceId = selectAutoOpenWorkspaceId({
      jobs,
      latestJobId,
      autoOpenedWorkspaceId,
      currentOriginKey,
      currentWorkspaceId: workspaceId,
      isEnterable: (id) => !isWorkspaceSetupBlocking(setupProgress[id]),
    });
    if (!nextWorkspaceId) return;

    markOpened(nextWorkspaceId);
    router.push(`/workspace?id=${nextWorkspaceId}`);
  }, [
    autoOpenedWorkspaceId,
    currentOriginKey,
    jobs,
    latestJobId,
    markOpened,
    router,
    setupProgress,
    workspaceId,
  ]);
}

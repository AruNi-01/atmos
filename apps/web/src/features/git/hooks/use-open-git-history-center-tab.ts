"use client";

import React from "react";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import { GIT_HISTORY_TAB_VALUE } from "@/features/git/types";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";

export function useOpenGitHistoryCenterTab() {
  const paintContextId = useCenterPaintContextId();
  const selectCommit = useGitHistoryCenterTabStore((state) => state.selectCommit);

  const openGitHistoryTab = React.useCallback(
    (commitHash?: string | null) => {
      if (!paintContextId) return;
      if (commitHash) selectCommit(paintContextId, commitHash);
      activateCenterChromeTab(paintContextId, GIT_HISTORY_TAB_VALUE);
    },
    [paintContextId, selectCommit],
  );

  return { openGitHistoryTab };
}

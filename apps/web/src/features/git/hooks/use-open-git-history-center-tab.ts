"use client";

import React from "react";
import { useQueryStates } from "nuqs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import { GIT_HISTORY_TAB_VALUE } from "@/features/git/types";
import { attachCenterTab } from "@/app-shell/center-space/center-open-context";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";

export function useOpenGitHistoryCenterTab() {
  const paintContextId = useCenterPaintContextId();
  const [, setCenterStageParams] = useQueryStates(centerStageParams);
  const setActiveFile = useEditorStore((state) => state.setActiveFile);
  const open = useGitHistoryCenterTabStore((state) => state.open);
  const selectCommit = useGitHistoryCenterTabStore((state) => state.selectCommit);

  const openGitHistoryTab = React.useCallback(
    (commitHash?: string | null) => {
      if (!paintContextId) return;
      open(paintContextId);
      if (commitHash) selectCommit(paintContextId, commitHash);
      setActiveFile(null, paintContextId);
      attachCenterTab(paintContextId, GIT_HISTORY_TAB_VALUE);
      void setCenterStageParams({ tab: GIT_HISTORY_TAB_VALUE, wikiPage: null });
    },
    [paintContextId, open, selectCommit, setActiveFile, setCenterStageParams],
  );

  return { openGitHistoryTab };
}

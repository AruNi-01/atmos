"use client";

import React from "react";
import { useQueryStates } from "nuqs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { useGitHistoryCenterTabStore } from "@/features/git/store/use-git-history-center-tab";
import { GIT_HISTORY_TAB_VALUE } from "@/features/git/types";

export function useOpenGitHistoryCenterTab() {
  const { effectiveContextId } = useContextParams();
  const [, setCenterStageParams] = useQueryStates(centerStageParams);
  const setActiveFile = useEditorStore((state) => state.setActiveFile);
  const open = useGitHistoryCenterTabStore((state) => state.open);
  const selectCommit = useGitHistoryCenterTabStore((state) => state.selectCommit);

  const openGitHistoryTab = React.useCallback(
    (commitHash?: string | null) => {
      if (!effectiveContextId) return;
      open(effectiveContextId);
      if (commitHash) selectCommit(effectiveContextId, commitHash);
      setActiveFile(null, effectiveContextId);
      void setCenterStageParams({ tab: GIT_HISTORY_TAB_VALUE, wikiPage: null });
    },
    [effectiveContextId, open, selectCommit, setActiveFile, setCenterStageParams],
  );

  return { openGitHistoryTab };
}

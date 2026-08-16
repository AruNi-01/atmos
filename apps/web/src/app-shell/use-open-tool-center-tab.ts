"use client";

import React from "react";
import { useQueryStates } from "nuqs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import {
  useToolCenterTabsStore,
  type CenterToolTabValue,
} from "@/app-shell/center-tool-tabs";

export function useOpenToolCenterTab() {
  const { effectiveContextId } = useContextParams();
  const [, setCenterStageParams] = useQueryStates(centerStageParams);
  const setActiveFile = useEditorStore((state) => state.setActiveFile);
  const open = useToolCenterTabsStore((state) => state.open);

  const openToolTab = React.useCallback(
    (tab: CenterToolTabValue) => {
      if (!effectiveContextId) return;
      open(effectiveContextId, tab);
      setActiveFile(null, effectiveContextId);
      void setCenterStageParams({ tab, wikiPage: null });
    },
    [effectiveContextId, open, setActiveFile, setCenterStageParams],
  );

  return { openToolTab };
}

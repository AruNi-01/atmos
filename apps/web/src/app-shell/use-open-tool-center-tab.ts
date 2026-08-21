"use client";

import React from "react";
import { useQueryStates } from "nuqs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import {
  useToolCenterTabsStore,
  type CenterToolTabValue,
} from "@/app-shell/center-tool-tabs";
import { attachCenterTab } from "@/app-shell/center-space/center-open-context";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";

export function useOpenToolCenterTab() {
  const paintContextId = useCenterPaintContextId();
  const [, setCenterStageParams] = useQueryStates(centerStageParams);
  const setActiveFile = useEditorStore((state) => state.setActiveFile);
  const open = useToolCenterTabsStore((state) => state.open);

  const openToolTab = React.useCallback(
    (tab: CenterToolTabValue) => {
      if (!paintContextId) return;
      open(paintContextId, tab);
      setActiveFile(null, paintContextId);
      attachCenterTab(paintContextId, tab);
      void setCenterStageParams({ tab, wikiPage: null });
    },
    [paintContextId, open, setActiveFile, setCenterStageParams],
  );

  return { openToolTab };
}

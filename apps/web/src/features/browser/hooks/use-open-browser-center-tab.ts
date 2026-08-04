"use client";

import React from "react";
import { useQueryStates } from "nuqs";

import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useBrowserCenterTabsStore } from "@/features/browser/store/use-browser-center-tabs";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";

export function useOpenBrowserCenterTab() {
  const { effectiveContextId } = useContextParams();
  const [, setCenterStageParams] = useQueryStates(centerStageParams);
  const openBrowser = useBrowserCenterTabsStore((state) => state.openBrowser);
  const setActiveFile = useEditorStore((state) => state.setActiveFile);

  const openBrowserCenterTab = React.useCallback(() => {
    if (!effectiveContextId) return null;

    const tab = openBrowser(effectiveContextId);
    setActiveFile(null, effectiveContextId);
    void setCenterStageParams({ tab: tab.value, wikiPage: null });
    return tab;
  }, [effectiveContextId, openBrowser, setActiveFile, setCenterStageParams]);

  return { openBrowserCenterTab };
}

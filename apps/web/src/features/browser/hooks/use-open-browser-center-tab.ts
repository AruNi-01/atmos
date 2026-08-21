"use client";

import React from "react";

import { useContextParams } from "@/shared/hooks/use-context-params";
import { ensureSurface } from "@/features/browser/lib/ensure-browser-surface";

/** Human “open Browser” follows Settings → Browser → Default surface. */
export function useOpenBrowserCenterTab() {
  const { effectiveContextId } = useContextParams();

  const openBrowserCenterTab = React.useCallback(() => {
    if (!effectiveContextId) return null;
    void ensureSurface({ contextId: effectiveContextId });
    return { contextId: effectiveContextId };
  }, [effectiveContextId]);

  return { openBrowserCenterTab };
}

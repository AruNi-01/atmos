"use client";

import React from "react";

import { ensureSurface } from "@/features/browser/lib/ensure-browser-surface";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";

/** Human “open Browser” follows Settings → Browser → Default surface. */
export function useOpenBrowserCenterTab() {
  const paintContextId = useCenterPaintContextId();

  const openBrowserCenterTab = React.useCallback(() => {
    if (!paintContextId) return null;
    void ensureSurface({ contextId: paintContextId });
    return { contextId: paintContextId };
  }, [paintContextId]);

  return { openBrowserCenterTab };
}

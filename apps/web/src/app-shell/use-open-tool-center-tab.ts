"use client";

import React from "react";
import { type CenterToolTabValue } from "@/app-shell/center-tool-tabs";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";

export function useOpenToolCenterTab() {
  const paintContextId = useCenterPaintContextId();

  const openToolTab = React.useCallback(
    (tab: CenterToolTabValue) => {
      if (!paintContextId) return;
      activateCenterChromeTab(paintContextId, tab);
    },
    [paintContextId],
  );

  return { openToolTab };
}

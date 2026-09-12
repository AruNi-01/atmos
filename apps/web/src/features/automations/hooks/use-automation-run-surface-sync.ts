"use client";

import * as React from "react";

import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { applyAutomationRunSurface } from "@/features/automations/lib/apply-automation-run-surface";
import type { AutomationRunUpdatedEvent } from "@/features/automations/types";

/**
 * Keep sidebar / Term / Chat data in sync when a run creates a surface.
 * Does not navigate — the current page stays put.
 */
export function useAutomationRunSurfaceSync() {
  React.useEffect(() => {
    const off = useWebSocketStore.getState().onEvent(
      "automation_run_updated",
      (event) => {
        const payload = event as AutomationRunUpdatedEvent;
        if (payload?.run) applyAutomationRunSurface(payload.run);
      },
    );
    return off;
  }, []);
}

"use client";

import * as React from "react";

import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type {
  AutomationDefinitionUpdatedEvent,
  AutomationDetail,
  AutomationRunOutputEvent,
  AutomationRunUpdatedEvent,
  AutomationSummary,
} from "@/features/automations/types";
import type { AutomationsView } from "@/shared/lib/nuqs/searchParams";

interface UseAutomationWebsocketSyncOptions {
  selectedAutomationGuid: string | null;
  setSelectedDetail: React.Dispatch<
    React.SetStateAction<AutomationDetail | null>
  >;
  setAutomationParam: (guid: string | null) => Promise<URLSearchParams>;
  setPageView: (view: AutomationsView | null) => Promise<URLSearchParams>;
  refreshAutomation: (automationGuid: string) => Promise<AutomationDetail>;
  removeAutomation: (automationGuid: string) => void;
  upsertAutomation: (automation: AutomationSummary | AutomationDetail) => void;
  loadRuns: (automationGuid?: string) => Promise<unknown>;
  applyRunUpdate: (payload: AutomationRunUpdatedEvent) => void;
  applyRunOutput: (payload: AutomationRunOutputEvent) => void;
  clearRunSelection: () => void;
}

/**
 * Page-local automation WebSocket sync.
 *
 * Ownership split (APP-035):
 * - `ServerStateEventBridge` owns Query list/run *invalidation* for definition/run events
 *   so caches stay fresh even when this page is unmounted.
 * - This hook owns page UX that Query invalidation alone cannot: selected detail refresh,
 *   selection reset on delete, local run-state patches, and `automation_run_output` streams.
 * - `upsertAutomation` / `removeAutomation` still patch the Query list for immediate UI;
 *   bridge invalidation may refetch afterward (correctness over dedupe).
 */
export function useAutomationWebsocketSync({
  selectedAutomationGuid,
  setSelectedDetail,
  setAutomationParam,
  setPageView,
  refreshAutomation,
  removeAutomation,
  upsertAutomation,
  loadRuns,
  applyRunUpdate,
  applyRunOutput,
  clearRunSelection,
}: UseAutomationWebsocketSyncOptions) {
  React.useEffect(() => {
    const store = useWebSocketStore.getState();

    const refreshAffectedDefinition = (automationGuid: string) => {
      void refreshAutomation(automationGuid)
        .then((detail) => {
          if (automationGuid === selectedAutomationGuid) {
            setSelectedDetail(detail);
          }
        })
        .catch(() => undefined);
    };

    const offDefinition = store.onEvent(
      "automation_definition_updated",
      (event) => {
        const payload = event as AutomationDefinitionUpdatedEvent;
        if (payload.change === "deleted") {
          removeAutomation(payload.automation_guid);
          if (payload.automation_guid === selectedAutomationGuid) {
            setSelectedDetail(null);
            clearRunSelection();
            void setAutomationParam(null);
            void setPageView("list");
          }
          return;
        }

        if (payload.automation) {
          upsertAutomation(payload.automation);
        }
        if (payload.automation_guid === selectedAutomationGuid) {
          refreshAffectedDefinition(payload.automation_guid);
        }
      },
    );

    const offRun = store.onEvent("automation_run_updated", (event) => {
      const payload = event as AutomationRunUpdatedEvent;
      refreshAffectedDefinition(payload.automation_guid);
      applyRunUpdate(payload);
      void loadRuns(payload.automation_guid);
    });

    const offRunOutput = store.onEvent("automation_run_output", (event) => {
      applyRunOutput(event as AutomationRunOutputEvent);
    });

    return () => {
      offDefinition();
      offRun();
      offRunOutput();
    };
  }, [
    applyRunOutput,
    applyRunUpdate,
    clearRunSelection,
    loadRuns,
    refreshAutomation,
    removeAutomation,
    selectedAutomationGuid,
    setAutomationParam,
    setPageView,
    setSelectedDetail,
    upsertAutomation,
  ]);
}

"use client";

import * as React from "react";
import { createTranslator } from "next-intl";
import { toastManager } from "@workspace/ui";

import {
  mergeLiveOutputIntoArtifact,
  type LiveRunOutputBuffer,
} from "@/features/automations/lib/live-run-output";
import type {
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationRunOutputEvent,
  AutomationRunSummary,
  AutomationRunUpdatedEvent,
} from "@/features/automations/types";
import type { AutomationsView } from "@/shared/lib/nuqs/searchParams";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type AutomationsLocale = "en" | "zh";

let cachedLocale: AutomationsLocale | null = null;
let cachedTranslator: ReturnType<typeof createTranslator> | null = null;

function automationsT(
  key: string,
  values?: Record<string, string | number>,
): string {
  const locale: AutomationsLocale =
    currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedTranslator || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "automation" as never,
    });
  }

  return cachedTranslator(key as never, values as never);
}

interface UseAutomationRunHistoryStateOptions {
  pageView: AutomationsView | null;
  selectedAutomationGuid: string | null;
  selectedRunGuid: string | null;
  setRunParam: (guid: string | null) => Promise<URLSearchParams>;
  listRuns: (
    automationGuid: string,
  ) => Promise<{ runs: AutomationRunSummary[] }>;
  getRun: (runGuid: string) => Promise<AutomationRunSummary>;
  getArtifact: (
    runGuid: string,
    kind: AutomationArtifactKind,
  ) => Promise<AutomationArtifactResponse>;
}

export function useAutomationRunHistoryState({
  pageView,
  selectedAutomationGuid,
  selectedRunGuid,
  setRunParam,
  listRuns,
  getRun,
  getArtifact,
}: UseAutomationRunHistoryStateOptions) {
  const [runs, setRuns] = React.useState<AutomationRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = React.useState(false);
  const [selectedRun, setSelectedRun] =
    React.useState<AutomationRunSummary | null>(null);
  const [artifact, setArtifact] =
    React.useState<AutomationArtifactResponse | null>(null);
  const [artifactLoading, setArtifactLoading] = React.useState(false);
  const selectedAutomationGuidRef = React.useRef<string | null>(null);
  const liveRunOutputRef = React.useRef<Map<string, LiveRunOutputBuffer>>(
    new Map(),
  );
  const runsRequestSeqRef = React.useRef(0);

  React.useEffect(() => {
    selectedAutomationGuidRef.current = selectedAutomationGuid;
    liveRunOutputRef.current.clear();
  }, [selectedAutomationGuid]);

  const loadRuns = React.useCallback(
    async (automationGuid: string) => {
      const shouldUpdateSelection =
        selectedAutomationGuidRef.current === automationGuid;
      const requestId = shouldUpdateSelection
        ? runsRequestSeqRef.current + 1
        : runsRequestSeqRef.current;
      if (shouldUpdateSelection) {
        runsRequestSeqRef.current = requestId;
        setRunsLoading(true);
      }
      const isCurrentRequest = () =>
        shouldUpdateSelection &&
        selectedAutomationGuidRef.current === automationGuid &&
        runsRequestSeqRef.current === requestId;
      try {
        const response = await listRuns(automationGuid);
        if (isCurrentRequest()) {
          setRuns(response.runs);
        }
        return response.runs;
      } catch (err) {
        if (isCurrentRequest()) {
          setRuns([]);
          toastManager.add({
            title: automationsT("runHistory.failedToLoadTitle"),
            description:
              err instanceof Error
                ? err.message
                : automationsT("runHistory.unknownError"),
            type: "error",
          });
        }
        return [];
      } finally {
        if (isCurrentRequest()) {
          setRunsLoading(false);
        }
      }
    },
    [listRuns],
  );

  React.useEffect(() => {
    if (!selectedAutomationGuid) {
      runsRequestSeqRef.current += 1;
      setRuns([]);
      void setRunParam(null);
      setRunsLoading(false);
      return;
    }
    void loadRuns(selectedAutomationGuid);
  }, [loadRuns, selectedAutomationGuid, setRunParam]);

  React.useEffect(() => {
    if (pageView !== "history") {
      return;
    }
    if (runs.length === 0) {
      void setRunParam(null);
      return;
    }
    if (!selectedRunGuid || !runs.some((run) => run.guid === selectedRunGuid)) {
      void setRunParam(runs[0]?.guid ?? null);
    }
  }, [pageView, runs, selectedRunGuid, setRunParam]);

  React.useEffect(() => {
    setArtifact(null);
    if (!selectedRunGuid) {
      setSelectedRun(null);
      return;
    }

    const knownRun = runs.find((run) => run.guid === selectedRunGuid);
    if (knownRun) {
      setSelectedRun(knownRun);
    }

    let cancelled = false;
    getRun(selectedRunGuid)
      .then((run) => {
        if (!cancelled) {
          setSelectedRun(run);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedRun(knownRun ?? null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getRun, runs, selectedRunGuid]);

  const applyRunUpdate = React.useCallback(
    (payload: AutomationRunUpdatedEvent) => {
      if (payload.automation_guid !== selectedAutomationGuidRef.current) {
        return;
      }

      setRuns((current) => {
        const index = current.findIndex((run) => run.guid === payload.run_guid);
        if (index === -1) {
          return [payload.run, ...current];
        }
        const next = current.slice();
        next[index] = payload.run;
        return next;
      });

      if (selectedRunGuid === payload.run_guid) {
        setSelectedRun(payload.run);
      }
    },
    [selectedRunGuid],
  );

  const applyRunOutput = React.useCallback(
    (payload: AutomationRunOutputEvent) => {
      if (payload.automation_guid !== selectedAutomationGuidRef.current) {
        return;
      }

      const finalChunk = payload.final_chunk ? payload.chunk : "";
      const buffer = liveRunOutputRef.current.get(payload.run_guid) ?? {
        final: "",
      };
      if (finalChunk) {
        buffer.final = `${buffer.final}${finalChunk}`;
      }
      liveRunOutputRef.current.set(payload.run_guid, buffer);

      setArtifact((current) => {
        if (!current || current.run_guid !== payload.run_guid) {
          return current;
        }
        if (current.artifact === "final") {
          return finalChunk
            ? { ...current, content: `${current.content}${finalChunk}` }
            : current;
        }
        return current;
      });
    },
    [],
  );

  const handleArtifactFetch = React.useCallback(
    async (run: AutomationRunSummary, kind: AutomationArtifactKind) => {
      setArtifactLoading(true);
      try {
        const response = await getArtifact(run.guid, kind);
        setArtifact(
          mergeLiveOutputIntoArtifact(
            response,
            liveRunOutputRef.current.get(run.guid),
          ),
        );
      } catch (err) {
        toastManager.add({
          title: automationsT("runHistory.failedToFetchArtifactTitle"),
          description:
            err instanceof Error
              ? err.message
              : automationsT("runHistory.unknownError"),
          type: "error",
        });
      } finally {
        setArtifactLoading(false);
      }
    },
    [getArtifact],
  );

  const clearRunSelection = React.useCallback(() => {
    setRuns([]);
    setSelectedRun(null);
    setArtifact(null);
    void setRunParam(null);
  }, [setRunParam]);

  return {
    artifact,
    artifactLoading,
    applyRunOutput,
    applyRunUpdate,
    clearRunSelection,
    handleArtifactFetch,
    loadRuns,
    runs,
    runsLoading,
    selectedRun,
    setArtifact,
    setRuns,
    setSelectedRun,
  };
}

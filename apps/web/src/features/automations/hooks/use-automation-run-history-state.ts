"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createTranslator } from "next-intl";
import { toastManager } from "@workspace/ui";

import { queryKeys } from "@/api/query/query-keys";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useAutomationRunListQuery } from "@/features/automations/hooks/use-automations-query";
import {
  ALL_AUTOMATION_RUNS_KEY,
  automationRunListQueryOptions,
} from "@/features/automations/lib/automations-query-options";
import {
  mergeLiveOutputIntoArtifact,
  type LiveRunOutputBuffer,
} from "@/features/automations/lib/live-run-output";
import type {
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationRunListResponse,
  AutomationRunOutputEvent,
  AutomationRunSummary,
  AutomationRunUpdatedEvent,
} from "@/features/automations/types";

import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type AutomationsLocale = "en" | "zh";

let cachedLocale: AutomationsLocale | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTranslator: any = null;

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
  selectedAutomationGuid: string | null;
  selectedRunGuid: string | null;
  setRunParam: (guid: string | null) => Promise<URLSearchParams>;
  getRun: (runGuid: string) => Promise<AutomationRunSummary>;
  getArtifact: (
    runGuid: string,
    kind: AutomationArtifactKind,
  ) => Promise<AutomationArtifactResponse>;
}

export function useAutomationRunHistoryState({
  selectedAutomationGuid,
  selectedRunGuid,
  setRunParam,
  getRun,
  getArtifact,
}: UseAutomationRunHistoryStateOptions) {
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();
  const connectionState = useWebSocketStore((s) => s.connectionState);
  const runListQuery = useAutomationRunListQuery(ALL_AUTOMATION_RUNS_KEY);

  const runs = runListQuery.data?.runs ?? [];
  const runsLoading = runListQuery.isLoading || runListQuery.isFetching;

  const [selectedRun, setSelectedRun] =
    React.useState<AutomationRunSummary | null>(null);
  const [artifact, setArtifact] =
    React.useState<AutomationArtifactResponse | null>(null);
  const [artifactLoading, setArtifactLoading] = React.useState(false);
  const selectedAutomationGuidRef = React.useRef<string | null>(null);
  const liveRunOutputRef = React.useRef<Map<string, LiveRunOutputBuffer>>(
    new Map(),
  );
  const loadErrorToastShownRef = React.useRef(false);

  React.useEffect(() => {
    selectedAutomationGuidRef.current = selectedAutomationGuid;
    liveRunOutputRef.current.clear();
    loadErrorToastShownRef.current = false;
  }, [selectedAutomationGuid]);

  React.useEffect(() => {
    if (!runListQuery.isError || loadErrorToastShownRef.current) return;
    loadErrorToastShownRef.current = true;
    toastManager.add({
      title: automationsT("runHistory.failedToLoadTitle"),
      description:
        runListQuery.error instanceof Error
          ? runListQuery.error.message
          : automationsT("runHistory.unknownError"),
      type: "error",
    });
  }, [runListQuery.error, runListQuery.isError]);

  const writeRunList = React.useCallback(
    (
      automationGuid: string,
      updater: (current: AutomationRunSummary[]) => AutomationRunSummary[],
    ) => {
      queryClient.setQueryData<AutomationRunListResponse>(
        queryKeys.computer.automationRunList(scope, automationGuid),
        (old) => {
          const current = old?.runs ?? [];
          return {
            runs: updater(current),
            next_page_token: old?.next_page_token ?? null,
          };
        },
      );
    },
    [queryClient, scope],
  );

  const patchRunList = React.useCallback(
    (
      automationGuid: string,
      updater: (current: AutomationRunSummary[]) => AutomationRunSummary[],
    ) => {
      writeRunList(ALL_AUTOMATION_RUNS_KEY, updater);
      if (automationGuid !== ALL_AUTOMATION_RUNS_KEY) {
        writeRunList(automationGuid, updater);
      }
    },
    [writeRunList],
  );

  const setRuns = React.useCallback(
    (
      updater:
        | AutomationRunSummary[]
        | ((current: AutomationRunSummary[]) => AutomationRunSummary[]),
    ) => {
      const apply = (current: AutomationRunSummary[]) =>
        typeof updater === "function" ? updater(current) : updater;
      writeRunList(ALL_AUTOMATION_RUNS_KEY, apply);
      const automationGuid = selectedAutomationGuidRef.current;
      if (automationGuid) {
        writeRunList(automationGuid, apply);
      }
    },
    [writeRunList],
  );

  const loadRuns = React.useCallback(
    async (automationGuid?: string) => {
      try {
        const [allResponse] = await Promise.all([
          queryClient.fetchQuery(
            automationRunListQueryOptions(
              scope,
              connectionState,
              ALL_AUTOMATION_RUNS_KEY,
            ),
          ),
          automationGuid
            ? queryClient.fetchQuery(
                automationRunListQueryOptions(scope, connectionState, automationGuid),
              )
            : Promise.resolve(null),
        ]);
        return allResponse.runs;
      } catch (err) {
        toastManager.add({
          title: automationsT("runHistory.failedToLoadTitle"),
          description:
            err instanceof Error
              ? err.message
              : automationsT("runHistory.unknownError"),
          type: "error",
        });
        return [];
      }
    },
    [connectionState, queryClient, scope],
  );

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
      patchRunList(payload.automation_guid, (current) => {
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
    [patchRunList, selectedRunGuid],
  );

  const applyRunOutput = React.useCallback(
    (payload: AutomationRunOutputEvent) => {
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

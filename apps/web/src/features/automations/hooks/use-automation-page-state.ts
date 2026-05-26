"use client";

import * as React from "react";
import { toastManager } from "@workspace/ui";

import { useAutomations } from "@/features/automations/hooks/use-automations";
import { formatShortId } from "@/features/automations/lib/automation-format";
import type { SetupMode } from "@/features/automations/components/AutomationSetup";
import type {
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationCreateRequest,
  AutomationDefinitionUpdatedEvent,
  AutomationDetail,
  AutomationRunSummary,
  AutomationRunUpdatedEvent,
  AutomationSummary,
  AutomationUpdateRequest,
} from "@/features/automations/types";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useProjectStore } from "@/features/project/store/use-project-store";

export function useAutomationPageState() {
  const {
    automations,
    agents,
    loading,
    error,
    reload,
    upsertAutomation,
    removeAutomation,
    refreshAutomation,
    getAutomation,
    createAutomation,
    updateAutomation,
    runNow,
    pauseAutomation,
    resumeAutomation,
    listRuns,
    getRun,
    cancelRun,
    getArtifact,
    schedulePreview,
  } = useAutomations();
  const projects = useProjectStore((state) => state.projects);
  const isProjectsLoading = useProjectStore((state) => state.isLoading);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);

  const [setupMode, setSetupMode] = React.useState<SetupMode | null>(null);
  const [selectedAutomationGuid, setSelectedAutomationGuid] = React.useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = React.useState<AutomationDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [runs, setRuns] = React.useState<AutomationRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = React.useState(false);
  const [selectedRunGuid, setSelectedRunGuid] = React.useState<string | null>(null);
  const [selectedRun, setSelectedRun] = React.useState<AutomationRunSummary | null>(null);
  const [artifact, setArtifact] = React.useState<AutomationArtifactResponse | null>(null);
  const [artifactLoading, setArtifactLoading] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const selectedAutomation = React.useMemo(
    () => automations.find((automation) => automation.guid === selectedAutomationGuid) ?? null,
    [automations, selectedAutomationGuid],
  );

  React.useEffect(() => {
    if (projects.length === 0 && !isProjectsLoading) {
      void fetchProjects();
    }
  }, [fetchProjects, isProjectsLoading, projects.length]);

  React.useEffect(() => {
    if (automations.length === 0) {
      setSelectedAutomationGuid(null);
      return;
    }
    if (!selectedAutomationGuid || !automations.some((automation) => automation.guid === selectedAutomationGuid)) {
      setSelectedAutomationGuid(automations[0]?.guid ?? null);
    }
  }, [automations, selectedAutomationGuid]);

  const loadAutomationDetail = React.useCallback(
    async (automationGuid: string, showToast = true) => {
      setDetailLoading(true);
      try {
        const detail = await getAutomation(automationGuid);
        setSelectedDetail(detail);
        upsertAutomation(detail);
        return detail;
      } catch (err) {
        setSelectedDetail(null);
        if (showToast) {
          toastManager.add({
            title: "Failed to load automation",
            description: err instanceof Error ? err.message : "Unknown error",
            type: "error",
          });
        }
        return null;
      } finally {
        setDetailLoading(false);
      }
    },
    [getAutomation, upsertAutomation],
  );

  React.useEffect(() => {
    if (!selectedAutomationGuid) {
      setSelectedDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    getAutomation(selectedAutomationGuid)
      .then((detail) => {
        if (!cancelled) {
          setSelectedDetail(detail);
          upsertAutomation(detail);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSelectedDetail(null);
          toastManager.add({
            title: "Failed to load automation",
            description: err instanceof Error ? err.message : "Unknown error",
            type: "error",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getAutomation, selectedAutomationGuid, upsertAutomation]);

  const loadRuns = React.useCallback(
    async (automationGuid: string) => {
      setRunsLoading(true);
      try {
        const response = await listRuns(automationGuid);
        setRuns(response.runs);
        return response.runs;
      } catch (err) {
        setRuns([]);
        toastManager.add({
          title: "Failed to load run history",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
        return [];
      } finally {
        setRunsLoading(false);
      }
    },
    [listRuns],
  );

  React.useEffect(() => {
    if (!selectedAutomationGuid) {
      setRuns([]);
      setSelectedRunGuid(null);
      return;
    }
    void loadRuns(selectedAutomationGuid);
  }, [loadRuns, selectedAutomationGuid]);

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

    const offDefinition = store.onEvent("automation_definition_updated", (event) => {
      const payload = event as AutomationDefinitionUpdatedEvent;
      if (payload.change === "deleted") {
        removeAutomation(payload.automation_guid);
        if (payload.automation_guid === selectedAutomationGuid) {
          setSelectedDetail(null);
          setRuns([]);
          setSelectedRunGuid(null);
        }
        return;
      }

      if (payload.automation) {
        upsertAutomation(payload.automation);
      }
      if (payload.automation_guid === selectedAutomationGuid) {
        refreshAffectedDefinition(payload.automation_guid);
      }
    });

    const offRun = store.onEvent("automation_run_updated", (event) => {
      const payload = event as AutomationRunUpdatedEvent;
      refreshAffectedDefinition(payload.automation_guid);

      if (payload.automation_guid !== selectedAutomationGuid) {
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
      void loadRuns(payload.automation_guid);
    });

    return () => {
      offDefinition();
      offRun();
    };
  }, [
    loadRuns,
    refreshAutomation,
    removeAutomation,
    selectedAutomationGuid,
    selectedRunGuid,
    upsertAutomation,
  ]);

  React.useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunGuid(null);
      return;
    }
    if (!selectedRunGuid || !runs.some((run) => run.guid === selectedRunGuid)) {
      setSelectedRunGuid(runs[0]?.guid ?? null);
    }
  }, [runs, selectedRunGuid]);

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

  const handleCreate = React.useCallback(
    async (request: AutomationCreateRequest) => {
      const detail = await createAutomation(request);
      toastManager.add({
        title: "Automation created",
        description: detail.display_name,
        type: "success",
      });
      upsertAutomation(detail);
      setSelectedAutomationGuid(detail.guid);
      setSelectedDetail(detail);
      setRuns([]);
      setSelectedRunGuid(null);
      setSetupMode(null);
    },
    [createAutomation, upsertAutomation],
  );

  const handleUpdate = React.useCallback(
    async (request: AutomationUpdateRequest) => {
      const detail = await updateAutomation(request);
      toastManager.add({
        title: "Automation updated",
        description: detail.display_name,
        type: "success",
      });
      upsertAutomation(detail);
      setSelectedAutomationGuid(detail.guid);
      setSelectedDetail(detail);
      setSetupMode(null);
    },
    [updateAutomation, upsertAutomation],
  );

  const handleDefinitionAction = React.useCallback(
    async (action: "run" | "pause" | "resume", automation: AutomationSummary) => {
      setBusyAction(`${action}:${automation.guid}`);
      try {
        if (action === "run") {
          const run = await runNow(automation.guid);
          setSelectedRunGuid(run.guid);
          setSelectedRun(run);
          await Promise.all([
            refreshAutomation(automation.guid).then(setSelectedDetail).catch(() => undefined),
            loadRuns(automation.guid),
          ]);
          if (run.status === "failed") {
            toastManager.add({
              title: "Automation run failed to start",
              description: run.error_message ?? automation.display_name,
              type: "error",
            });
          } else {
            toastManager.add({
              title: "Automation run started",
              description: automation.display_name,
              type: "success",
            });
          }
        } else if (action === "pause") {
          const detail = await pauseAutomation(automation.guid);
          upsertAutomation(detail);
          setSelectedDetail(detail);
          toastManager.add({
            title: "Schedule paused",
            description: automation.display_name,
            type: "info",
          });
        } else {
          const detail = await resumeAutomation(automation.guid);
          upsertAutomation(detail);
          setSelectedDetail(detail);
          toastManager.add({
            title: "Schedule resumed",
            description: automation.display_name,
            type: "success",
          });
        }
      } catch (err) {
        toastManager.add({
          title: action === "run" ? "Run now failed" : "Schedule update failed",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [loadRuns, pauseAutomation, refreshAutomation, resumeAutomation, runNow, upsertAutomation],
  );

  const handleCancelRun = React.useCallback(
    async (run: AutomationRunSummary) => {
      setBusyAction(`cancel:${run.guid}`);
      try {
        const nextRun = await cancelRun(run.guid);
        setSelectedRun(nextRun);
        setRuns((current) => current.map((item) => (item.guid === nextRun.guid ? nextRun : item)));
        await Promise.all([
          loadRuns(run.automation_guid),
          refreshAutomation(run.automation_guid).then((detail) => {
            if (run.automation_guid === selectedAutomationGuid) {
              setSelectedDetail(detail);
            }
          }).catch(() => undefined),
        ]);
        toastManager.add({
          title: "Run cancelled",
          description: formatShortId(run.guid),
          type: "info",
        });
      } catch (err) {
        toastManager.add({
          title: "Cancel failed",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [cancelRun, loadRuns, refreshAutomation, selectedAutomationGuid],
  );

  const handleArtifactFetch = React.useCallback(
    async (run: AutomationRunSummary, kind: AutomationArtifactKind) => {
      setArtifactLoading(true);
      try {
        const response = await getArtifact(run.guid, kind);
        setArtifact(response);
      } catch (err) {
        toastManager.add({
          title: "Failed to fetch artifact",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
      } finally {
        setArtifactLoading(false);
      }
    },
    [getArtifact],
  );

  const handleReload = React.useCallback(() => {
    void reload().then(() => {
      if (selectedAutomationGuid) {
        void loadAutomationDetail(selectedAutomationGuid, false);
        void loadRuns(selectedAutomationGuid);
      }
    });
  }, [loadAutomationDetail, loadRuns, reload, selectedAutomationGuid]);

  return {
    automations,
    agents,
    loading,
    error,
    projects,
    isProjectsLoading,
    setupMode,
    selectedAutomationGuid,
    selectedAutomation,
    selectedDetail,
    detailLoading,
    runs,
    runsLoading,
    selectedRun,
    selectedRunGuid,
    artifact,
    artifactLoading,
    busyAction,
    schedulePreview,
    setSetupMode,
    setSelectedAutomationGuid,
    loadRuns,
    handleReload,
    handleCreate,
    handleUpdate,
    handleDefinitionAction,
    handleCancelRun,
    handleArtifactFetch,
    setSelectedRunGuid,
  };
}

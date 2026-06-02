"use client";

import * as React from "react";
import { toastManager } from "@workspace/ui";
import { useQueryState } from "nuqs";

import { TERMINAL_AGENT_DEFINITIONS } from "@/features/agent/lib/terminal-agent-definitions";
import { useAutomations } from "@/features/automations/hooks/use-automations";
import { useGithubRelayPrerequisites } from "@/features/automations/hooks/use-github-relay-prerequisites";
import { formatShortId } from "@/features/automations/lib/automation-format";
import { deleteAutomationWithGithubRoute } from "@/features/automations/lib/github-route-lifecycle";
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
import { useWorkspaceCreationStore } from "@/features/workspace/store/workspace-creation-store";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { automationsParams, type AutomationsView } from "@/shared/lib/nuqs/searchParams";

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("Failed to copy automation continue prompt:", error);
    return false;
  }
}

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
    deleteAutomation,
    runNow,
    pauseAutomation,
    resumeAutomation,
    listRuns,
    getRun,
    cancelRun,
    getArtifact,
    continueInTerminal,
    schedulePreview,
  } = useAutomations();
  const router = useAppRouter();
  const queueAgentRun = useWorkspaceCreationStore((state) => state.queueAgentRun);
  const showOpening = useWorkspaceCreationStore((state) => state.showOpening);
  const githubPrereqs = useGithubRelayPrerequisites();
  const projects = useProjectStore((state) => state.projects);
  const isProjectsLoading = useProjectStore((state) => state.isLoading);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);

  const [pageView, setPageView] = useQueryState("automationView", automationsParams.view);
  const [automationParam, setAutomationParam] = useQueryState("automationId", automationsParams.automation);
  const [runParam, setRunParam] = useQueryState("automationRun", automationsParams.run);
  const [targetFilter, setTargetFilter] = useQueryState("automationTarget", automationsParams.target);
  const [searchQuery, setSearchQuery] = useQueryState("automationQ", automationsParams.q);

  const setupMode: SetupMode | null = pageView === "create" || pageView === "edit" ? pageView : null;
  const selectedAutomationGuid = automationParam || null;
  const selectedRunGuid = runParam || null;

  const [selectedDetail, setSelectedDetail] = React.useState<AutomationDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [runs, setRuns] = React.useState<AutomationRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = React.useState(false);
  const [selectedRun, setSelectedRun] = React.useState<AutomationRunSummary | null>(null);
  const [artifact, setArtifact] = React.useState<AutomationArtifactResponse | null>(null);
  const [artifactLoading, setArtifactLoading] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [standaloneChatRunGuid, setStandaloneChatRunGuid] = React.useState<string | null>(null);
  const selectedAutomationGuidRef = React.useRef<string | null>(null);
  const runsRequestSeqRef = React.useRef(0);

  const selectedAutomation = React.useMemo(
    () => automations.find((automation) => automation.guid === selectedAutomationGuid) ?? null,
    [automations, selectedAutomationGuid],
  );

  React.useEffect(() => {
    selectedAutomationGuidRef.current = selectedAutomationGuid;
  }, [selectedAutomationGuid]);

  React.useEffect(() => {
    if (projects.length === 0 && !isProjectsLoading) {
      void fetchProjects();
    }
  }, [fetchProjects, isProjectsLoading, projects.length]);

  React.useEffect(() => {
    if ((pageView === "edit" || pageView === "history") && !selectedAutomationGuid) {
      void setPageView("list");
      return;
    }
    if (
      automations.length > 0 &&
      selectedAutomationGuid &&
      !automations.some((automation) => automation.guid === selectedAutomationGuid)
    ) {
      void setPageView("list");
      void setAutomationParam(null);
      void setRunParam(null);
    }
  }, [automations, pageView, selectedAutomationGuid, setAutomationParam, setPageView, setRunParam]);

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
      const shouldUpdateSelection = selectedAutomationGuidRef.current === automationGuid;
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
            title: "Failed to load run history",
            description: err instanceof Error ? err.message : "Unknown error",
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

  const ensureWorkspaceInProjectStore = React.useCallback(
    async (workspaceGuid: string) => {
      const hasWorkspace = () =>
        useProjectStore
          .getState()
          .projects.some((project) =>
            project.workspaces.some((workspace) => workspace.id === workspaceGuid),
          );
      const waitForIdle = async () => {
        for (
          let attempt = 0;
          attempt < 40 && useProjectStore.getState().isLoading;
          attempt += 1
        ) {
          await sleep(50);
        }
      };

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await waitForIdle();
        if (hasWorkspace()) {
          return true;
        }
        await fetchProjects();
        if (hasWorkspace()) {
          return true;
        }
        await sleep(100);
      }

      return hasWorkspace();
    },
    [fetchProjects],
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
          void setRunParam(null);
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
    setAutomationParam,
    setPageView,
    setRunParam,
    upsertAutomation,
  ]);

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

  const handleCreate = React.useCallback(
    async (request: AutomationCreateRequest) => {
      const detail = await createAutomation(request);
      toastManager.add({
        title: "Automation created",
        description: detail.display_name,
        type: "success",
      });
      upsertAutomation(detail);
      void setAutomationParam(null);
      setSelectedDetail(detail);
      setRuns([]);
      void setRunParam(null);
      void setPageView("list");
      return detail;
    },
    [createAutomation, setAutomationParam, setPageView, setRunParam, upsertAutomation],
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
      void setAutomationParam(null);
      setSelectedDetail(detail);
      void setPageView("list");
      return detail;
    },
    [setAutomationParam, setPageView, updateAutomation, upsertAutomation],
  );

  const handleDefinitionAction = React.useCallback(
    async (action: "run" | "pause" | "resume" | "delete", automation: AutomationSummary) => {
      setBusyAction(`${action}:${automation.guid}`);
      try {
        if (action === "run") {
          const run = await runNow(automation.guid);
          if (pageView === "history") {
            void setRunParam(run.guid);
          }
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
        } else if (action === "delete") {
          await deleteAutomationWithGithubRoute({
            automation,
            githubPrereqs,
            deleteAutomation,
          });
          removeAutomation(automation.guid);
          if (automation.guid === selectedAutomationGuidRef.current) {
            void setAutomationParam(null);
            setSelectedDetail(null);
            setRuns([]);
            void setRunParam(null);
            setSelectedRun(null);
            void setPageView("list");
          }
          toastManager.add({
            title: "Automation deleted",
            description: automation.display_name,
            type: "success",
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
          title:
            action === "run"
              ? "Run now failed"
              : action === "delete"
                ? "Delete failed"
                : "Schedule update failed",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [
      deleteAutomation,
      githubPrereqs,
      loadRuns,
      pauseAutomation,
      pageView,
      refreshAutomation,
      removeAutomation,
      resumeAutomation,
      runNow,
      setAutomationParam,
      setPageView,
      setRunParam,
      upsertAutomation,
    ],
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

  const handleContinueInTerminal = React.useCallback(
    async (run: AutomationRunSummary) => {
      setBusyAction(`continue:${run.guid}`);
      try {
        const response = await continueInTerminal(run.guid);
        const copied = await copyTextToClipboard(response.prompt_content);
        const contextId = response.workspace_guid ?? response.project_guid;
        if (!contextId) {
          setStandaloneChatRunGuid(run.guid);
          toastManager.add({
            title: "Opening standalone conversation",
            description: copied
              ? "Continuation prompt copied to clipboard."
              : `Clipboard unavailable. Prompt saved at ${response.prompt_path}`,
            type: copied ? "success" : "warning",
          });
          return;
        }

        const isBuiltIn = TERMINAL_AGENT_DEFINITIONS.some((agent) => agent.id === response.agent_id);
        const agentLabel = response.agent_label ?? response.agent_id;
        if (response.workspace_guid) {
          showOpening(response.workspace_guid);
          const workspaceReady = await ensureWorkspaceInProjectStore(response.workspace_guid);
          if (!workspaceReady) {
            console.warn(
              `Automation continue target workspace ${response.workspace_guid} is not in the project store yet.`,
            );
          }
        }
        queueAgentRun({
          workspaceId: response.workspace_guid,
          projectId: response.workspace_guid ? null : response.project_guid,
          prompt: "",
          command: response.command,
          agent: {
            id: response.agent_id,
            label: agentLabel,
            command: response.command,
            iconType: isBuiltIn ? "built-in" : "custom",
          },
        });

        const route = response.workspace_guid
          ? `/workspace?id=${response.workspace_guid}&tab=terminal`
          : `/project?id=${contextId}&tab=terminal`;
        router.push(route);
        toastManager.add({
          title: "Opening terminal agent",
          description: copied
            ? "Continuation prompt copied to clipboard. Paste it into the terminal when ready."
            : `Clipboard unavailable. Prompt saved at ${response.prompt_path}`,
          type: copied ? "success" : "warning",
        });
      } catch (err) {
        toastManager.add({
          title: "Failed to continue in terminal",
          description: err instanceof Error ? err.message : "Unknown error",
          type: "error",
        });
      } finally {
        setBusyAction((current) => (current === `continue:${run.guid}` ? null : current));
      }
    },
    [
      continueInTerminal,
      ensureWorkspaceInProjectStore,
      queueAgentRun,
      router,
      showOpening,
    ],
  );

  const handleReload = React.useCallback(() => {
    void reload().then(() => {
      if (selectedAutomationGuid) {
        void loadAutomationDetail(selectedAutomationGuid, false);
        void loadRuns(selectedAutomationGuid);
      }
    });
  }, [loadAutomationDetail, loadRuns, reload, selectedAutomationGuid]);

  const openList = React.useCallback(() => {
    void setPageView("list");
    void setAutomationParam(null);
    void setRunParam(null);
  }, [setAutomationParam, setPageView, setRunParam]);

  const openHistory = React.useCallback(
    (automationGuid: string) => {
      void setAutomationParam(automationGuid);
      void setRunParam(null);
      void setPageView("history");
    },
    [setAutomationParam, setPageView, setRunParam],
  );

  const openEdit = React.useCallback(
    (automationGuid: string) => {
      void setAutomationParam(automationGuid);
      void setRunParam(null);
      void setPageView("edit");
    },
    [setAutomationParam, setPageView, setRunParam],
  );

  const openCreate = React.useCallback(() => {
    void setAutomationParam(null);
    void setRunParam(null);
    void setPageView("create");
  }, [setAutomationParam, setPageView, setRunParam]);

  const setSetupMode = React.useCallback(
    (mode: SetupMode | null) => {
      if (!mode) {
        openList();
        return;
      }
      if (mode === "create") {
        openCreate();
        return;
      }
      if (selectedAutomationGuid) {
        openEdit(selectedAutomationGuid);
      } else {
        void setPageView("list");
      }
    },
    [openCreate, openEdit, openList, selectedAutomationGuid, setPageView],
  );

  const setSelectedRunGuid = React.useCallback(
    (guid: string | null) => {
      void setRunParam(guid);
    },
    [setRunParam],
  );

  return {
    automations,
    agents,
    loading,
    error,
    projects,
    isProjectsLoading,
    pageView: pageView as AutomationsView,
    targetFilter,
    searchQuery,
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
    standaloneChatOpen: Boolean(standaloneChatRunGuid),
    closeStandaloneChat: () => setStandaloneChatRunGuid(null),
    schedulePreview,
    setSetupMode,
    setSelectedAutomationGuid: openHistory,
    setTargetFilter,
    setSearchQuery,
    openList,
    openHistory,
    openEdit,
    openCreate,
    loadRuns,
    handleReload,
    handleCreate,
    handleUpdate,
    handleDefinitionAction,
    handleCancelRun,
    handleArtifactFetch,
    handleContinueInTerminal,
    setSelectedRunGuid,
  };
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toastManager } from "@workspace/ui";
import { useQueryState, useQueryStates } from "nuqs";

import { useAutomations } from "@/features/automations/hooks/use-automations";
import { useGithubRelayPrerequisites } from "@/features/automations/hooks/use-github-relay-prerequisites";
import { useAutomationRunHistoryState } from "@/features/automations/hooks/use-automation-run-history-state";
import { useAutomationWebsocketSync } from "@/features/automations/hooks/use-automation-websocket-sync";
import { formatShortId } from "@/features/automations/lib/automation-format";
import { deleteAutomationWithGithubRoute } from "@/features/automations/lib/github-route-lifecycle";
import { parseGithubTriggerConfig } from "@/features/automations/lib/github-trigger-relay";
import type { AutomationListFilters } from "@/features/automations/lib/automation-list-filters";
import type { SetupMode } from "@/features/automations/components/AutomationSetup";
import type {
  AutomationCreateRequest,
  AutomationDetail,
  AutomationRunSummary,
  AutomationSummary,
  AutomationUpdateRequest,
} from "@/features/automations/types";
import {
  useProjects,
  useProjectsLoading,
} from "@/features/project/hooks/use-project-bootstrap-query";
import { useProjectStore } from "@/features/project/store/use-project-store";
import { useWorkspaceCreationStore } from "@/features/workspace/store/workspace-creation-store";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  runFiltersForAutomation,
  type AutomationRunListFilters,
} from "@/features/automations/lib/automation-run-filters";
import {
  automationsParams,
  type AutomationsListTab,
  type AutomationsView,
} from "@/shared/lib/nuqs/searchParams";

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
  const t = useTranslations("automation.pageState");
  const {
    automations,
    agents,
    loading,
    error,
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
    getRun,
    cancelRun,
    getArtifact,
    continueInTerminal,
    schedulePreview,
  } = useAutomations();
  const router = useAppRouter();
  const showOpening = useWorkspaceCreationStore((state) => state.showOpening);
  const githubPrereqs = useGithubRelayPrerequisites();
  const projects = useProjects();
  const isProjectsLoading = useProjectsLoading();
  const ensureWorkspaceVisible = useProjectStore((state) => state.ensureWorkspaceVisible);

  const [pageView, setPageView] = useQueryState(
    "automationView",
    automationsParams.view,
  );
  const [listTab, setListTab] = useQueryState(
    "automationTab",
    automationsParams.tab,
  );
  const [runStatuses, setRunStatuses] = useQueryState(
    "automationRunStatuses",
    automationsParams.runStatuses,
  );
  const [runAutomationGuids, setRunAutomationGuids] = useQueryState(
    "automationRunAutomations",
    automationsParams.runAutomations,
  );
  const [automationParam, setAutomationParam] = useQueryState(
    "automationId",
    automationsParams.automation,
  );
  const [runParam, setRunParam] = useQueryState(
    "automationRun",
    automationsParams.run,
  );
  const [filterParams, setFilterParams] = useQueryStates({
    automationEnvironments: automationsParams.environments,
    automationTriggers: automationsParams.triggers,
    automationStates: automationsParams.states,
  });
  const [searchQuery, setSearchQuery] = useQueryState(
    "automationQ",
    automationsParams.q,
  );
  const listFilters = React.useMemo<AutomationListFilters>(
    () => ({
      environments: filterParams.automationEnvironments,
      triggers: filterParams.automationTriggers,
      states: filterParams.automationStates,
    }),
    [
      filterParams.automationEnvironments,
      filterParams.automationStates,
      filterParams.automationTriggers,
    ],
  );
  const setListFilters = React.useCallback(
    (filters: AutomationListFilters) => {
      void setFilterParams({
        automationEnvironments: filters.environments,
        automationTriggers: filters.triggers,
        automationStates: filters.states,
      });
    },
    [setFilterParams],
  );
  const runFilters = React.useMemo<AutomationRunListFilters>(
    () => ({
      environments: filterParams.automationEnvironments,
      triggers: filterParams.automationTriggers,
      statuses: runStatuses,
      automationGuids: runAutomationGuids,
    }),
    [
      filterParams.automationEnvironments,
      filterParams.automationTriggers,
      runAutomationGuids,
      runStatuses,
    ],
  );
  const setRunFilters = React.useCallback(
    (filters: AutomationRunListFilters) => {
      void setFilterParams({
        automationEnvironments: filters.environments,
        automationTriggers: filters.triggers,
      });
      void setRunStatuses(filters.statuses);
      void setRunAutomationGuids(filters.automationGuids);
    },
    [setFilterParams, setRunAutomationGuids, setRunStatuses],
  );

  const setupMode: SetupMode | null =
    pageView === "create" || pageView === "edit" ? pageView : null;
  const selectedAutomationGuid = automationParam || null;
  const selectedRunGuid = runParam || null;

  const [selectedDetail, setSelectedDetail] =
    React.useState<AutomationDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [standaloneChatRunGuid, setStandaloneChatRunGuid] = React.useState<
    string | null
  >(null);
  const selectedAutomationGuidRef = React.useRef<string | null>(null);

  const selectedAutomation = React.useMemo(
    () =>
      automations.find(
        (automation) => automation.guid === selectedAutomationGuid,
      ) ?? null,
    [automations, selectedAutomationGuid],
  );

  React.useEffect(() => {
    selectedAutomationGuidRef.current = selectedAutomationGuid;
  }, [selectedAutomationGuid]);

  const {
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
    setRuns,
    setSelectedRun,
  } = useAutomationRunHistoryState({
    selectedAutomationGuid,
    selectedRunGuid,
    setRunParam,
    getRun,
    getArtifact,
  });

  // Projects are now loaded by the TanStack Query bootstrap; no manual fetch needed.

  React.useEffect(() => {
    if (pageView === "history") {
      void setListTab("history");
      void setPageView("list");
      return;
    }
    if (pageView === "edit" && !selectedAutomationGuid) {
      void setPageView("list");
      return;
    }
    if (
      automations.length > 0 &&
      selectedAutomationGuid &&
      !automations.some(
        (automation) => automation.guid === selectedAutomationGuid,
      )
    ) {
      if (pageView === "edit") {
        void setPageView("list");
        void setRunParam(null);
      }
      void setAutomationParam(null);
    }
  }, [
    automations,
    pageView,
    selectedAutomationGuid,
    setAutomationParam,
    setListTab,
    setPageView,
    setRunParam,
  ]);

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
            title: t("errors.loadAutomation"),
            description: err instanceof Error ? err.message : t("errors.unknown"),
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

  useAutomationWebsocketSync({
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
  });

  const handleCreate = React.useCallback(
    async (request: AutomationCreateRequest) => {
      const detail = await createAutomation(request);
      toastManager.add({
        title: t("toasts.created"),
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
    [
      createAutomation,
      setAutomationParam,
      setPageView,
      setRunParam,
      setRuns,
      upsertAutomation,
      t,
    ],
  );

  const handleUpdate = React.useCallback(
    async (request: AutomationUpdateRequest) => {
      const detail = await updateAutomation(request);
      toastManager.add({
        title: t("toasts.updated"),
        description: detail.display_name,
        type: "success",
      });
      upsertAutomation(detail);
      void setAutomationParam(null);
      setSelectedDetail(detail);
      void setPageView("list");
      return detail;
    },
    [setAutomationParam, setPageView, t, updateAutomation, upsertAutomation],
  );

  const handleDefinitionAction = React.useCallback(
    async (
      action: "run" | "pause" | "resume" | "delete",
      automation: AutomationSummary,
    ) => {
      setBusyAction(`${action}:${automation.guid}`);
      try {
        if (action === "run") {
          const run = await runNow(automation.guid);
          if (listTab === "history") {
            void setRunParam(run.guid);
          }
          setSelectedRun(run);
          await Promise.all([
            refreshAutomation(automation.guid)
              .then(setSelectedDetail)
              .catch(() => undefined),
            loadRuns(automation.guid),
          ]);
          if (run.status === "failed") {
            toastManager.add({
              title: t("toasts.runFailedToStart"),
              description: run.error_message ?? automation.display_name,
              type: "error",
            });
          } else {
            toastManager.add({
              title: t("toasts.runStarted"),
              description: automation.display_name,
              type: "success",
            });
          }
        } else if (action === "pause") {
          const detail = await pauseAutomation(automation.guid);
          upsertAutomation(detail);
          setSelectedDetail(detail);
          toastManager.add({
            title: t("toasts.schedulePaused"),
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
            title: t("toasts.deleted"),
            description: automation.display_name,
            type: "success",
          });
        } else {
          const detail = await resumeAutomation(automation.guid);
          upsertAutomation(detail);
          setSelectedDetail(detail);
          toastManager.add({
            title: t("toasts.scheduleResumed"),
            description: automation.display_name,
            type: "success",
          });
        }
      } catch (err) {
        toastManager.add({
          title:
            action === "run"
              ? t("errors.runNowFailed")
              : action === "delete"
                ? t("errors.deleteFailed")
                : t("errors.scheduleUpdateFailed"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [
      deleteAutomation,
      githubPrereqs,
      listTab,
      loadRuns,
      pauseAutomation,
      refreshAutomation,
      removeAutomation,
      resumeAutomation,
      runNow,
      setAutomationParam,
      setPageView,
      setRunParam,
      setRuns,
      setSelectedRun,
      t,
      upsertAutomation,
    ],
  );

  const handleToggleEnabled = React.useCallback(
    async (automation: AutomationSummary, enabled: boolean) => {
      setBusyAction(`toggle:${automation.guid}`);
      try {
        let detail: AutomationDetail;
        if (automation.trigger_kind === "github") {
          const githubConfig = parseGithubTriggerConfig(
            automation.trigger_config_json,
          );
          if (!githubConfig) {
            throw new Error(t("errors.githubSetupIncomplete"));
          }
          detail = await updateAutomation({
            automation_guid: automation.guid,
            trigger: {
              kind: "github",
              enabled,
              status: enabled ? "active" : "paused",
              config: githubConfig,
            },
          });
        } else if (automation.schedule_enabled) {
          detail = enabled
            ? await resumeAutomation(automation.guid)
            : await pauseAutomation(automation.guid);
        } else {
          return;
        }

        upsertAutomation(detail);
        if (automation.guid === selectedAutomationGuidRef.current) {
          setSelectedDetail(detail);
        }
        toastManager.add({
          title: enabled ? t("toasts.enabled") : t("toasts.disabled"),
          description: automation.display_name,
          type: enabled ? "success" : "info",
        });
      } catch (err) {
        toastManager.add({
          title: enabled ? t("errors.enableFailed") : t("errors.disableFailed"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [
      pauseAutomation,
      resumeAutomation,
      t,
      updateAutomation,
      upsertAutomation,
    ],
  );

  const handleCancelRun = React.useCallback(
    async (run: AutomationRunSummary) => {
      setBusyAction(`cancel:${run.guid}`);
      try {
        const nextRun = await cancelRun(run.guid);
        setSelectedRun(nextRun);
        setRuns((current) =>
          current.map((item) => (item.guid === nextRun.guid ? nextRun : item)),
        );
        await Promise.all([
          loadRuns(run.automation_guid),
          refreshAutomation(run.automation_guid)
            .then((detail) => {
              if (run.automation_guid === selectedAutomationGuid) {
                setSelectedDetail(detail);
              }
            })
            .catch(() => undefined),
        ]);
        toastManager.add({
          title: t("toasts.runCancelled"),
          description: formatShortId(run.guid),
          type: "info",
        });
      } catch (err) {
        toastManager.add({
          title: t("errors.cancelFailed"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [cancelRun, loadRuns, refreshAutomation, selectedAutomationGuid, setRuns, setSelectedRun, t],
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
            title: t("toasts.openingStandaloneConversation"),
            description: copied
              ? t("toasts.promptCopied")
              : t("toasts.clipboardUnavailable", {
                  promptPath: response.prompt_path,
                }),
            type: copied ? "success" : "warning",
          });
          return;
        }

        if (response.workspace_guid) {
          showOpening(response.workspace_guid);
          const workspaceReady = await ensureWorkspaceVisible(
            response.workspace_guid,
          );
          if (!workspaceReady) {
            console.warn(
              `Automation continue target workspace ${response.workspace_guid} is not in the project store yet.`,
            );
          }
        }

        const route = response.workspace_guid
          ? `/workspace?id=${response.workspace_guid}&tab=terminal`
          : `/project?id=${contextId}&tab=terminal`;
        router.push(route);
        toastManager.add({
          title: t("toasts.openingTerminal"),
          description: copied
            ? t("toasts.promptCopied")
            : t("toasts.clipboardUnavailable", {
                promptPath: response.prompt_path,
              }),
          type: copied ? "success" : "warning",
        });
      } catch (err) {
        toastManager.add({
          title: t("errors.continueInTerminalFailed"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      } finally {
        setBusyAction((current) =>
          current === `continue:${run.guid}` ? null : current,
        );
      }
    },
    [continueInTerminal, ensureWorkspaceVisible, router, showOpening, t],
  );

  const handleSaveMemory = React.useCallback(
    async (automationGuid: string, memory: string) => {
      try {
        const detail = await updateAutomation({
          automation_guid: automationGuid,
          memory,
        });
        upsertAutomation(detail);
        setSelectedDetail(detail);
      } catch (err) {
        toastManager.add({
          title: t("errors.saveMemoryFailed"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
        throw err;
      }
    },
    [t, updateAutomation, upsertAutomation],
  );

  const openList = React.useCallback(() => {
    void setPageView("list");
    void setAutomationParam(null);
    void setRunParam(null);
  }, [setAutomationParam, setPageView, setRunParam]);

  const openHistory = React.useCallback(
    (runGuid?: string) => {
      void setListTab("history");
      void setPageView("list");
      void setRunParam(runGuid ?? null);
    },
    [setListTab, setPageView, setRunParam],
  );

  const openAutomationRuns = React.useCallback(
    (automationGuid: string) => {
      setRunFilters(runFiltersForAutomation(automationGuid, runFilters));
      void setListTab("history");
      void setPageView("list");
      void setRunParam(null);
    },
    [runFilters, setListTab, setPageView, setRunFilters, setRunParam],
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
    listTab: listTab as AutomationsListTab,
    listFilters,
    runFilters,
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
    setListTab,
    setListFilters,
    setRunFilters,
    setSearchQuery,
    openList,
    openHistory,
    openAutomationRuns,
    openEdit,
    openCreate,
    loadRuns,
    handleCreate,
    handleUpdate,
    handleDefinitionAction,
    handleToggleEnabled,
    handleCancelRun,
    handleArtifactFetch,
    handleContinueInTerminal,
    handleSaveMemory,
    setSelectedRunGuid,
    clearRunSelection,
  };
}

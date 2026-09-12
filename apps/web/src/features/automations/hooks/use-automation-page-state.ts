"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toastManager } from "@workspace/ui";
import { useQueryState, useQueryStates } from "nuqs";

import { useAgentChatCenterTabsStore } from "@/features/agent/store/use-agent-chat-center-tabs";
import { useAutomations } from "@/features/automations/hooks/use-automations";
import { useGithubRelayPrerequisites } from "@/features/automations/hooks/use-github-relay-prerequisites";
import { useAutomationRunHistoryState } from "@/features/automations/hooks/use-automation-run-history-state";
import { useAutomationWebsocketSync } from "@/features/automations/hooks/use-automation-websocket-sync";
import { formatShortId } from "@/features/automations/lib/automation-format";
import {
  automationsCreateQuery,
  automationsEditQuery,
  automationsListQuery,
  automationsViewFromLocation,
  resolveAutomationsPageView,
} from "@/features/automations/lib/automation-page-query";
import { applyAutomationRunSurface } from "@/features/automations/lib/apply-automation-run-surface";
import {
  runEnvironmentHref,
  runLandingHref,
} from "@/features/automations/lib/automation-run-landing";
import { deleteAutomationWithGithubRoute } from "@/features/automations/lib/github-route-lifecycle";
import { parseGithubTriggerConfig } from "@/features/automations/lib/github-trigger-relay";
import type { AutomationListFilters } from "@/features/automations/lib/automation-list-filters";
import type { SetupMode } from "@/features/automations/components/AutomationSetup";
import type {
  AutomationContinueInTerminalResponse,
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

function continueTargetRun(
  run: AutomationRunSummary,
  response: AutomationContinueInTerminalResponse,
): AutomationRunSummary {
  return {
    ...run,
    project_guid: response.project_guid ?? run.project_guid,
    workspace_guid: response.workspace_guid ?? run.workspace_guid,
    created_workspace_guid: response.workspace_guid ?? run.created_workspace_guid,
  };
}

async function revealContinueWorkspace(
  workspaceGuid: string | null | undefined,
  ensureWorkspaceVisible: (workspaceId: string) => Promise<boolean>,
) {
  if (!workspaceGuid) return;
  const workspaceReady = await ensureWorkspaceVisible(workspaceGuid);
  if (!workspaceReady) {
    console.warn(
      `Automation continue target workspace ${workspaceGuid} is not in the project store yet.`,
    );
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

  const githubPrereqs = useGithubRelayPrerequisites();
  const projects = useProjects();
  const isProjectsLoading = useProjectsLoading();
  const ensureWorkspaceVisible = useProjectStore((state) => state.ensureWorkspaceVisible);

  const [{ automationView: hookPageView, automationId: automationParam, automationRun: runParam }, setPageParams] =
    useQueryStates(
      {
        automationView: automationsParams.view,
        automationId: automationsParams.automation,
        automationRun: automationsParams.run,
      },
      { history: "push" },
    );
  const pageView = resolveAutomationsPageView(
    hookPageView,
    automationsViewFromLocation(
      typeof window === "undefined" ? null : window.location.search,
    ),
  );
  const setPageView = React.useCallback(
    (view: AutomationsView | null) =>
      setPageParams({ automationView: view ?? "list" }),
    [setPageParams],
  );
  const setAutomationParam = React.useCallback(
    (guid: string | null) => setPageParams({ automationId: guid }),
    [setPageParams],
  );
  const setRunParam = React.useCallback(
    (guid: string | null) => setPageParams({ automationRun: guid }),
    [setPageParams],
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
      void setPageParams(automationsListQuery());
      return;
    }
    if (pageView === "edit" && !selectedAutomationGuid) {
      void setPageParams(automationsListQuery());
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
        void setPageParams(automationsListQuery());
      } else {
        void setAutomationParam(null);
      }
    }
  }, [
    automations,
    pageView,
    selectedAutomationGuid,
    setAutomationParam,
    setListTab,
    setPageParams,
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
      void setPageParams(automationsListQuery());
      setSelectedDetail(detail);
      setRuns([]);
      return detail;
    },
    [createAutomation, setPageParams, setRuns, upsertAutomation, t],
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
      void setPageParams(automationsListQuery());
      setSelectedDetail(detail);
      return detail;
    },
    [setPageParams, t, updateAutomation, upsertAutomation],
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
            applyAutomationRunSurface(run);
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
            void setPageParams(automationsListQuery());
            setSelectedDetail(null);
            setRuns([]);
            setSelectedRun(null);
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
      setPageParams,
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
      setBusyAction(`continue-terminal:${run.guid}`);
      try {
        const response = await continueInTerminal(run.guid);
        const copied = await copyTextToClipboard(response.prompt_content);
        const href = runEnvironmentHref(
          continueTargetRun(run, response),
          "tab=terminal",
        );
        if (href.startsWith("/automations?")) {
          toastManager.add({
            title: t("errors.continueInTerminalFailed"),
            description: t("errors.unknown"),
            type: "error",
          });
          return;
        }
        await revealContinueWorkspace(response.workspace_guid, ensureWorkspaceVisible);
        router.pushWorkspaceDeepLink(href);
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
          current === `continue-terminal:${run.guid}` ? null : current,
        );
      }
    },
    [continueInTerminal, ensureWorkspaceVisible, router, t],
  );

  const handleContinueInChat = React.useCallback(
    async (run: AutomationRunSummary) => {
      setBusyAction(`continue-chat:${run.guid}`);
      try {
        const response = await continueInTerminal(run.guid);
        const copied = await copyTextToClipboard(response.prompt_content);
        const contextId = response.workspace_guid ?? response.project_guid;
        if (!contextId) {
          setStandaloneChatRunGuid(run.guid);
          toastManager.add({
            title: t("toasts.openingStandaloneChat"),
            description: copied
              ? t("toasts.promptCopied")
              : t("toasts.clipboardUnavailable", {
                  promptPath: response.prompt_path,
                }),
            type: copied ? "success" : "warning",
          });
          return;
        }

        const tab = useAgentChatCenterTabsStore.getState().openDraftTab({
          contextId,
          title: run.terminal_display_name,
        });
        const href = runEnvironmentHref(
          continueTargetRun(run, response),
          `tab=${encodeURIComponent(tab.value)}`,
        );
        await revealContinueWorkspace(response.workspace_guid, ensureWorkspaceVisible);
        router.pushWorkspaceDeepLink(href);
        toastManager.add({
          title: t("toasts.openingChat"),
          description: copied
            ? t("toasts.promptCopied")
            : t("toasts.clipboardUnavailable", {
                promptPath: response.prompt_path,
              }),
          type: copied ? "success" : "warning",
        });
      } catch (err) {
        toastManager.add({
          title: t("errors.continueInChatFailed"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      } finally {
        setBusyAction((current) =>
          current === `continue-chat:${run.guid}` ? null : current,
        );
      }
    },
    [continueInTerminal, ensureWorkspaceVisible, router, t],
  );

  const handleOpenRunSurface = React.useCallback(
    async (run: AutomationRunSummary) => {
      setBusyAction(`open:${run.guid}`);
      try {
        applyAutomationRunSurface(run);
        const workspaceId = run.created_workspace_guid || run.workspace_guid;
        await revealContinueWorkspace(workspaceId, ensureWorkspaceVisible);
        router.pushWorkspaceDeepLink(runLandingHref(run));
      } catch (err) {
        toastManager.add({
          title: t("errors.openSurfaceFailed"),
          description: err instanceof Error ? err.message : t("errors.unknown"),
          type: "error",
        });
      } finally {
        setBusyAction((current) =>
          current === `open:${run.guid}` ? null : current,
        );
      }
    },
    [ensureWorkspaceVisible, router, t],
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
    void setPageParams(automationsListQuery());
  }, [setPageParams]);

  const openHistory = React.useCallback(
    (runGuid?: string) => {
      void setListTab("history");
      void setPageParams(
        automationsListQuery({ automationRun: runGuid ?? null }),
      );
    },
    [setListTab, setPageParams],
  );

  const openAutomationRuns = React.useCallback(
    (automationGuid: string) => {
      setRunFilters(runFiltersForAutomation(automationGuid, runFilters));
      void setListTab("history");
      void setPageParams(automationsListQuery());
    },
    [runFilters, setListTab, setPageParams, setRunFilters],
  );

  const openEdit = React.useCallback(
    (automationGuid: string) => {
      void setPageParams(automationsEditQuery(automationGuid));
    },
    [setPageParams],
  );

  const openCreate = React.useCallback(() => {
    void setPageParams(automationsCreateQuery());
  }, [setPageParams]);

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
    runNow,
    handleDefinitionAction,
    handleToggleEnabled,
    handleCancelRun,
    handleArtifactFetch,
    handleContinueInTerminal,
    handleContinueInChat,
    handleOpenRunSurface,
    handleSaveMemory,
    setSelectedRunGuid,
    clearRunSelection,
  };
}

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { wsRequest } from "@/api/ws/request";
import type {
  AutomationAgentCapabilitiesResponse,
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationContinueInTerminalResponse,
  AutomationCreateRequest,
  AutomationDetail,
  AutomationRunDetail,
  AutomationRunListResponse,
  AutomationScheduleInput,
  AutomationSchedulePreviewResponse,
  AutomationSummary,
  AutomationUpdateRequest,
  AutomationListResponse,
} from "@/features/automations/types";
import {
  useAutomationListQuery,
  useAutomationAgentCapabilitiesQuery,
} from "@/features/automations/hooks/use-automations-query";
import {
  invalidateAutomationDefinitionQueries,
} from "@/features/automations/lib/automations-query-options";
import { queryKeys } from "@/api/query/query-keys";
import { useComputerQueryScope } from "@/api/query/query-scope";

export function useAutomations() {
  const t = useTranslations("automation.store");
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();

  const automationListQuery = useAutomationListQuery();
  const agentCapabilitiesQuery = useAutomationAgentCapabilitiesQuery();

  const automations = automationListQuery.data?.automations ?? [];
  const agents = agentCapabilitiesQuery.data?.agents ?? [];
  const loading = (automationListQuery.isLoading || agentCapabilitiesQuery.isLoading);
  const error =
    automationListQuery.isError
      ? (automationListQuery.error instanceof Error
          ? automationListQuery.error.message
          : t("errors.loadAutomations"))
      : null;

  const reload = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.computer.automationList(scope),
        refetchType: "all",
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.computer.automationAgentCapabilities(scope),
        refetchType: "all",
      }),
    ]);
  }, [queryClient, scope]);

  const reloadAutomations = React.useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.computer.automationList(scope),
      refetchType: "all",
    });
    return queryClient.getQueryData<AutomationListResponse>(queryKeys.computer.automationList(scope))?.automations ?? [];
  }, [queryClient, scope]);

  const reloadAgents = React.useCallback(async () => {
    const key = queryKeys.computer.automationAgentCapabilities(scope);
    await queryClient.invalidateQueries({
      queryKey: key,
      refetchType: "all",
    });
    return (
      queryClient.getQueryData<AutomationAgentCapabilitiesResponse>(key)?.agents ?? []
    );
  }, [queryClient, scope]);

  const upsertAutomation = React.useCallback((automation: AutomationSummary) => {
    queryClient.setQueryData<AutomationListResponse>(
      queryKeys.computer.automationList(scope),
      (prev) => {
        if (!prev) return prev;
        const index = prev.automations.findIndex((item) => item.guid === automation.guid);
        if (index === -1) {
          return { ...prev, automations: [automation, ...prev.automations] };
        }
        const next = prev.automations.slice();
        next[index] = automation;
        return { ...prev, automations: next };
      },
    );
  }, [queryClient, scope]);

  const removeAutomation = React.useCallback((automationGuid: string) => {
    queryClient.setQueryData<AutomationListResponse>(
      queryKeys.computer.automationList(scope),
      (prev) =>
        prev
          ? { ...prev, automations: prev.automations.filter((a) => a.guid !== automationGuid) }
          : prev,
    );
    invalidateAutomationDefinitionQueries(queryClient, scope);
  }, [queryClient, scope]);

  const refreshAutomation = React.useCallback(
    async (automationGuid: string) => {
      const detail = await wsRequest("automation_get", {
        automation_guid: automationGuid,
      });
      upsertAutomation(detail);
      return detail;
    },
    [upsertAutomation],
  );

  const getAutomation = React.useCallback((automationGuid: string) => {
    return wsRequest("automation_get", {
      automation_guid: automationGuid,
    });
  }, []);

  const createAutomation = React.useCallback((request: AutomationCreateRequest) => {
    return wsRequest("automation_create", request);
  }, []);

  const updateAutomation = React.useCallback((request: AutomationUpdateRequest) => {
    return wsRequest("automation_update", request);
  }, []);

  const deleteAutomation = React.useCallback((automationGuid: string) => {
    return wsRequest("automation_delete", {
      automation_guid: automationGuid,
    });
  }, []);

  const runNow = React.useCallback((automationGuid: string) => {
    return wsRequest("automation_run_now", {
      automation_guid: automationGuid,
    });
  }, []);

  const pauseAutomation = React.useCallback((automationGuid: string) => {
    return wsRequest("automation_pause", {
      automation_guid: automationGuid,
    });
  }, []);

  const resumeAutomation = React.useCallback((automationGuid: string) => {
    return wsRequest("automation_resume", {
      automation_guid: automationGuid,
    });
  }, []);

  const listRuns = React.useCallback((automationGuid: string, limit = 50, pageToken?: string) => {
    return wsRequest("automation_run_list", {
      automation_guid: automationGuid,
      limit,
      page_token: pageToken,
    });
  }, []);

  const getRun = React.useCallback((runGuid: string) => {
    return wsRequest("automation_run_get", {
      run_guid: runGuid,
    });
  }, []);

  const cancelRun = React.useCallback((runGuid: string) => {
    return wsRequest("automation_cancel_run", {
      run_guid: runGuid,
    });
  }, []);

  const getArtifact = React.useCallback((runGuid: string, artifact: AutomationArtifactKind) => {
    return wsRequest("automation_artifact_get", {
      run_guid: runGuid,
      artifact,
    });
  }, []);

  const continueInTerminal = React.useCallback((runGuid: string) => {
    return wsRequest("automation_continue_in_terminal", {
      run_guid: runGuid,
    });
  }, []);

  const schedulePreview = React.useCallback(
    (schedule: AutomationScheduleInput, timezone: string, count = 5) => {
      return wsRequest("automation_schedule_preview", {
        schedule,
        timezone,
        count,
      });
    },
    [],
  );

  return {
    automations,
    agents,
    loading,
    error,
    reload,
    reloadAutomations,
    reloadAgents,
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
  };
}

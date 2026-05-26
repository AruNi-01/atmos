"use client";

import * as React from "react";
import { wsRequest } from "@/api/ws/request";
import type {
  AutomationAgentCapabilitiesResponse,
  AutomationAgentCapability,
  AutomationArtifactKind,
  AutomationArtifactResponse,
  AutomationCreateRequest,
  AutomationDetail,
  AutomationListResponse,
  AutomationRunDetail,
  AutomationRunListResponse,
  AutomationScheduleInput,
  AutomationSchedulePreviewResponse,
  AutomationSummary,
  AutomationUpdateRequest,
} from "@/features/automations/types";

export function useAutomations() {
  const [automations, setAutomations] = React.useState<AutomationSummary[]>([]);
  const [agents, setAgents] = React.useState<AutomationAgentCapability[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const reloadAutomations = React.useCallback(async () => {
    const automationList = await wsRequest<AutomationListResponse>("automation_list", {
      include_paused: true,
    });
    setAutomations(automationList.automations);
    return automationList.automations;
  }, []);

  const reloadAgents = React.useCallback(async () => {
    const capabilityList = await wsRequest<AutomationAgentCapabilitiesResponse>(
      "automation_agent_capabilities",
    );
    setAgents(capabilityList.agents);
    return capabilityList.agents;
  }, []);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([reloadAutomations(), reloadAgents()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automations");
    } finally {
      setLoading(false);
    }
  }, [reloadAgents, reloadAutomations]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const upsertAutomation = React.useCallback((automation: AutomationSummary) => {
    setAutomations((current) => {
      const index = current.findIndex((item) => item.guid === automation.guid);
      if (index === -1) {
        return [automation, ...current];
      }
      const next = current.slice();
      next[index] = automation;
      return next;
    });
  }, []);

  const removeAutomation = React.useCallback((automationGuid: string) => {
    setAutomations((current) => current.filter((automation) => automation.guid !== automationGuid));
  }, []);

  const refreshAutomation = React.useCallback(
    async (automationGuid: string) => {
      const detail = await wsRequest<AutomationDetail>("automation_get", {
        automation_guid: automationGuid,
      });
      upsertAutomation(detail);
      return detail;
    },
    [upsertAutomation],
  );

  const getAutomation = React.useCallback((automationGuid: string) => {
    return wsRequest<AutomationDetail>("automation_get", {
      automation_guid: automationGuid,
    });
  }, []);

  const createAutomation = React.useCallback((request: AutomationCreateRequest) => {
    return wsRequest<AutomationDetail>("automation_create", request);
  }, []);

  const updateAutomation = React.useCallback((request: AutomationUpdateRequest) => {
    return wsRequest<AutomationDetail>("automation_update", request);
  }, []);

  const runNow = React.useCallback((automationGuid: string) => {
    return wsRequest<AutomationRunDetail>("automation_run_now", {
      automation_guid: automationGuid,
    });
  }, []);

  const pauseAutomation = React.useCallback((automationGuid: string) => {
    return wsRequest<AutomationDetail>("automation_pause", {
      automation_guid: automationGuid,
    });
  }, []);

  const resumeAutomation = React.useCallback((automationGuid: string) => {
    return wsRequest<AutomationDetail>("automation_resume", {
      automation_guid: automationGuid,
    });
  }, []);

  const listRuns = React.useCallback((automationGuid: string, limit = 50, pageToken?: string) => {
    return wsRequest<AutomationRunListResponse>("automation_run_list", {
      automation_guid: automationGuid,
      limit,
      page_token: pageToken,
    });
  }, []);

  const getRun = React.useCallback((runGuid: string) => {
    return wsRequest<AutomationRunDetail>("automation_run_get", {
      run_guid: runGuid,
    });
  }, []);

  const cancelRun = React.useCallback((runGuid: string) => {
    return wsRequest<AutomationRunDetail>("automation_cancel_run", {
      run_guid: runGuid,
    });
  }, []);

  const getArtifact = React.useCallback((runGuid: string, artifact: AutomationArtifactKind) => {
    return wsRequest<AutomationArtifactResponse>("automation_artifact_get", {
      run_guid: runGuid,
      artifact,
    });
  }, []);

  const schedulePreview = React.useCallback(
    (schedule: AutomationScheduleInput, timezone: string, count = 5) => {
      return wsRequest<AutomationSchedulePreviewResponse>("automation_schedule_preview", {
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
    runNow,
    pauseAutomation,
    resumeAutomation,
    listRuns,
    getRun,
    cancelRun,
    getArtifact,
    schedulePreview,
  };
}

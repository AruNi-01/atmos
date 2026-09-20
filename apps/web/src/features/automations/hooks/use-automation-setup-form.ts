"use client";

import * as React from "react";

import type {
  AutomationAgentCapability,
  AutomationChatAgentConfig,
  AutomationDetail,
  AutomationExecuteMode,
  AutomationScheduleInput,
  AutomationSchedulePreviewResponse,
  AutomationTargetKind,
} from "@/features/automations/types";
import {
  isChatAgentSelected,
  resolveSetupAgentId,
  shouldAutofillChatAgent,
  shouldAutofillTerminalAgent,
} from "@/features/automations/lib/automation-setup-agents";
import { parseExecuteMode } from "@/features/automations/lib/automation-run-landing";
import {
  parseRunConfigJson,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";
import {
  buildScheduleInput,
  DAY_OPTIONS,
  parseSchedule,
  type TriggerChoice,
} from "@/features/automations/lib/automation-schedule";
import {
  flattenWorkspaces,
  resolveTimezone,
} from "@/features/automations/lib/automation-format";
import type { Project } from "@/shared/types/domain";

import type { SetupMode } from "../components/AutomationSetup";

const DEFAULT_TRIGGER_PREVIEW_DELAY_MS = 300;

type UseAutomationSetupFormArgs = {
  mode: SetupMode;
  initialAutomation: AutomationDetail | null;
  agents: AutomationAgentCapability[];
  projects: Project[];
  chatProviderIds?: readonly string[];
  chatCatalogReady?: boolean;
  schedulePreview: (
    schedule: AutomationScheduleInput,
    timezone: string,
    count?: number,
  ) => Promise<AutomationSchedulePreviewResponse>;
};

export function useAutomationSetupForm({
  mode,
  initialAutomation,
  agents,
  projects,
  chatProviderIds = [],
  chatCatalogReady = false,
  schedulePreview,
}: UseAutomationSetupFormArgs) {
  const previewRequestIdRef = React.useRef(0);
  const [timezone, setTimezone] = React.useState(resolveTimezone);
  const [displayName, setDisplayName] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [memory, setMemory] = React.useState("");
  const [terminalAgentId, setTerminalAgentId] = React.useState("");
  const [chatAgentId, setChatAgentId] = React.useState("");
  const [chatModel, setChatModel] = React.useState("");
  const [chatThinking, setChatThinking] = React.useState("");
  const [chatFast, setChatFast] = React.useState("");
  const [chatContext, setChatContext] = React.useState("");
  const [executeMode, setExecuteMode] =
    React.useState<AutomationExecuteMode>("headless");
  const agentId = resolveSetupAgentId({
    executeMode,
    terminalAgentId,
    chatAgentId,
  });
  const setAgentId = React.useCallback(
    (nextAgentId: string) => {
      if (executeMode === "chat") {
        setChatAgentId(nextAgentId);
        return;
      }
      setTerminalAgentId(nextAgentId);
    },
    [executeMode],
  );
  const [targetKind, setTargetKind] =
    React.useState<AutomationTargetKind>("standalone");
  const [projectGuid, setProjectGuid] = React.useState("");
  const [workspaceGuid, setWorkspaceGuid] = React.useState("");
  const [trigger, setTrigger] = React.useState<TriggerChoice>("manual");
  const [hour, setHour] = React.useState(9);
  const [minute, setMinute] = React.useState(0);
  const [dayOfWeek, setDayOfWeek] = React.useState(1);
  const [dayOfMonth, setDayOfMonth] = React.useState(1);
  const [cronExpr, setCronExpr] = React.useState("0 9 * * *");
  const [agentRunConfigs, setAgentRunConfigs] = React.useState<
    Record<string, TerminalAgentRunConfigInput | null>
  >({});
  const [preview, setPreview] =
    React.useState<AutomationSchedulePreviewResponse | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [ready, setReady] = React.useState(mode === "create");

  const workspaces = React.useMemo(
    () => flattenWorkspaces(projects),
    [projects],
  );
  const supportedAgents = React.useMemo(
    () => agents.filter((agent) => agent.automation_supported),
    [agents],
  );
  const selectedAgent = React.useMemo(
    () => agents.find((agent) => agent.agent_id === agentId) ?? null,
    [agentId, agents],
  );
  const selectedTargetProject = React.useMemo(() => {
    if (targetKind === "project" || targetKind === "new_workspace") {
      return projects.find((project) => project.id === projectGuid) ?? null;
    }
    if (targetKind === "workspace") {
      return (
        workspaces.find((item) => item.workspace.id === workspaceGuid)
          ?.project ?? null
      );
    }
    return null;
  }, [projectGuid, projects, targetKind, workspaceGuid, workspaces]);

  React.useEffect(() => {
    if (mode === "edit" && initialAutomation) {
      setDisplayName(initialAutomation.display_name);
      setInstructions(initialAutomation.instructions);
      setMemory(initialAutomation.memory ?? "");
      const nextMode = parseExecuteMode(initialAutomation.execute_mode);
      const nextChatConfig = parseChatAgentConfig(
        initialAutomation.agent_config_json,
      );
      setExecuteMode(nextMode);
      if (nextMode === "chat") {
        setChatAgentId(
          nextChatConfig?.provider_id || initialAutomation.agent_id,
        );
        setChatModel(nextChatConfig?.model?.trim() || "");
        setChatThinking(nextChatConfig?.thinking?.trim() || "");
        setChatFast(nextChatConfig?.fast?.trim() || "");
        setChatContext(nextChatConfig?.context?.trim() || "");
      } else {
        setTerminalAgentId(initialAutomation.agent_id);
      }
      setTargetKind(initialAutomation.target_kind);
      setProjectGuid(initialAutomation.project_guid ?? "");
      setWorkspaceGuid(initialAutomation.workspace_guid ?? "");
      setAgentRunConfigs(
        initialAutomation.agent_id
          ? {
              [initialAutomation.agent_id]:
                parseRunConfigJson(initialAutomation.agent_config_json) ?? null,
            }
          : {},
      );
      const parsed = parseSchedule(initialAutomation);
      setTimezone(parsed.timezone.trim() || resolveTimezone());
      setTrigger(parsed.trigger);
      setHour(parsed.hour);
      setMinute(parsed.minute);
      setDayOfWeek(parsed.dayOfWeek);
      setDayOfMonth(parsed.dayOfMonth);
      setCronExpr(parsed.cronExpr);
      setSubmitError(null);
      setReady(true);
    } else if (mode === "create") {
      setReady(true);
    }
  }, [initialAutomation, mode]);

  React.useEffect(() => {
    if (
      shouldAutofillTerminalAgent({
        executeMode,
        terminalAgentId,
        hasSupportedTerminalAgents: supportedAgents.length > 0,
      })
    ) {
      setTerminalAgentId(supportedAgents[0]?.agent_id ?? "");
    }
  }, [executeMode, supportedAgents, terminalAgentId]);

  React.useEffect(() => {
    if (
      shouldAutofillChatAgent({
        executeMode,
        chatAgentId,
        hasChatAgents: chatProviderIds.length > 0,
      })
    ) {
      setChatAgentId(chatProviderIds[0] ?? "");
    }
  }, [chatAgentId, chatProviderIds, executeMode]);

  React.useEffect(() => {
    if (
      (targetKind === "project" || targetKind === "new_workspace") &&
      !projectGuid &&
      projects.length > 0
    ) {
      setProjectGuid(projects[0]?.id ?? "");
    }
    if (targetKind === "workspace" && !workspaceGuid && workspaces.length > 0) {
      setWorkspaceGuid(workspaces[0]?.workspace.id ?? "");
    }
  }, [projectGuid, projects, targetKind, workspaceGuid, workspaces]);

  const targetValid =
    targetKind === "standalone" ||
    ((targetKind === "project" || targetKind === "new_workspace") &&
      projectGuid.trim().length > 0) ||
    (targetKind === "workspace" && workspaceGuid.trim().length > 0);

  const environmentLabel = React.useMemo(() => {
    if (targetKind === "standalone") {
      return "Standalone";
    }
    if (targetKind === "project") {
      return (
        projects.find((project) => project.id === projectGuid)?.name ??
        "Project"
      );
    }
    if (targetKind === "new_workspace") {
      const projectName = projects.find(
        (project) => project.id === projectGuid,
      )?.name;
      return projectName ? `New workspace / ${projectName}` : "New Workspace";
    }
    const selectedWorkspace = workspaces.find(
      ({ workspace }) => workspace.id === workspaceGuid,
    );
    return selectedWorkspace
      ? `${selectedWorkspace.workspace.displayName || selectedWorkspace.workspace.name} / ${selectedWorkspace.project.name}`
      : "Workspace";
  }, [projectGuid, projects, targetKind, workspaceGuid, workspaces]);

  const scheduleInput = React.useMemo(
    () =>
      buildScheduleInput(
        trigger,
        timezone,
        hour,
        minute,
        dayOfWeek,
        dayOfMonth,
        cronExpr,
      ),
    [cronExpr, dayOfMonth, dayOfWeek, hour, minute, timezone, trigger],
  );
  const scheduleValid =
    trigger === "manual" ||
    trigger === "github" ||
    (scheduleInput !== null &&
      (trigger !== "cron" || cronExpr.trim().split(/\s+/).length === 5));

  React.useEffect(() => {
    if (!scheduleInput || trigger === "manual") {
      previewRequestIdRef.current += 1;
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    const timeout = window.setTimeout(() => {
      setPreviewLoading(true);
      schedulePreview(scheduleInput, timezone, 5)
        .then((nextPreview) => {
          if (previewRequestIdRef.current !== requestId) return;
          setPreview(nextPreview);
          setPreviewError(null);
        })
        .catch((error) => {
          if (previewRequestIdRef.current !== requestId) return;
          setPreview(null);
          setPreviewError(
            error instanceof Error ? error.message : "Invalid schedule",
          );
        })
        .finally(() => {
          if (previewRequestIdRef.current === requestId) {
            setPreviewLoading(false);
          }
        });
    }, DEFAULT_TRIGGER_PREVIEW_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [scheduleInput, schedulePreview, timezone, trigger]);

  const triggerValid =
    scheduleValid &&
    (!previewError || trigger === "manual" || trigger === "github");
  const formValid =
    displayName.trim().length > 0 &&
    instructions.trim().length > 0 &&
    (executeMode === "chat"
      ? isChatAgentSelected({
          chatAgentId,
          chatProviderIds,
          catalogReady: chatCatalogReady,
        })
      : agentId.trim().length > 0 && !!selectedAgent?.automation_supported) &&
    targetValid &&
    triggerValid;
  const requestSchedule =
    trigger === "manual" || trigger === "github" ? null : scheduleInput;
  const triggerLabel = React.useMemo(
    () =>
      formatTriggerControlLabel({
        trigger,
        timezone,
        hour,
        minute,
        dayOfWeek,
        dayOfMonth,
        cronExpr,
        githubRepositoryFullName: "",
      }),
    [cronExpr, dayOfMonth, dayOfWeek, hour, minute, timezone, trigger],
  );

  const clearSubmitError = React.useCallback(() => {
    setSubmitError(null);
  }, []);

  const selectedAgentRunConfig = React.useMemo(
    () => agentRunConfigs[agentId] ?? null,
    [agentId, agentRunConfigs],
  );

  const setAgentRunConfig = React.useCallback(
    (nextAgentId: string, value: TerminalAgentRunConfigInput | null) => {
      setAgentRunConfigs((current) => ({
        ...current,
        [nextAgentId]: value,
      }));
    },
    [],
  );

  return {
    timezone,
    displayName,
    instructions,
    memory,
    agentId,
    chatModel,
    chatThinking,
    chatFast,
    chatContext,
    executeMode,
    targetKind,
    projectGuid,
    workspaceGuid,
    trigger,
    hour,
    minute,
    dayOfWeek,
    dayOfMonth,
    cronExpr,
    preview,
    previewError,
    previewLoading,
    submitError,
    submitting,
    ready,
    workspaces,
    agentRunConfigs,
    selectedAgent,
    selectedAgentRunConfig,
    selectedTargetProject,
    targetValid,
    environmentLabel,
    scheduleInput,
    scheduleValid,
    triggerValid,
    triggerLabel,
    formValid,
    requestSchedule,
    setInstructions,
    setMemory,
    setSubmitting,
    setSubmitError,
    clearSubmitError,
    setDisplayName,
    setAgentId,
    setChatModel,
    setChatThinking,
    setChatFast,
    setChatContext,
    setExecuteMode,
    setTargetKind,
    setProjectGuid,
    setWorkspaceGuid,
    setTrigger,
    setTimezone,
    setHour,
    setMinute,
    setDayOfWeek,
    setDayOfMonth,
    setCronExpr,
    setAgentRunConfig,
  };
}

function formatTriggerControlLabel({
  trigger,
  timezone,
  hour,
  minute,
  dayOfWeek,
  dayOfMonth,
  cronExpr,
  githubRepositoryFullName,
}: {
  trigger: TriggerChoice;
  timezone: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
  dayOfMonth: number;
  cronExpr: string;
  githubRepositoryFullName: string;
}) {
  const time = `${twoDigit(hour)}:${twoDigit(minute)}`;

  switch (trigger) {
    case "manual":
      return "manual";
    case "github":
      return githubRepositoryFullName
        ? `GitHub events in ${githubRepositoryFullName}`
        : "GitHub events";
    case "hourly":
      return `every hour at :${twoDigit(minute)} ${timezone}`;
    case "daily":
      return `daily at ${time} ${timezone}`;
    case "weekly": {
      const dayLabel =
        DAY_OPTIONS.find((option) => option.value === dayOfWeek)?.label ??
        "weekday";
      return `weekly on ${dayLabel} at ${time} ${timezone}`;
    }
    case "monthly":
      return `monthly on day ${dayOfMonth} at ${time} ${timezone}`;
    case "cron":
      return cronExpr.trim()
        ? `cron ${cronExpr.trim()} ${timezone}`
        : `cron schedule ${timezone}`;
  }
}

function parseChatAgentConfig(raw: string | null | undefined): AutomationChatAgentConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AutomationChatAgentConfig>;
    if (parsed.kind === "chat" && parsed.provider_id) {
      return {
        kind: "chat",
        provider_id: parsed.provider_id,
        model: parsed.model,
        thinking: parsed.thinking,
        mode: parsed.mode,
        permission_mode: parsed.permission_mode,
        fast: parsed.fast,
        context: parsed.context,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function twoDigit(value: number) {
  return String(Math.trunc(value)).padStart(2, "0");
}

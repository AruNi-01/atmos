"use client";

import * as React from "react";

import type {
  AutomationAgentCapability,
  AutomationDetail,
  AutomationScheduleInput,
  AutomationSchedulePreviewResponse,
  AutomationTargetKind,
} from "@/features/automations/types";
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
  schedulePreview: (
    schedule: AutomationScheduleInput,
    timezone: string,
    count?: number,
  ) => Promise<AutomationSchedulePreviewResponse>;
  clearAttachments: () => void;
};

export function useAutomationSetupForm({
  mode,
  initialAutomation,
  agents,
  projects,
  schedulePreview,
  clearAttachments,
}: UseAutomationSetupFormArgs) {
  const previewRequestIdRef = React.useRef(0);
  const [timezone, setTimezone] = React.useState(resolveTimezone);
  const [displayName, setDisplayName] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [agentId, setAgentId] = React.useState("");
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
  const [preview, setPreview] =
    React.useState<AutomationSchedulePreviewResponse | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

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
      clearAttachments();
      setDisplayName(initialAutomation.display_name);
      setInstructions(initialAutomation.instructions);
      setAgentId(initialAutomation.agent_id);
      setTargetKind(initialAutomation.target_kind);
      setProjectGuid(initialAutomation.project_guid ?? "");
      setWorkspaceGuid(initialAutomation.workspace_guid ?? "");
      const parsed = parseSchedule(initialAutomation);
      setTimezone(parsed.timezone);
      setTrigger(parsed.trigger);
      setHour(parsed.hour);
      setMinute(parsed.minute);
      setDayOfWeek(parsed.dayOfWeek);
      setDayOfMonth(parsed.dayOfMonth);
      setCronExpr(parsed.cronExpr);
      setSubmitError(null);
    }
  }, [clearAttachments, initialAutomation, mode]);

  React.useEffect(() => {
    if (!agentId && supportedAgents.length > 0) {
      setAgentId(supportedAgents[0]?.agent_id ?? "");
    }
  }, [agentId, supportedAgents]);

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
    !!selectedAgent?.automation_supported &&
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

  return {
    timezone,
    displayName,
    instructions,
    agentId,
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
    workspaces,
    selectedAgent,
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
    setSubmitting,
    setSubmitError,
    clearSubmitError,
    setDisplayName,
    setAgentId,
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

function twoDigit(value: number) {
  return String(Math.trunc(value)).padStart(2, "0");
}

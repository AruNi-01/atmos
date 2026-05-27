"use client";

import React from "react";
import { useQueryState } from "nuqs";
import {
  Button,
  Input,
  Label,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { ArrowLeft, CheckCircle2, LoaderCircle, Workflow } from "lucide-react";

import { AutomationAgentPicker } from "@/features/automations/components/AutomationAgentPicker";
import { AutomationEnvironmentPicker } from "@/features/automations/components/AutomationEnvironmentPicker";
import { AutomationTriggerPicker } from "@/features/automations/components/AutomationTriggerPicker";
import {
  buildTargetInput,
  flattenWorkspaces,
  resolveTimezone,
} from "@/features/automations/lib/automation-format";
import {
  buildScheduleInput,
  parseSchedule,
  validationMessage,
  type TriggerChoice,
} from "@/features/automations/lib/automation-schedule";
import {
  createAutomationWithGithubRoute,
  triggerInputForSubmit,
  updateAutomationWithGithubRoute,
} from "@/features/automations/lib/github-route-lifecycle";
import { useGithubTriggerSetup } from "@/features/automations/hooks/use-github-trigger-setup";
import type {
  AutomationAgentCapability,
  AutomationCreateRequest,
  AutomationDetail,
  AutomationScheduleInput,
  AutomationSchedulePreviewResponse,
  AutomationTargetKind,
  AutomationUpdateRequest,
} from "@/features/automations/types";
import {
  PromptComposer,
  type ComposerHandle,
} from "@/features/welcome/components/PromptComposer";
import type { Project } from "@/shared/types/domain";
import { settingsModalParams } from "@/shared/lib/nuqs/searchParams";

export type SetupMode = "create" | "edit";

export function AutomationSetup({
  mode,
  initialAutomation,
  initialAutomationLoading,
  agents,
  agentsLoading,
  projects,
  projectsLoading,
  schedulePreview,
  onCancel,
  onCreate,
  onUpdate,
}: {
  mode: SetupMode;
  initialAutomation: AutomationDetail | null;
  initialAutomationLoading: boolean;
  agents: AutomationAgentCapability[];
  agentsLoading: boolean;
  projects: Project[];
  projectsLoading: boolean;
  schedulePreview: (
    schedule: AutomationScheduleInput,
    timezone: string,
    count?: number,
  ) => Promise<AutomationSchedulePreviewResponse>;
  onCancel: () => void;
  onCreate: (request: AutomationCreateRequest) => Promise<AutomationDetail>;
  onUpdate: (request: AutomationUpdateRequest) => Promise<AutomationDetail>;
}) {
  const composerRef = React.useRef<ComposerHandle | null>(null);
  const previewRequestIdRef = React.useRef(0);
  const [, setSettingsModalOpen] = useQueryState("settingsModal", settingsModalParams.settingsModal);
  const [, setActiveSettingTab] = useQueryState("activeSettingTab", settingsModalParams.activeSettingTab);
  const [timezone, setTimezone] = React.useState(resolveTimezone);
  const [displayName, setDisplayName] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [agentId, setAgentId] = React.useState("");
  const [targetKind, setTargetKind] = React.useState<AutomationTargetKind>("standalone");
  const [projectGuid, setProjectGuid] = React.useState<string>("");
  const [workspaceGuid, setWorkspaceGuid] = React.useState<string>("");
  const [trigger, setTrigger] = React.useState<TriggerChoice>("manual");
  const [hour, setHour] = React.useState(9);
  const [minute, setMinute] = React.useState(0);
  const [dayOfWeek, setDayOfWeek] = React.useState(1);
  const [dayOfMonth, setDayOfMonth] = React.useState(1);
  const [cronExpr, setCronExpr] = React.useState("0 9 * * *");
  const [preview, setPreview] = React.useState<AutomationSchedulePreviewResponse | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const workspaces = React.useMemo(() => flattenWorkspaces(projects), [projects]);
  const selectedAgent = agents.find((agent) => agent.agent_id === agentId) ?? null;
  const supportedAgents = agents.filter((agent) => agent.automation_supported);
  const {
    githubPrereqs,
    githubRelayReady,
    githubRouteReady,
    initialGithubConfig,
    githubInstallations,
    githubRepositories,
    githubLoading,
    githubRepositoriesLoading,
    githubError,
    githubInstallationId,
    githubRepositoryFullName,
    githubEventFamily,
    githubPullRequestAction,
    githubBranchFilter,
    githubCommentContains,
    githubSenderLogins,
    githubWorkflowConclusion,
    githubSetupMessage,
    buildGithubConfig,
    startGithubSetup,
    setGithubInstallationId,
    setGithubRepositoryFullName,
    setGithubEventFamily,
    setGithubPullRequestAction,
    setGithubBranchFilter,
    setGithubCommentContains,
    setGithubSenderLogins,
    setGithubWorkflowConclusion,
  } = useGithubTriggerSetup({ mode, initialAutomation, trigger });

  React.useEffect(() => {
    if (mode === "edit" && initialAutomation) {
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
      requestAnimationFrame(() => {
        composerRef.current?.setText(initialAutomation.instructions);
      });
    }
  }, [initialAutomation, mode]);

  React.useEffect(() => {
    if (!agentId && supportedAgents.length > 0) {
      setAgentId(supportedAgents[0]?.agent_id ?? "");
    }
  }, [agentId, supportedAgents]);

  React.useEffect(() => {
    if ((targetKind === "project" || targetKind === "new_workspace") && !projectGuid && projects.length > 0) {
      setProjectGuid(projects[0]?.id ?? "");
    }
    if (targetKind === "workspace" && !workspaceGuid && workspaces.length > 0) {
      setWorkspaceGuid(workspaces[0]?.workspace.id ?? "");
    }
  }, [projectGuid, projects, targetKind, workspaceGuid, workspaces]);

  const targetValid =
    targetKind === "standalone" ||
    ((targetKind === "project" || targetKind === "new_workspace") && projectGuid.trim().length > 0) ||
    (targetKind === "workspace" && workspaceGuid.trim().length > 0);

  const scheduleInput = React.useMemo(
    () => buildScheduleInput(trigger, timezone, hour, minute, dayOfWeek, dayOfMonth, cronExpr),
    [cronExpr, dayOfMonth, dayOfWeek, hour, minute, timezone, trigger],
  );
  const scheduleValid =
    trigger === "manual" ||
    trigger === "github" ||
    (scheduleInput !== null && (trigger !== "cron" || cronExpr.trim().split(/\s+/).length === 5));
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
    const timeout = setTimeout(() => {
      setPreviewLoading(true);
      schedulePreview(scheduleInput, timezone, 5)
        .then((nextPreview) => {
          if (previewRequestIdRef.current !== requestId) return;
          setPreview(nextPreview);
          setPreviewError(null);
        })
        .catch((err) => {
          if (previewRequestIdRef.current !== requestId) return;
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : "Invalid schedule");
        })
        .finally(() => {
          if (previewRequestIdRef.current === requestId) {
            setPreviewLoading(false);
          }
        });
    }, 300);

    return () => clearTimeout(timeout);
  }, [scheduleInput, schedulePreview, timezone, trigger]);

  const formValid =
    displayName.trim().length > 0 &&
    instructions.trim().length > 0 &&
    !!selectedAgent?.automation_supported &&
    targetValid &&
    scheduleValid &&
    (!previewError || trigger === "manual" || trigger === "github");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!formValid || submitting) {
      setSubmitError(validationMessage({
        displayName,
        instructions,
        selectedAgent,
        targetValid,
        scheduleValid,
        previewError,
      }));
      return;
    }

    const target = buildTargetInput(targetKind, projectGuid, workspaceGuid);
    const requestSchedule = trigger === "manual" || trigger === "github" ? null : scheduleInput;
    if (trigger !== "manual" && trigger !== "github" && !requestSchedule) {
      setSubmitError("Choose a valid schedule.");
      return;
    }
    const githubConfig = trigger === "github" ? buildGithubConfig() : null;
    const previousGithubConfig = mode === "edit" ? initialGithubConfig : null;

    setSubmitting(true);
    try {
      if (mode === "create") {
        await createAutomationWithGithubRoute({
          request: {
            display_name: displayName.trim(),
            instructions: instructions.trim(),
            agent_id: agentId,
            target,
            schedule: requestSchedule,
            trigger: triggerInputForSubmit(trigger, githubConfig, false),
          },
          githubConfig,
          githubRouteReady,
          githubPrereqs,
          createAutomation: onCreate,
          updateAutomation: onUpdate,
        });
      } else if (initialAutomation) {
        await updateAutomationWithGithubRoute({
          request: {
            automation_guid: initialAutomation.guid,
            display_name: displayName.trim(),
            instructions: instructions.trim(),
            agent_id: agentId,
            target,
            schedule: requestSchedule,
          },
          initialAutomation,
          trigger,
          previousGithubConfig,
          nextGithubConfig: githubConfig,
          githubRouteReady,
          githubPrereqs,
          updateAutomation: onUpdate,
        });
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save automation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGithubStartSetup = React.useCallback(() => {
    void startGithubSetup(window.location.href);
  }, [startGithubSetup]);

  const handleOpenComputerSettings = React.useCallback(() => {
    void setActiveSettingTab("atmos-computer");
    void setSettingsModalOpen(true);
  }, [setActiveSettingTab, setSettingsModalOpen]);

  if (mode === "edit" && initialAutomationLoading && !initialAutomation) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading automation
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex h-full flex-col overflow-hidden bg-background">
        <div className="border-b border-border px-6 py-4">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <ArrowLeft className="size-4" />
              Automations
            </Button>
            <div className="text-xs text-muted-foreground">{timezone}</div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-8 sm:px-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
            <div className="text-center">
              <div className="mx-auto flex size-11 items-center justify-center rounded-md border border-border bg-muted/30 text-foreground">
                <Workflow className="size-5" />
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {mode === "create" ? "Create Automation" : "Edit Automation"}
              </h1>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                Schedule terminal-agent work on the currently connected Atmos Computer.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-md border border-border bg-background p-4 shadow-xs">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="space-y-2">
                    <Label htmlFor="automation-display-name">Display name</Label>
                    <Input
                      id="automation-display-name"
                      value={displayName}
                      onChange={(event) => {
                        setDisplayName(event.target.value);
                        setSubmitError(null);
                      }}
                      placeholder="Daily repo health"
                      maxLength={80}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Agent</Label>
                    <AutomationAgentPicker
                      agents={agents}
                      loading={agentsLoading}
                      selectedAgentId={agentId}
                      onSelect={setAgentId}
                    />
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="space-y-2">
                  <Label>Agent Instructions</Label>
                  <div className="rounded-md border border-border bg-muted/15 p-3">
                    <PromptComposer
                      ref={composerRef}
                      placeholder={<span>Write the task, desired output, and review expectations.</span>}
                      onTextChange={(text) => {
                        setInstructions(text);
                        setSubmitError(null);
                      }}
                      onSubmit={() => undefined}
                      onImagePaste={() => undefined}
                      onAtTrigger={() => undefined}
                      onAtCancel={() => undefined}
                      onSlashTrigger={() => undefined}
                      onSlashCancel={() => undefined}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <AutomationEnvironmentPicker
                  targetKind={targetKind}
                  projectGuid={projectGuid}
                  workspaceGuid={workspaceGuid}
                  projects={projects}
                  workspaces={workspaces}
                  projectsLoading={projectsLoading}
                  onTargetKindChange={(nextKind) => {
                    setTargetKind(nextKind);
                    setSubmitError(null);
                  }}
                  onProjectGuidChange={setProjectGuid}
                  onWorkspaceGuidChange={setWorkspaceGuid}
                />
                <AutomationTriggerPicker
                  trigger={trigger}
                  hour={hour}
                  minute={minute}
                  dayOfWeek={dayOfWeek}
                  dayOfMonth={dayOfMonth}
                  cronExpr={cronExpr}
                  preview={preview}
                  previewError={previewError}
                  previewLoading={previewLoading}
                  githubRelayReady={githubRelayReady}
                  githubSetupMessage={githubSetupMessage}
                  githubInstallations={githubInstallations}
                  githubRepositories={githubRepositories}
                  githubLoading={githubLoading}
                  githubRepositoriesLoading={githubRepositoriesLoading}
                  githubError={githubError}
                  githubInstallationId={githubInstallationId}
                  githubRepositoryFullName={githubRepositoryFullName}
                  githubEventFamily={githubEventFamily}
                  githubPullRequestAction={githubPullRequestAction}
                  githubBranchFilter={githubBranchFilter}
                  githubCommentContains={githubCommentContains}
                  githubSenderLogins={githubSenderLogins}
                  githubWorkflowConclusion={githubWorkflowConclusion}
                  onTriggerChange={(nextTrigger) => {
                    setTrigger(nextTrigger);
                    setSubmitError(null);
                  }}
                  onHourChange={setHour}
                  onMinuteChange={setMinute}
                  onDayOfWeekChange={setDayOfWeek}
                  onDayOfMonthChange={setDayOfMonth}
                  onCronExprChange={setCronExpr}
                  onGithubStartSetup={handleGithubStartSetup}
                  onGithubOpenComputerSettings={handleOpenComputerSettings}
                  onGithubInstallationChange={(installationId) => {
                    setGithubInstallationId(installationId);
                    setGithubRepositoryFullName("");
                    setSubmitError(null);
                  }}
                  onGithubRepositoryChange={(fullName) => {
                    setGithubRepositoryFullName(fullName);
                    setSubmitError(null);
                  }}
                  onGithubEventFamilyChange={(family) => {
                    setGithubEventFamily(family);
                    setSubmitError(null);
                  }}
                  onGithubPullRequestActionChange={setGithubPullRequestAction}
                  onGithubBranchFilterChange={setGithubBranchFilter}
                  onGithubCommentContainsChange={setGithubCommentContains}
                  onGithubSenderLoginsChange={setGithubSenderLogins}
                  onGithubWorkflowConclusionChange={setGithubWorkflowConclusion}
                />
              </div>

              {submitError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {submitError}
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
                  Cancel
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button type="submit" disabled={!formValid || submitting}>
                        {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                        {mode === "create" ? "Create Automation" : "Update Automation"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {formValid ? "Save automation" : "Complete the required setup fields"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </form>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

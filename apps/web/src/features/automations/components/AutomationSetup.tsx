"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Label, TooltipProvider } from "@workspace/ui";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import {
  useRegisteredAppNavigationGuard,
  type AppNavigationTarget,
} from "@/shared/hooks/app-navigation-intercept";
import { ArrowLeft, Brain, ChevronDown, LoaderCircle, Sparkles } from "lucide-react";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  sanitizeRunConfig,
} from "@/features/agent/lib/terminal-agent-run-config";

import { AutomationAttachmentPreviewDialog } from "@/features/automations/components/AutomationAttachmentPreviewDialog";
import { AutomationMemoryEditor } from "@/features/automations/components/AutomationMemoryEditor";
import { AutomationSetupUnsavedDialog } from "@/features/automations/components/AutomationSetupUnsavedDialog";
import {
  AutomationSetupControls,
  AutomationSetupSubmitButton,
} from "@/features/automations/components/AutomationSetupControls";
import {
  buildTargetInput,
  formatAutomationAgentDisplayName,
} from "@/features/automations/lib/automation-format";
import {
  validationMessage,
} from "@/features/automations/lib/automation-schedule";
import {
  createAutomationWithGithubRoute,
  triggerInputForSubmit,
  updateAutomationWithGithubRoute,
} from "@/features/automations/lib/github-route-lifecycle";
import { useAutomationSetupForm } from "@/features/automations/hooks/use-automation-setup-form";
import { useGithubTriggerSetup } from "@/features/automations/hooks/use-github-trigger-setup";
import type {
  AutomationAgentCapability,
  AutomationCreateRequest,
  AutomationDetail,
  AutomationScheduleInput,
  AutomationSchedulePreviewResponse,
  AutomationUpdateRequest,
} from "@/features/automations/types";
import { type ComposerHandle } from "@/features/welcome/components/PromptComposer";
import {
  type MentionNavItem,
  type MentionPopoverState,
  WelcomeMentionPopover,
} from "@/features/welcome/components/WelcomeMentionPopover";
import { SlashCommandPopover } from "@/features/welcome/components/SlashCommandPopover";
import { WelcomeAgentSelector } from "@/features/welcome/components/WelcomeComposerControls";
import { AttachmentBar } from "@/features/welcome/components/AttachmentBar";
import { PromptComposer } from "@/features/welcome/components/PromptComposer";
import { useWelcomeComposerAttachments } from "@/features/welcome/hooks/use-welcome-composer-attachments";
import { useWelcomeMentionSearch } from "@/features/welcome/hooks/use-welcome-mention-search";
import {
  type WelcomeSlashPopoverState,
  useWelcomeSlashNavigation,
} from "@/features/welcome/hooks/use-welcome-slash-navigation";
import { useWelcomeSlashSearch } from "@/features/welcome/hooks/use-welcome-slash-search";
import {
  blobToBase64,
  resolvePromptPlaceholders,
  type AgentMenuOption,
  type MentionFileCandidate,
} from "@/features/welcome/lib/welcome-page-helpers";
import type { SkillInfo } from "@/api/ws-api";
import { useOpenSettings } from "@/features/settings/lib/open-settings";
import type { Project } from "@/shared/types/domain";

export type SetupMode = "create" | "edit";

export function AutomationSetup({
  mode,
  initialAutomation,
  initialAutomationLoading,
  agents,
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
  const t = useTranslations("automation.setup");
  const router = useAppRouter();
  const composerRef = React.useRef<ComposerHandle | null>(null);
  const {
    attachments,
    clearAttachments,
    handleAttachmentRemove,
    handleImagePaste,
    previewAttachment,
    setPreviewAttachment,
    syncAttachmentPlaceholders,
  } = useWelcomeComposerAttachments(composerRef);
  const openSettings = useOpenSettings();
  const [mentionPopover, setMentionPopover] =
    React.useState<MentionPopoverState>(null);
  const [slashPopover, setSlashPopover] =
    React.useState<WelcomeSlashPopoverState>(null);
  const {
    timezone,
    displayName,
    instructions,
    memory,
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
    ready,
    workspaces,
    agentRunConfigs,
    selectedAgent,
    selectedAgentRunConfig,
    selectedTargetProject,
    targetValid,
    scheduleValid,
    formValid,
    requestSchedule,
    setInstructions,
    setMemory,
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
    setAgentRunConfig,
  } = useAutomationSetupForm({
    mode,
    initialAutomation,
    agents,
    projects,
    schedulePreview,
    clearAttachments,
  });
  const selectedProjectPath = selectedTargetProject?.mainFilePath ?? null;
  const agentOptions = React.useMemo<AgentMenuOption[]>(
    () =>
      agents.map((agent) => ({
        id: agent.agent_id,
        label: agent.label,
        command: "",
        launchCommand: "",
        iconType: "built-in",
        description: agent.automation_supported
          ? t("agentOptions.ready")
          : t("agentOptions.unavailable"),
        disabledReason: agent.automation_supported
          ? null
          : (agent.unavailable_reason ??
            t("agentOptions.unavailableReason")),
      })),
    [agents, t],
  );
  const { filteredAgents, filteredProjects, filteredSkills, isSkillsLoading } =
    useWelcomeSlashSearch({
      availableAgents: agentOptions,
      activeProjectId: selectedTargetProject?.id ?? null,
      popover: slashPopover,
      projects,
    });
  const selectMentionFile = React.useCallback(
    (item: MentionFileCandidate) => {
      const popover = mentionPopover;
      if (!popover) return;
      composerRef.current?.applyMentionAtRange(
        popover.atOffset,
        popover.query.length,
        { kind: "file", relativePath: item.relativePath },
      );
      setMentionPopover(null);
    },
    [mentionPopover],
  );
  const selectMentionNavItem = React.useCallback(
    (item: MentionNavItem) => {
      if (item.type === "file") {
        selectMentionFile(item.file);
      }
    },
    [selectMentionFile],
  );
  const {
    activeMentionFileIndex,
    isMentionFilesLoading,
    mentionFiles,
    mentionPopoverListRef,
    setIsMentionFilesLoading,
    setMentionItemRef,
  } = useWelcomeMentionSearch({
    issuePreview: null,
    onSelectNavItem: selectMentionNavItem,
    popover: mentionPopover,
    prPreview: null,
    selectedProjectPath,
  });
  const selectSlashSkill = React.useCallback(
    (skill: SkillInfo) => {
      const popover = slashPopover;
      if (!popover) return;
      composerRef.current?.applySlashAtRange(
        popover.slashOffset,
        popover.query.length,
        { kind: "skill", absolutePath: skill.path, name: skill.name },
      );
      setSlashPopover(null);
    },
    [slashPopover],
  );
  const selectSlashProject = React.useCallback(
    (project: { id: string }) => {
      const popover = slashPopover;
      if (!popover) return;
      setSlashPopover(null);
      composerRef.current?.removeSlashAtRange(
        popover.slashOffset,
        popover.query.length,
      );
      setTargetKind("project");
      setProjectGuid(project.id);
      setWorkspaceGuid("");
      setSubmitError(null);
    },
    [slashPopover, setProjectGuid, setSubmitError, setTargetKind, setWorkspaceGuid],
  );
  const selectSlashAgent = React.useCallback(
    (agent: AgentMenuOption) => {
      const popover = slashPopover;
      if (!popover) return;
      setSlashPopover(null);
      composerRef.current?.removeSlashAtRange(
        popover.slashOffset,
        popover.query.length,
      );
      setAgentId(agent.id);
      setSubmitError(null);
    },
    [slashPopover, setAgentId, setSubmitError],
  );
  const {
    activeIndex: activeSlashItemIndex,
    expandedSections,
    listRef: slashPopoverListRef,
    setExpandedSections,
    setItemRef: setSlashItemRef,
  } = useWelcomeSlashNavigation({
    filteredAgents,
    filteredProjects,
    filteredSkills,
    onSelectAgent: selectSlashAgent,
    onSelectProject: selectSlashProject,
    onSelectSkill: selectSlashSkill,
    popover: slashPopover,
  });
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
    githubSetupRefreshAvailable,
    githubInstallationId,
    githubRepositoryFullName,
    githubEventFamily,
    githubIssueAction,
    githubIssueLabel,
    githubPullRequestAction,
    githubBranchFilter,
    githubCommentContains,
    githubSenderLogins,
    githubWorkflowName,
    githubWorkflowConclusion,
    githubSetupMessage,
    buildGithubConfig,
    refreshGithubInstallations,
    startGithubSetup,
    setGithubInstallationId,
    setGithubRepositoryFullName,
    setGithubEventFamily,
    setGithubIssueAction,
    setGithubIssueLabel,
    setGithubPullRequestAction,
    setGithubBranchFilter,
    setGithubCommentContains,
    setGithubSenderLogins,
    setGithubWorkflowName,
    setGithubWorkflowConclusion,
  } = useGithubTriggerSetup({ mode, initialAutomation, trigger });

  React.useEffect(() => {
    if (mode === "edit" && initialAutomation) {
      window.requestAnimationFrame(() => {
        composerRef.current?.setText(initialAutomation.instructions);
      });
    }
  }, [initialAutomation, mode]);

  const setupSnapshot = React.useMemo(
    () =>
      JSON.stringify({
        displayName,
        instructions,
        memory,
        agentId,
        targetKind,
        projectGuid,
        workspaceGuid,
        trigger,
        timezone,
        hour,
        minute,
        dayOfWeek,
        dayOfMonth,
        cronExpr,
        agentRunConfig: sanitizeRunConfig(selectedAgentRunConfig),
        attachmentIds: attachments.map((attachment) => attachment.id),
        github:
          trigger === "github"
            ? {
                githubInstallationId,
                githubRepositoryFullName,
                githubEventFamily,
                githubIssueAction,
                githubIssueLabel,
                githubPullRequestAction,
                githubBranchFilter,
                githubCommentContains,
                githubSenderLogins,
                githubWorkflowName,
                githubWorkflowConclusion,
              }
            : null,
      }),
    [
      agentId,
      attachments,
      cronExpr,
      dayOfMonth,
      dayOfWeek,
      displayName,
      githubBranchFilter,
      githubCommentContains,
      githubEventFamily,
      githubInstallationId,
      githubIssueAction,
      githubIssueLabel,
      githubPullRequestAction,
      githubRepositoryFullName,
      githubSenderLogins,
      githubWorkflowConclusion,
      githubWorkflowName,
      hour,
      instructions,
      memory,
      minute,
      projectGuid,
      selectedAgentRunConfig,
      targetKind,
      timezone,
      trigger,
      workspaceGuid,
    ],
  );
  const baselineRef = React.useRef<string | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  const pendingLeaveRef = React.useRef<{
    discard: () => void;
    afterSave: () => void;
  } | null>(null);
  const bypassNavRef = React.useRef(false);
  const isDirtyRef = React.useRef(false);
  const allowPopStateLeaveRef = React.useRef(false);

  React.useEffect(() => {
    if (!ready) return;
    if (mode === "create" && !agentId) return;
    if (baselineRef.current === null) {
      baselineRef.current = setupSnapshot;
    }
  }, [agentId, mode, ready, setupSnapshot]);

  const isDirty =
    baselineRef.current !== null && baselineRef.current !== setupSnapshot;
  isDirtyRef.current = isDirty;

  const requestLeave = React.useCallback(
    (actions: { discard: () => void; afterSave?: () => void }) => {
      if (!isDirtyRef.current) {
        actions.discard();
        return;
      }
      pendingLeaveRef.current = {
        discard: actions.discard,
        afterSave: actions.afterSave ?? (() => undefined),
      };
      setLeaveDialogOpen(true);
    },
    [],
  );

  const resumeNavigation = React.useCallback(
    (target: AppNavigationTarget) => {
      bypassNavRef.current = true;
      if (target.kind === "replace") {
        router.replace(target.path);
      } else {
        router.push(target.path);
      }
      bypassNavRef.current = false;
    },
    [router],
  );

  const navigationGuard = React.useCallback(
    (target: AppNavigationTarget) => {
      if (bypassNavRef.current || !isDirtyRef.current) {
        return false;
      }
      requestLeave({
        discard: () => resumeNavigation(target),
        afterSave: () => resumeNavigation(target),
      });
      return true;
    },
    [requestLeave, resumeNavigation],
  );
  useRegisteredAppNavigationGuard(navigationGuard);

  React.useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  React.useEffect(() => {
    if (!isDirty) return;
    window.history.pushState({ automationSetupGuard: true }, "", window.location.href);
    const handlePopState = () => {
      if (allowPopStateLeaveRef.current || !isDirtyRef.current) {
        return;
      }
      window.history.pushState({ automationSetupGuard: true }, "", window.location.href);
      requestLeave({
        discard: () => {
          allowPopStateLeaveRef.current = true;
          window.history.back();
        },
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty, requestLeave]);

  const saveAutomation = async () => {
    setSubmitError(null);

    const githubTriggerValid = trigger !== "github" || githubRouteReady;
    if (!formValid || !githubTriggerValid || submitting) {
      setSubmitError(
        githubTriggerValid
          ? validationMessage({
              displayName,
              instructions,
              selectedAgent,
              targetValid,
              scheduleValid,
              previewError,
            })
          : t("errors.githubFiltersRequired"),
      );
      return false;
    }

    const target = buildTargetInput(targetKind, projectGuid, workspaceGuid);
    if (trigger !== "manual" && trigger !== "github" && !requestSchedule) {
      setSubmitError(t("errors.invalidSchedule"));
      return false;
    }
    const githubConfig = trigger === "github" ? buildGithubConfig() : null;
    const previousGithubConfig = mode === "edit" ? initialGithubConfig : null;

    setSubmitting(true);
    try {
      const rawInstructions = composerRef.current?.getText() ?? instructions;
      const resolvedInstructions = resolvePromptPlaceholders(
        rawInstructions,
        [],
        {
          preserveFileMentions: true,
        },
      );
      const attachmentPayload = await Promise.all(
        attachments.map(async (attachment) => ({
          filename: attachment.filename,
          mime: attachment.blob.type || "application/octet-stream",
          data_base64: await blobToBase64(attachment.blob),
        })),
      );
      let savedAutomation: AutomationDetail | null = null;

      if (mode === "create") {
        savedAutomation = await createAutomationWithGithubRoute({
          request: {
            display_name: displayName.trim(),
            instructions: resolvedInstructions.trim(),
            memory,
            agent_id: agentId,
            agent_config: sanitizeRunConfig(selectedAgentRunConfig),
            target,
            schedule: requestSchedule,
            trigger: triggerInputForSubmit(trigger, githubConfig, false),
            attachments: attachmentPayload,
          },
          githubConfig,
          githubRouteReady,
          githubPrereqs,
          createAutomation: onCreate,
          updateAutomation: onUpdate,
        });
      } else if (initialAutomation) {
        savedAutomation = await updateAutomationWithGithubRoute({
          request: {
            automation_guid: initialAutomation.guid,
            display_name: displayName.trim(),
            instructions: resolvedInstructions.trim(),
            memory,
            agent_id: agentId,
            agent_config: sanitizeRunConfig(selectedAgentRunConfig),
            target,
            schedule: requestSchedule,
            attachments: attachmentPayload,
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
      if (savedAutomation) {
        setInstructions(savedAutomation.instructions);
        setMemory(savedAutomation.memory ?? "");
        composerRef.current?.setText(savedAutomation.instructions);
        baselineRef.current = null;
        isDirtyRef.current = false;
      }
      clearAttachments();
      return Boolean(savedAutomation);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("errors.saveFailed"),
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveAutomation();
  };

  const handleBack = () => {
    requestLeave({ discard: onCancel });
  };

  const handleStay = () => {
    setLeaveDialogOpen(false);
    pendingLeaveRef.current = null;
  };

  const handleDiscard = () => {
    const pending = pendingLeaveRef.current;
    isDirtyRef.current = false;
    baselineRef.current = setupSnapshot;
    setLeaveDialogOpen(false);
    pendingLeaveRef.current = null;
    pending?.discard();
  };

  const handleSaveAndLeave = async () => {
    const pending = pendingLeaveRef.current;
    const saved = await saveAutomation();
    if (!saved) {
      setLeaveDialogOpen(false);
      pendingLeaveRef.current = null;
      return;
    }
    setLeaveDialogOpen(false);
    pendingLeaveRef.current = null;
    pending?.afterSave();
  };

  const handleGithubStartSetup = React.useCallback(() => {
    void startGithubSetup();
  }, [startGithubSetup]);

  const handleOpenComputerSettings = React.useCallback(() => {
    openSettings("atmos-computer");
  }, [openSettings]);

  if (mode === "edit" && initialAutomationLoading && !initialAutomation) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  const disabledSubmit =
    !formValid || (trigger === "github" && !githubRouteReady) || submitting;
  const placeholder = selectedAgent?.label
    ? t("placeholder.withAgent", { agentName: selectedAgent.label })
    : t("placeholder.default");

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full overflow-auto bg-background">
        <div className="mx-auto flex w-full max-w-3xl flex-col px-5 py-6 sm:px-8 sm:py-8">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={submitting}
            className="-ml-2 w-fit gap-2"
          >
            <ArrowLeft className="size-4" />
            {t("backButton")}
          </Button>

          <header className="mt-5 mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {mode === "create" ? t("title.create") : t("title.edit")}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === "create" ? t("subtitle.create") : t("subtitle.edit")}
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-8 pb-10">
            <AutomationSetupControls
              displayName={displayName}
              submitError={null}
              onDisplayNameChange={(value) => {
                setDisplayName(value);
                clearSubmitError();
              }}
              environmentPickerProps={{
                targetKind,
                projectGuid,
                workspaceGuid,
                projects,
                workspaces,
                projectsLoading,
                onTargetKindChange: (nextKind) => {
                  setTargetKind(nextKind);
                  clearSubmitError();
                },
                onProjectGuidChange: (guid) => {
                  setProjectGuid(guid);
                  clearSubmitError();
                },
                onWorkspaceGuidChange: (guid) => {
                  setWorkspaceGuid(guid);
                  clearSubmitError();
                },
              }}
              triggerPickerProps={{
                trigger,
                timezone,
                hour,
                minute,
                dayOfWeek,
                dayOfMonth,
                cronExpr,
                preview,
                previewError,
                previewLoading,
                githubRelayReady,
                githubSetupMessage,
                githubInstallations,
                githubRepositories,
                githubLoading,
                githubRepositoriesLoading,
                githubError,
                githubSetupRefreshAvailable,
                githubInstallationId,
                githubRepositoryFullName,
                githubEventFamily,
                githubIssueAction,
                githubIssueLabel,
                githubPullRequestAction,
                githubBranchFilter,
                githubCommentContains,
                githubSenderLogins,
                githubWorkflowName,
                githubWorkflowConclusion,
                onTriggerChange: (nextTrigger) => {
                  setTrigger(nextTrigger);
                  clearSubmitError();
                },
                onTimezoneChange: (nextTimezone) => {
                  setTimezone(nextTimezone);
                  clearSubmitError();
                },
                onHourChange: setHour,
                onMinuteChange: setMinute,
                onDayOfWeekChange: setDayOfWeek,
                onDayOfMonthChange: setDayOfMonth,
                onCronExprChange: setCronExpr,
                onGithubStartSetup: handleGithubStartSetup,
                onGithubRefreshInstallations: refreshGithubInstallations,
                onGithubOpenComputerSettings: handleOpenComputerSettings,
                onGithubInstallationChange: (installationId) => {
                  setGithubInstallationId(installationId);
                  setGithubRepositoryFullName("");
                  clearSubmitError();
                },
                onGithubRepositoryChange: (fullName) => {
                  setGithubRepositoryFullName(fullName);
                  clearSubmitError();
                },
                onGithubEventFamilyChange: (family) => {
                  setGithubEventFamily(family);
                  if (family === "issues") {
                    setGithubIssueAction("labeled");
                  }
                  clearSubmitError();
                },
                onGithubIssueActionChange: setGithubIssueAction,
                onGithubIssueLabelChange: setGithubIssueLabel,
                onGithubPullRequestActionChange:
                  setGithubPullRequestAction,
                onGithubBranchFilterChange: setGithubBranchFilter,
                onGithubCommentContainsChange: setGithubCommentContains,
                onGithubSenderLoginsChange: setGithubSenderLogins,
                onGithubWorkflowNameChange: setGithubWorkflowName,
                onGithubWorkflowConclusionChange:
                  setGithubWorkflowConclusion,
              }}
            />

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold text-foreground">
                    {t("instructions.label")}
                  </Label>
                </div>
                <WelcomeAgentSelector
                  variant="menu"
                  availableAgents={agentOptions}
                  selectedAgentId={agentId}
                  runConfigByAgentId={agentRunConfigs}
                  onRunConfigChange={(nextAgentId, nextValue) => {
                    setAgentRunConfig(nextAgentId, nextValue);
                    setAgentId(nextAgentId);
                    clearSubmitError();
                  }}
                  purpose="automation"
                  trigger={
                    <button
                      type="button"
                      className="inline-flex h-8 max-w-[24rem] items-center gap-2 rounded-md border border-border bg-background px-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      {selectedAgent ? (
                        <AgentIcon
                          registryId={selectedAgent.agent_id}
                          name={selectedAgent.label}
                          size={16}
                        />
                      ) : null}
                      <span className="truncate">
                        {selectedAgent
                          ? formatAutomationAgentDisplayName(
                              selectedAgent.label,
                              selectedAgentRunConfig,
                            )
                          : t("agentOptions.select")}
                      </span>
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  }
                  onSelectAgent={(nextAgentId) => {
                    setAgentId(nextAgentId);
                    clearSubmitError();
                  }}
                />
              </div>
              <div className="relative overflow-visible rounded-lg border border-border bg-background">
                <div className="px-3 pt-2">
                  <PromptComposer
                    ref={composerRef}
                    placeholder={<span>{placeholder}</span>}
                    editorClassName="min-h-[160px] max-h-[280px] rounded-none border-0 py-2"
                    onTextChange={(text) => {
                      setInstructions(text);
                      clearSubmitError();
                      setMentionPopover((prev) => {
                        if (!prev) return prev;
                        if (text.length < prev.atOffset) return null;
                        if (text.charAt(prev.atOffset - 1) !== "@") return null;
                        const newQuery = text.slice(prev.atOffset);
                        const spaceIdx = newQuery.search(/\s/);
                        if (spaceIdx >= 0) return null;
                        return newQuery === prev.query
                          ? prev
                          : { ...prev, query: newQuery };
                      });
                      syncAttachmentPlaceholders(text);
                    }}
                    onImagePaste={handleImagePaste}
                    onAtCancel={() => {
                      setMentionPopover(null);
                      setIsMentionFilesLoading(false);
                    }}
                    onAtTrigger={(ctx) => {
                      setMentionPopover({
                        top: ctx.caretRect.bottom + 4,
                        left: ctx.caretRect.left,
                        atOffset: ctx.atOffset,
                        query: ctx.query,
                      });
                    }}
                    onSlashCancel={() => {
                      setSlashPopover(null);
                      setExpandedSections({
                        skills: false,
                        projects: false,
                        agents: false,
                      });
                    }}
                    onSlashTrigger={(ctx) => {
                      setSlashPopover({
                        top: ctx.caretRect.bottom + 4,
                        left: ctx.caretRect.left,
                        slashOffset: ctx.slashOffset,
                        query: ctx.query,
                      });
                    }}
                  />
                </div>
                {attachments.length > 0 ? (
                  <div className="border-t border-border px-3 py-2">
                    <AttachmentBar
                      attachments={attachments}
                      onRemove={handleAttachmentRemove}
                      onPreview={(attachment) => setPreviewAttachment(attachment)}
                    />
                  </div>
                ) : null}
                <WelcomeMentionPopover
                  activeIndex={activeMentionFileIndex}
                  issuePreview={null}
                  isLoading={isMentionFilesLoading}
                  listRef={mentionPopoverListRef}
                  mentionFiles={mentionFiles}
                  onClose={() => setMentionPopover(null)}
                  onSelectFile={selectMentionFile}
                  onSelectNavItem={selectMentionNavItem}
                  onSetItemRef={setMentionItemRef}
                  popover={mentionPopover}
                  prPreview={null}
                />
                <SlashCommandPopover
                  activeIndex={activeSlashItemIndex}
                  expandedSections={expandedSections}
                  filteredAgents={filteredAgents}
                  filteredProjects={filteredProjects}
                  filteredSkills={filteredSkills}
                  isSkillsLoading={isSkillsLoading}
                  listRef={slashPopoverListRef}
                  onClose={() => setSlashPopover(null)}
                  onSelectAgent={selectSlashAgent}
                  onSelectProject={selectSlashProject}
                  onSelectSkill={selectSlashSkill}
                  popover={slashPopover}
                  setExpandedSections={setExpandedSections}
                  setItemRef={setSlashItemRef}
                />
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <Brain className="size-4 text-muted-foreground" />
                  <Label className="text-sm font-semibold text-foreground">
                    {t("memory.label")}
                  </Label>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("memory.description")}
                </p>
              </div>
              <AutomationMemoryEditor
                compact
                defaultPreview={mode !== "create"}
                value={memory}
                onChange={(next) => {
                  setMemory(next);
                  clearSubmitError();
                }}
                path={initialAutomation?.memory_path}
                disabled={submitting}
              />
            </section>

            {submitError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {submitError}
              </div>
            ) : null}

            <div className="flex justify-end">
              <AutomationSetupSubmitButton
                mode={mode}
                disabledSubmit={disabledSubmit}
                isSubmitting={submitting}
              />
            </div>
          </form>
        </div>
        <AutomationAttachmentPreviewDialog
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
        <AutomationSetupUnsavedDialog
          open={leaveDialogOpen}
          mode={mode}
          saving={submitting}
          onStay={handleStay}
          onDiscard={handleDiscard}
          onSave={() => {
            void handleSaveAndLeave();
          }}
        />
      </div>
    </TooltipProvider>
  );
}

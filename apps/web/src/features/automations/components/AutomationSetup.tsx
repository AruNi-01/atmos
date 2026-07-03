"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { Button, TooltipProvider } from "@workspace/ui";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import {
  sanitizeRunConfig,
} from "@/features/agent/lib/terminal-agent-run-config";

import { AutomationAttachmentPreviewDialog } from "@/features/automations/components/AutomationAttachmentPreviewDialog";
import {
  AutomationSetupControls,
  AutomationSetupSubmitButton,
} from "@/features/automations/components/AutomationSetupControls";
import { buildTargetInput } from "@/features/automations/lib/automation-format";
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
import { WelcomeComposerCard } from "@/features/welcome/components/WelcomeComposerCard";
import { WelcomePageBackdrop } from "@/features/welcome/components/WelcomePageShell";
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
import { AtmosWordmark } from "@/shared/components/ui/AtmosWordmark";
import type { Project } from "@/shared/types/domain";
import { settingsModalParams } from "@/shared/lib/nuqs/searchParams";

export type SetupMode = "create" | "edit";

type AutomationHeadline =
  | "automate_next"
  | "run_on_schedule"
  | "handle_later"
  | "keep_running";

const AUTOMATION_HEADLINES: AutomationHeadline[] = [
  "automate_next",
  "run_on_schedule",
  "handle_later",
  "keep_running",
];
const DEFAULT_AUTOMATION_HEADLINE: AutomationHeadline = "automate_next";
const DAY_LABEL_KEYS: Record<number, string> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

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
  const [, setSettingsModalOpen] = useQueryState(
    "settingsModal",
    settingsModalParams.settingsModal,
  );
  const [, setActiveSettingTab] = useQueryState(
    "activeSettingTab",
    settingsModalParams.activeSettingTab,
  );
  const [headline, setHeadline] = React.useState<AutomationHeadline>(
    DEFAULT_AUTOMATION_HEADLINE,
  );
  const [mentionPopover, setMentionPopover] =
    React.useState<MentionPopoverState>(null);
  const [slashPopover, setSlashPopover] =
    React.useState<WelcomeSlashPopoverState>(null);
  const {
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
    agentRunConfigs,
    selectedAgent,
    selectedAgentRunConfig,
    selectedTargetProject,
    targetValid,
    environmentLabel,
    scheduleInput,
    scheduleValid,
    triggerValid,
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
    resetGithubSetupButton,
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
    const nextHeadline =
      AUTOMATION_HEADLINES[
        Math.floor(Math.random() * AUTOMATION_HEADLINES.length)
      ] ?? DEFAULT_AUTOMATION_HEADLINE;
    setHeadline(nextHeadline);
  }, []);

  React.useEffect(() => {
    if (mode === "edit" && initialAutomation) {
      window.requestAnimationFrame(() => {
        composerRef.current?.setText(initialAutomation.instructions);
      });
    }
  }, [initialAutomation, mode]);
  const wordmark = (
    <span className="inline-flex items-center">
      <AtmosWordmark
        className="gap-0"
        logoClassName="size-10 sm:size-12 md:size-14"
        letterClassName="text-4xl sm:text-5xl md:text-6xl leading-none font-semibold"
        sloganClassName="hidden"
      />
    </span>
  );
  const headlineContent = React.useMemo(() => {
    switch (headline) {
      case "automate_next":
        return t.rich("headlines.automateNext", { wordmark: () => wordmark });
      case "run_on_schedule":
        return t.rich("headlines.runOnSchedule", { wordmark: () => wordmark });
      case "handle_later":
        return t.rich("headlines.handleLater", { wordmark: () => wordmark });
      case "keep_running":
        return t.rich("headlines.keepRunning", { wordmark: () => wordmark });
    }
  }, [headline, t, wordmark]);
  const triggerLabel = React.useMemo(() => {
    const time = `${twoDigit(hour)}:${twoDigit(minute)}`;

    switch (trigger) {
      case "manual":
        return t("triggerLabel.manual");
      case "github":
        return githubRepositoryFullName
          ? t("triggerLabel.githubWithRepository", { repositoryFullName: githubRepositoryFullName })
          : t("triggerLabel.github");
      case "hourly":
        return t("triggerLabel.hourly", { minute: twoDigit(minute), timezone });
      case "daily":
        return t("triggerLabel.daily", { time, timezone });
      case "weekly": {
        const dayLabel = t(`days.${DAY_LABEL_KEYS[dayOfWeek] ?? "weekday"}`);
        return t("triggerLabel.weekly", { dayLabel, time, timezone });
      }
      case "monthly":
        return t("triggerLabel.monthly", { dayOfMonth, time, timezone });
      case "cron":
        return cronExpr.trim()
          ? t("triggerLabel.cron", { cronExpr: cronExpr.trim(), timezone })
          : t("triggerLabel.cronFallback", { timezone });
    }
  }, [
    cronExpr,
    dayOfMonth,
    dayOfWeek,
    githubRepositoryFullName,
    hour,
    minute,
    t,
    timezone,
    trigger,
  ]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      return;
    }

    const target = buildTargetInput(targetKind, projectGuid, workspaceGuid);
    if (trigger !== "manual" && trigger !== "github" && !requestSchedule) {
      setSubmitError(t("errors.invalidSchedule"));
      return;
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
        composerRef.current?.setText(savedAutomation.instructions);
      }
      clearAttachments();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("errors.saveFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGithubStartSetup = React.useCallback(() => {
    void startGithubSetup();
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
      <div className="relative h-full overflow-auto bg-background px-4 py-8 selection:bg-foreground/10 sm:px-6">
        <WelcomePageBackdrop />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
          className="absolute left-4 top-4 z-20 gap-2 sm:left-6"
        >
          <ArrowLeft className="size-4" />
          {t("backButton")}
        </Button>

        <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center py-8 sm:-translate-y-8 md:-translate-y-16">
          <div className="mb-10 flex w-full max-w-4xl flex-col items-center">
            <h1 className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
              {headlineContent}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="w-full max-w-4xl">
            <div className="relative">
              <WelcomeAgentSelector
                availableAgents={agentOptions}
                selectedAgentId={agentId}
                runConfigByAgentId={agentRunConfigs}
                onRunConfigChange={(nextAgentId, nextValue) => {
                  setAgentRunConfig(nextAgentId, nextValue);
                  setAgentId(nextAgentId);
                  clearSubmitError();
                }}
                purpose="automation"
                onSelectAgent={(nextAgentId) => {
                  setAgentId(nextAgentId);
                  clearSubmitError();
                }}
              />
              <WelcomeComposerCard
                attachments={attachments}
                composerRef={composerRef}
                disabledSubmit={disabledSubmit}
                isInitialProjectsLoading={projectsLoading}
                isSubmitting={submitting}
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
                onAttachmentPreview={(attachment) =>
                  setPreviewAttachment(attachment)
                }
                onAttachmentRemove={handleAttachmentRemove}
                onImagePaste={handleImagePaste}
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
                placeholder={<span>{placeholder}</span>}
                controls={
                  <AutomationSetupSubmitButton
                    mode={mode}
                    disabledSubmit={disabledSubmit}
                    isSubmitting={submitting}
                  />
                }
                footer={
                  <AutomationSetupControls
                    displayName={displayName}
                    displayNameValid={displayName.trim().length > 0}
                    environmentLabel={environmentLabel}
                    environmentValid={targetValid}
                    triggerLabel={triggerLabel}
                    triggerValid={triggerValid}
                    submitError={submitError}
                    onDisplayNameChange={(value) => {
                      setDisplayName(value);
                      clearSubmitError();
                    }}
                    onTriggerOpenChange={(open) => {
                      if (!open) {
                        resetGithubSetupButton();
                      }
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
                }
              />
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
              <AutomationAttachmentPreviewDialog
                attachment={previewAttachment}
                onClose={() => setPreviewAttachment(null)}
              />
            </div>
          </form>
        </div>
      </div>
    </TooltipProvider>
  );
}

function twoDigit(value: number) {
  return String(Math.trunc(value)).padStart(2, "0");
}

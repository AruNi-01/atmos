"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { Button, TooltipProvider } from "@workspace/ui";
import { ArrowLeft, LoaderCircle } from "lucide-react";

import { AutomationAttachmentPreviewDialog } from "@/features/automations/components/AutomationAttachmentPreviewDialog";
import {
  AutomationSetupControls,
  AutomationSetupSubmitButton,
} from "@/features/automations/components/AutomationSetupControls";
import { buildTargetInput } from "@/features/automations/lib/automation-format";
import {
  DAY_OPTIONS,
  validationMessage,
  type TriggerChoice,
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
    selectedAgent,
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
          ? "Ready for non-interactive runs"
          : agent.unavailable_reason,
        disabledReason: agent.automation_supported
          ? null
          : (agent.unavailable_reason ??
            "Agent is not available for automations."),
      })),
    [agents],
  );
  const selectedAgentOption = agentOptions.find(
    (agent) => agent.id === agentId,
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
  const selectSlashProject = React.useCallback((project: { id: string }) => {
    setTargetKind("project");
    setProjectGuid(project.id);
    setWorkspaceGuid("");
    setSubmitError(null);
    setSlashPopover(null);
  }, []);
  const selectSlashAgent = React.useCallback((agent: AgentMenuOption) => {
    setAgentId(agent.id);
    setSubmitError(null);
    setSlashPopover(null);
  }, []);
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
  const triggerLabel = React.useMemo(() => {
    return formatTriggerControlLabel({
      trigger,
      timezone,
      hour,
      minute,
      dayOfWeek,
      dayOfMonth,
      cronExpr,
      githubRepositoryFullName,
    });
  }, [
    cronExpr,
    dayOfMonth,
    dayOfWeek,
    githubRepositoryFullName,
    hour,
    minute,
    timezone,
    trigger,
  ]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (!formValid || submitting) {
      setSubmitError(
        validationMessage({
          displayName,
          instructions,
          selectedAgent,
          targetValid,
          scheduleValid,
          previewError,
        }),
      );
      return;
    }

    const target = buildTargetInput(targetKind, projectGuid, workspaceGuid);
    if (trigger !== "manual" && trigger !== "github" && !requestSchedule) {
      setSubmitError("Choose a valid schedule.");
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
        err instanceof Error ? err.message : "Failed to save automation",
      );
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

  const disabledSubmit = !formValid || submitting;
  const placeholder = selectedAgent?.label
    ? `What should ${selectedAgent.label} do when this automation runs?`
    : "What should this automation do when it runs?";

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
          Automations
        </Button>

        <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center py-8 sm:-translate-y-6 md:-translate-y-12">
          <div className="mb-10 flex w-full max-w-4xl flex-col items-center">
            <h1 className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
              {renderAutomationHeadline(headline)}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="w-full max-w-4xl">
            <div className="relative">
              <WelcomeAgentSelector
                availableAgents={agentOptions}
                selectedAgent={selectedAgentOption}
                selectedAgentId={agentId}
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
                      githubInstallationId,
                      githubRepositoryFullName,
                      githubEventFamily,
                      githubPullRequestAction,
                      githubBranchFilter,
                      githubCommentContains,
                      githubSenderLogins,
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
                        clearSubmitError();
                      },
                      onGithubPullRequestActionChange:
                        setGithubPullRequestAction,
                      onGithubBranchFilterChange: setGithubBranchFilter,
                      onGithubCommentContainsChange: setGithubCommentContains,
                      onGithubSenderLoginsChange: setGithubSenderLogins,
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

function renderAutomationHeadline(
  headline: AutomationHeadline,
): React.ReactNode {
  const logo = (
    <span className="inline-flex items-center">
      <AtmosWordmark
        className="gap-0"
        logoClassName="size-10 sm:size-12 md:size-14"
        letterClassName="text-4xl sm:text-5xl md:text-6xl leading-none font-semibold"
        sloganClassName="hidden"
      />
    </span>
  );

  switch (headline) {
    case "automate_next":
      return (
        <>
          <span>What should</span>
          {logo}
          <span className="whitespace-nowrap">automate next?</span>
        </>
      );
    case "run_on_schedule":
      return (
        <>
          <span>What should</span>
          {logo}
          <span className="whitespace-nowrap">run on schedule?</span>
        </>
      );
    case "handle_later":
      return (
        <>
          <span>What should</span>
          {logo}
          <span className="whitespace-nowrap">handle later?</span>
        </>
      );
    case "keep_running":
      return (
        <>
          <span>What should</span>
          {logo}
          <span className="whitespace-nowrap">keep running?</span>
        </>
      );
  }
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

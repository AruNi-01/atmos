"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useQueryState } from "nuqs";
import {
  Button,
  TooltipProvider,
} from "@workspace/ui";
import { ArrowLeft, LoaderCircle } from "lucide-react";

import {
  AutomationSetupControls,
  AutomationSetupSubmitButton,
} from "@/features/automations/components/AutomationSetupControls";
import {
  buildTargetInput,
  flattenWorkspaces,
  resolveTimezone,
} from "@/features/automations/lib/automation-format";
import {
  buildScheduleInput,
  DAY_OPTIONS,
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
  type ComposerHandle,
} from "@/features/welcome/components/PromptComposer";
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
  const [headline, setHeadline] = React.useState<AutomationHeadline>(DEFAULT_AUTOMATION_HEADLINE);
  const [mentionPopover, setMentionPopover] = React.useState<MentionPopoverState>(null);
  const [slashPopover, setSlashPopover] = React.useState<WelcomeSlashPopoverState>(null);

  const workspaces = React.useMemo(() => flattenWorkspaces(projects), [projects]);
  const selectedAgent = agents.find((agent) => agent.agent_id === agentId) ?? null;
  const supportedAgents = agents.filter((agent) => agent.automation_supported);
  const selectedTargetProject = React.useMemo(() => {
    if (targetKind === "project" || targetKind === "new_workspace") {
      return projects.find((project) => project.id === projectGuid) ?? null;
    }
    if (targetKind === "workspace") {
      return workspaces.find((item) => item.workspace.id === workspaceGuid)?.project ?? null;
    }
    return null;
  }, [projectGuid, projects, targetKind, workspaceGuid, workspaces]);
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
          : agent.unavailable_reason ?? "Agent is not available for automations.",
      })),
    [agents],
  );
  const selectedAgentOption = agentOptions.find((agent) => agent.id === agentId);
  const {
    filteredAgents,
    filteredProjects,
    filteredSkills,
    isSkillsLoading,
  } = useWelcomeSlashSearch({
    availableAgents: agentOptions,
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
      setTargetKind("project");
      setProjectGuid(project.id);
      setWorkspaceGuid("");
      setSubmitError(null);
      setSlashPopover(null);
    },
    [],
  );
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
      AUTOMATION_HEADLINES[Math.floor(Math.random() * AUTOMATION_HEADLINES.length)] ??
      DEFAULT_AUTOMATION_HEADLINE;
    setHeadline(nextHeadline);
  }, []);

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
      requestAnimationFrame(() => {
        composerRef.current?.setText(initialAutomation.instructions);
      });
    }
  }, [clearAttachments, initialAutomation, mode]);

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

  const environmentLabel = React.useMemo(() => {
    if (targetKind === "standalone") {
      return "Standalone";
    }
    if (targetKind === "project") {
      return projects.find((project) => project.id === projectGuid)?.name ?? "Project";
    }
    if (targetKind === "new_workspace") {
      const projectName = projects.find((project) => project.id === projectGuid)?.name;
      return projectName ? `New workspace / ${projectName}` : "New Workspace";
    }
    const selectedWorkspace = workspaces.find(({ workspace }) => workspace.id === workspaceGuid);
    return selectedWorkspace
      ? `${selectedWorkspace.workspace.displayName || selectedWorkspace.workspace.name} / ${selectedWorkspace.project.name}`
      : "Workspace";
  }, [projectGuid, projects, targetKind, workspaceGuid, workspaces]);

  const scheduleInput = React.useMemo(
    () => buildScheduleInput(trigger, timezone, hour, minute, dayOfWeek, dayOfMonth, cronExpr),
    [cronExpr, dayOfMonth, dayOfWeek, hour, minute, timezone, trigger],
  );
  const scheduleValid =
    trigger === "manual" ||
    trigger === "github" ||
    (scheduleInput !== null && (trigger !== "cron" || cronExpr.trim().split(/\s+/).length === 5));
  const triggerValid = scheduleValid && (!previewError || trigger === "manual" || trigger === "github");
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
    triggerValid;

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
      const rawInstructions = composerRef.current?.getText() ?? instructions;
      const resolvedInstructions = resolvePromptPlaceholders(rawInstructions, []);
      const attachmentPayload = await Promise.all(
        attachments.map(async (attachment) => ({
          filename: attachment.filename,
          mime: attachment.blob.type || "application/octet-stream",
          data_base64: await blobToBase64(attachment.blob),
        })),
      );

      if (mode === "create") {
        await createAutomationWithGithubRoute({
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
        await updateAutomationWithGithubRoute({
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
      clearAttachments();
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
                  setSubmitError(null);
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
                onAttachmentPreview={(attachment) => setPreviewAttachment(attachment)}
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
                  setSubmitError(null);
                  setMentionPopover((prev) => {
                    if (!prev) return prev;
                    if (text.length < prev.atOffset) return null;
                    if (text.charAt(prev.atOffset - 1) !== "@") return null;
                    const newQuery = text.slice(prev.atOffset);
                    const spaceIdx = newQuery.search(/\s/);
                    if (spaceIdx >= 0) return null;
                    return newQuery === prev.query ? prev : { ...prev, query: newQuery };
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
                      setSubmitError(null);
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
                        setSubmitError(null);
                      },
                      onProjectGuidChange: (guid) => {
                        setProjectGuid(guid);
                        setSubmitError(null);
                      },
                      onWorkspaceGuidChange: (guid) => {
                        setWorkspaceGuid(guid);
                        setSubmitError(null);
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
                        setSubmitError(null);
                      },
                      onTimezoneChange: (nextTimezone) => {
                        setTimezone(nextTimezone);
                        setSubmitError(null);
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
                        setSubmitError(null);
                      },
                      onGithubRepositoryChange: (fullName) => {
                        setGithubRepositoryFullName(fullName);
                        setSubmitError(null);
                      },
                      onGithubEventFamilyChange: (family) => {
                        setGithubEventFamily(family);
                        setSubmitError(null);
                      },
                      onGithubPullRequestActionChange: setGithubPullRequestAction,
                      onGithubBranchFilterChange: setGithubBranchFilter,
                      onGithubCommentContainsChange: setGithubCommentContains,
                      onGithubSenderLoginsChange: setGithubSenderLogins,
                      onGithubWorkflowConclusionChange: setGithubWorkflowConclusion,
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
              {previewAttachment && typeof document !== "undefined"
                ? createPortal(
                    <div
                      className="fixed inset-0 z-[2147483647] flex cursor-zoom-out items-center justify-center bg-black/80 backdrop-blur-sm"
                      onClick={() => setPreviewAttachment(null)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- previews use local object URLs and must not go through Next image optimization. */}
                      <img
                        src={previewAttachment.objectUrl}
                        alt={previewAttachment.filename}
                        className="max-h-[92vh] max-w-[92vw] rounded-md object-contain shadow-2xl"
                      />
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          </form>
        </div>
      </div>
    </TooltipProvider>
  );
}

function renderAutomationHeadline(headline: AutomationHeadline): React.ReactNode {
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
        DAY_OPTIONS.find((option) => option.value === dayOfWeek)?.label ?? "weekday";
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

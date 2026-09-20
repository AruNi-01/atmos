"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Label, TooltipProvider, agentConfigTriggerText } from "@workspace/ui";
import { ArrowLeft, Bot, Brain, LoaderCircle, Sparkles } from "lucide-react";
import {
  sanitizeRunConfig,
} from "@/features/agent/lib/terminal-agent-run-config";

import { AutomationEditorExpandHost } from "@/features/automations/components/automation-editor-expand";
import { AutomationMemoryEditor } from "@/features/automations/components/AutomationMemoryEditor";
import { AutomationSetupUnsavedDialog } from "@/features/automations/components/AutomationSetupUnsavedDialog";
import {
  AutomationSetupControls,
  AutomationSetupSubmitButton,
} from "@/features/automations/components/AutomationSetupControls";
import {
  buildTargetInput,
} from "@/features/automations/lib/automation-format";
import { automationMdLivePath } from "@/features/automations/lib/automation-md-live-path";
import {
  validationMessage,
} from "@/features/automations/lib/automation-schedule";
import {
  createAutomationWithGithubRoute,
  triggerInputForSubmit,
  updateAutomationWithGithubRoute,
} from "@/features/automations/lib/github-route-lifecycle";
import { useAutomationSetupForm } from "@/features/automations/hooks/use-automation-setup-form";
import { useAutomationSetupLeaveGuard } from "@/features/automations/hooks/use-automation-setup-leave-guard";
import { useGithubTriggerSetup } from "@/features/automations/hooks/use-github-trigger-setup";
import { CenterStageTab, CenterStageTabList } from "@/app-shell/center-stage-shared-tabs";
import {
  useAgentRegistryListQuery,
  useCustomAgentListQuery,
  useNativeChatAgentListQuery,
} from "@/features/agent/hooks/use-agent-registry-query";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { ChatAgentConfigInput } from "@/features/agent/components/ChatAgentConfigInput";
import { mergeInstalledAgents } from "@/features/agent/lib/custom-agent-registry";
import {
  composerConfigOptions,
  configKindMatches,
  defaultOptionsModelId,
} from "@/features/agent/lib/agent-chat-thread";
import type { AgentConfigOption } from "@/features/agent/lib/agent-chat-types";
import { useAutomationChatAgentCatalog } from "@/features/automations/hooks/use-automation-chat-agent-catalog";
import { automationChatAgentConfig } from "@/features/automations/lib/automation-chat-config";
import { applyAutomationRunSurface } from "@/features/automations/lib/apply-automation-run-surface";
import type {
  AutomationAgentCapability,
  AutomationCreateRequest,
  AutomationDetail,
  AutomationRunDetail,
  AutomationScheduleInput,
  AutomationSchedulePreviewResponse,
  AutomationUpdateRequest,
} from "@/features/automations/types";
import { WelcomeAgentSelector } from "@/features/welcome/components/WelcomeComposerControls";
import {
  resolvePromptPlaceholders,
  type AgentMenuOption,
} from "@/features/welcome/lib/welcome-page-helpers";
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
  onRunNow,
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
  onRunNow?: (automationGuid: string) => Promise<AutomationRunDetail>;
}) {
  const t = useTranslations("automation.setup");
  const registryQuery = useAgentRegistryListQuery();
  const customAgentsQuery = useCustomAgentListQuery();
  const chatAgentsQuery = useNativeChatAgentListQuery();
  const chatAgents = React.useMemo(
    () =>
      mergeInstalledAgents(
        (registryQuery.data?.agents ?? []).filter((agent) => agent.installed),
        customAgentsQuery.data?.agents ?? [],
        chatAgentsQuery.data?.agents ?? [],
      ),
    [customAgentsQuery.data, chatAgentsQuery.data, registryQuery.data],
  );
  const chatCatalogReady =
    !registryQuery.isLoading &&
    !customAgentsQuery.isLoading &&
    !chatAgentsQuery.isLoading;
  const openSettings = useOpenSettings();
  const {
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
  } = useAutomationSetupForm({
    mode,
    initialAutomation,
    agents,
    projects,
    chatProviderIds: chatAgents.map((agent) => agent.id),
    chatCatalogReady,
    schedulePreview,
  });
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
  const terminalAgentOptions = React.useMemo<AgentMenuOption[]>(
    () =>
      agents.map((agent) => ({
        id: agent.agent_id,
        label: agent.label,
        command: "",
        launchCommand: "",
        iconType: "built-in",
      })),
    [agents],
  );
  const chatAgentOptions = React.useMemo<AgentMenuOption[]>(
    () =>
      chatAgents.map((agent) => ({
        id: agent.id,
        label: agent.name,
        command: "",
        launchCommand: "",
        iconType: agent.install_method === "custom" ? "custom" : "built-in",
      })),
    [chatAgents],
  );
  const selectedExecuteOption = React.useMemo(() => {
    const options =
      executeMode === "chat"
        ? chatAgentOptions
        : executeMode === "headless"
          ? agentOptions
          : terminalAgentOptions;
    return options.find((option) => option.id === agentId) ?? null;
  }, [agentId, agentOptions, chatAgentOptions, executeMode, terminalAgentOptions]);
  const {
    catalog: chatAgentCatalog,
    loading: chatModelsLoading,
    refreshing: chatModelsRefreshing,
    reload: reloadChatModels,
  } = useAutomationChatAgentCatalog(agentId, executeMode === "chat");
  const chatConfigOptions = React.useMemo(
    () =>
      composerConfigOptions({
        descriptor: null,
        catalog: chatAgentCatalog,
        providerId: agentId,
        modelId: chatModel,
        thinkingId: chatThinking,
        modeId: "",
        permissionModeId: "",
        fastId: chatFast,
        contextId: chatContext,
      }),
    [
      agentId,
      chatAgentCatalog,
      chatContext,
      chatFast,
      chatModel,
      chatThinking,
    ],
  );
  const chatModelOption =
    chatConfigOptions.find((option) =>
      configKindMatches(option.id, option.category, "model"),
    ) ?? null;
  const chatThinkingOption =
    chatConfigOptions.find((option) =>
      configKindMatches(option.id, option.category, "thinking"),
    ) ?? null;
  const chatFastOption =
    chatConfigOptions.find((option) =>
      configKindMatches(option.id, option.category, "fast"),
    ) ?? null;
  const chatContextOption =
    chatConfigOptions.find((option) =>
      configKindMatches(option.id, option.category, "context"),
    ) ?? null;
  const selectedExecuteDetail = React.useMemo(() => {
    if (executeMode !== "chat") return "";
    return agentConfigTriggerText({
      modelLabel: configOptionLabel(chatModelOption),
      thinkingLabel:
        chatThinkingOption && chatThinkingOption.options.length > 1
          ? configOptionLabel(chatThinkingOption)
          : "",
    });
  }, [chatModelOption, chatThinkingOption, executeMode]);
  React.useEffect(() => {
    if (executeMode !== "chat") return;
    const nextModel = defaultOptionsModelId(chatAgentCatalog, chatModel);
    if (nextModel && nextModel !== chatModel) setChatModel(nextModel);
  }, [chatAgentCatalog, chatModel, executeMode, setChatModel]);
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

  const setupSnapshot = React.useMemo(
    () =>
      JSON.stringify({
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
        timezone,
        hour,
        minute,
        dayOfWeek,
        dayOfMonth,
        cronExpr,
        agentRunConfig: sanitizeRunConfig(selectedAgentRunConfig),
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
      chatContext,
      chatFast,
      chatModel,
      chatThinking,
      cronExpr,
      dayOfMonth,
      dayOfWeek,
      displayName,
      executeMode,
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
  const {
    leaveDialogOpen,
    requestLeave,
    clearDirtyBaseline,
    handleStay,
    handleDiscard,
    handleSaveAndLeave: runSaveAndLeave,
  } = useAutomationSetupLeaveGuard({
    ready,
    mode,
    agentId,
    setupSnapshot,
  });

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
      return null;
    }

    const target = buildTargetInput(targetKind, projectGuid, workspaceGuid);
    if (trigger !== "manual" && trigger !== "github" && !requestSchedule) {
      setSubmitError(t("errors.invalidSchedule"));
      return null;
    }
    const githubConfig = trigger === "github" ? buildGithubConfig() : null;
    const previousGithubConfig = mode === "edit" ? initialGithubConfig : null;

    setSubmitting(true);
    try {
      const resolvedInstructions = resolvePromptPlaceholders(
        instructions,
        [],
        {
          preserveFileMentions: true,
        },
      );
      let savedAutomation: AutomationDetail | null = null;

      if (mode === "create") {
        savedAutomation = await createAutomationWithGithubRoute({
          request: {
            display_name: displayName.trim(),
            instructions: resolvedInstructions.trim(),
            memory,
            agent_id: agentId,
            agent_config:
              executeMode === "chat"
                ? automationChatAgentConfig(agentId, {
                    model: chatModel,
                    thinking: chatThinking,
                    fast: chatFast,
                    context: chatContext,
                  })
                : sanitizeRunConfig(selectedAgentRunConfig),
            execute_mode: executeMode,
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
        savedAutomation = await updateAutomationWithGithubRoute({
          request: {
            automation_guid: initialAutomation.guid,
            display_name: displayName.trim(),
            instructions: resolvedInstructions.trim(),
            memory,
            agent_id: agentId,
            agent_config:
              executeMode === "chat"
                ? automationChatAgentConfig(agentId, {
                    model: chatModel,
                    thinking: chatThinking,
                    fast: chatFast,
                    context: chatContext,
                  })
                : sanitizeRunConfig(selectedAgentRunConfig),
            execute_mode: executeMode,
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
      if (savedAutomation) {
        setInstructions(savedAutomation.instructions);
        setMemory(savedAutomation.memory ?? "");
        clearDirtyBaseline();
      }
      return savedAutomation;
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("errors.saveFailed"),
      );
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveAutomation();
  };

  const handleTryRun = async () => {
    if (!onRunNow) return;
    const saved = await saveAutomation();
    if (!saved) return;
    setSubmitting(true);
    try {
      const run = await onRunNow(saved.guid);
      if (run.status === "failed") {
        setSubmitError(run.error_message ?? t("errors.tryRunFailed"));
        return;
      }
      applyAutomationRunSurface(run);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : t("errors.tryRunFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    requestLeave({ discard: onCancel });
  };

  const handleGithubStartSetup = React.useCallback(() => {
    void startGithubSetup();
  }, [startGithubSetup]);

  const handleOpenComputerSettings = React.useCallback(() => {
    openSettings("remote-access", "atmos-computer");
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
      <AutomationEditorExpandHost className="h-full overflow-auto bg-background">
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
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-muted-foreground" />
                    <Label className="text-sm font-semibold text-foreground">
                      {t("executeAgent.label")}
                    </Label>
                  </div>
                  {selectedExecuteOption ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                      <AgentIcon
                        registryId={selectedExecuteOption.id}
                        name={selectedExecuteOption.label}
                        size={14}
                        isCustom={selectedExecuteOption.iconType === "custom"}
                      />
                      <span className="truncate">
                        {selectedExecuteOption.label}
                        {selectedExecuteDetail
                          ? ` · ${selectedExecuteDetail}`
                          : ""}
                      </span>
                    </span>
                  ) : null}
                </div>
                <CenterStageTabList
                  value={executeMode}
                  onValueChange={(value) => {
                    if (
                      value === "headless" ||
                      value === "terminal" ||
                      value === "chat"
                    ) {
                      setExecuteMode(value);
                      clearSubmitError();
                    }
                  }}
                  className="px-0 py-0"
                >
                  <CenterStageTab value="headless">
                    {t("executeAgent.headless")}
                  </CenterStageTab>
                  <CenterStageTab value="terminal">
                    {t("executeAgent.terminal")}
                  </CenterStageTab>
                  <CenterStageTab value="chat">
                    {t("executeAgent.chat")}
                  </CenterStageTab>
                </CenterStageTabList>
                {executeMode === "chat" ? (
                  <ChatAgentConfigInput
                    configOnly
                    menuInline
                    className="w-full"
                    disabled={submitting}
                    installedAgents={chatAgents}
                    registryId={agentId}
                    modelOption={chatModelOption}
                    thinkingOption={chatThinkingOption}
                    modeOption={null}
                    permissionOption={null}
                    fastOption={chatFastOption}
                    contextOption={chatContextOption}
                    modelsLoading={chatModelsLoading}
                    modelsReloading={chatModelsRefreshing}
                    onEmptyModelsOpen={reloadChatModels}
                    onLoadModels={reloadChatModels}
                    onProviderChange={(providerId, opts) => {
                      setAgentId(providerId);
                      if (opts?.model) setChatModel(opts.model);
                      setChatThinking("");
                      setChatFast("");
                      setChatContext("");
                      clearSubmitError();
                    }}
                    onConfigChange={(kind, value) => {
                      if (kind === "model") setChatModel(value);
                      if (kind === "thinking") setChatThinking(value);
                      if (kind === "fast") setChatFast(value);
                      if (kind === "context") setChatContext(value);
                      clearSubmitError();
                    }}
                  />
                ) : (
                  <div className="rounded-lg border border-border bg-muted/30 p-1">
                    <WelcomeAgentSelector
                      variant="panel"
                      availableAgents={
                        executeMode === "headless"
                          ? agentOptions
                          : terminalAgentOptions
                      }
                      selectedAgentId={agentId}
                      runConfigByAgentId={agentRunConfigs}
                      onRunConfigChange={(nextAgentId, nextValue) => {
                        setAgentRunConfig(nextAgentId, nextValue);
                        setAgentId(nextAgentId);
                        clearSubmitError();
                      }}
                      purpose="automation"
                      showRunConfig
                      onSelectAgent={(nextAgentId) => {
                        setAgentId(nextAgentId);
                        clearSubmitError();
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-muted-foreground" />
                <Label className="text-sm font-semibold text-foreground">
                  {t("instructions.label")}
                </Label>
              </div>
              {ready ? (
                <AutomationMemoryEditor
                  compact
                  chrome={false}
                  expandId="instructions"
                  placeholder={placeholder}
                  value={instructions}
                  onChange={(next) => {
                    setInstructions(next);
                    clearSubmitError();
                  }}
                  filePath={automationMdLivePath("instructions", {
                    guid: initialAutomation?.guid,
                  })}
                  disabled={submitting}
                />
              ) : (
                <div className="flex h-[280px] items-center justify-center rounded-lg border border-border text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                </div>
              )}
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
              {ready ? (
                <AutomationMemoryEditor
                  compact
                  chrome={false}
                  expandId="memory"
                  value={memory}
                  onChange={(next) => {
                    setMemory(next);
                    clearSubmitError();
                  }}
                  path={initialAutomation?.memory_path}
                  filePath={automationMdLivePath("memory", {
                    guid: initialAutomation?.guid,
                    diskPath: initialAutomation?.memory_path,
                  })}
                  disabled={submitting}
                />
              ) : (
                <div className="flex h-[280px] items-center justify-center rounded-lg border border-border text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                </div>
              )}
            </section>

            {submitError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {submitError}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              {onRunNow ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabledSubmit}
                  onClick={() => void handleTryRun()}
                >
                  {submitting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  {t("tryRun")}
                </Button>
              ) : null}
              <AutomationSetupSubmitButton
                mode={mode}
                disabledSubmit={disabledSubmit}
                isSubmitting={submitting}
              />
            </div>
          </form>
        </div>
        <AutomationSetupUnsavedDialog
          open={leaveDialogOpen}
          mode={mode}
          saving={submitting}
          onStay={handleStay}
          onDiscard={handleDiscard}
          onSave={() => {
            void runSaveAndLeave(saveAutomation);
          }}
        />
      </AutomationEditorExpandHost>
    </TooltipProvider>
  );
}

function configOptionLabel(option: AgentConfigOption | null): string {
  if (!option) return "";
  const current = option.currentValue?.trim() || "";
  const listed = option.options.find((item) => item.value === current);
  return (listed?.name || listed?.value || current).trim();
}

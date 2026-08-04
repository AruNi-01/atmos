"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  cn,
} from "@workspace/ui";
import { useHotkeys } from "react-hotkeys-hook";
import {
  functionSettingsApi,
  llmProvidersApi,
  type SkillInfo,
} from "@/api/ws-api";
import {
  sanitizeRunConfig,
  type TerminalAgentRunConfigInput,
} from "@/features/agent/lib/terminal-agent-run-config";
import {
  type ComposerHandle,
} from "@/features/welcome/components/PromptComposer";
import { useWelcomeAgentOptions } from "@/features/welcome/hooks/use-welcome-agent-options";
import { useWelcomeComposerAttachments } from "@/features/welcome/hooks/use-welcome-composer-attachments";
import { useWelcomeProjectContext } from "@/features/welcome/hooks/use-welcome-project-context";
import { useWelcomeMentionSearch } from "@/features/welcome/hooks/use-welcome-mention-search";
import { useWelcomeSlashSearch } from "@/features/welcome/hooks/use-welcome-slash-search";
import {
  type SlashCommandOption,
  type WelcomeSlashPopoverState,
  useWelcomeSlashNavigation,
} from "@/features/welcome/hooks/use-welcome-slash-navigation";
import type { SlashPopoverView } from "@/features/welcome/components/SlashCommandPopover";
import {
  BROWSER_USE_SLASH_COMMAND_ID,
  buildBrowserUseSlashCommand,
  matchesBrowserUseSlashQuery,
  resolveBrowserUseSkillRef,
} from "@/features/welcome/lib/slash-browser-use";
import { useProjectStore } from "@/features/project/store/use-project-store";
import {
  useProjects,
  useWorkspaceLabels,
  useProjectBootstrapQuery,
} from "@/features/project/hooks/use-project-bootstrap-query";
import { useWorkspaceCreationStore } from "@/features/workspace/store/workspace-creation-store";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useDialogStore } from "@/app-shell/state/use-dialog-store";
import type {
  WorkspaceLabel,
  WorkspacePriority,
  WorkspaceWorkflowStatus,
} from "@/shared/types/domain";
import { WelcomeAgentSelector } from "@/features/welcome/components/WelcomeComposerControls";
import { WelcomeComposerCard } from "@/features/welcome/components/WelcomeComposerCard";
import { WelcomeComposerFooter } from "@/features/welcome/components/WelcomeComposerFooter";
import {
  useComposerDisableSkills,
  type ComposerSkillsContext,
} from "@/features/skills/hooks/use-composer-disable-skills";
import {
  SKILL_DISABLE_DISMISS_SECONDS,
  stripSkillDisableSession,
  upsertSkillDisableSessionAction,
  type SkillDisableSessionAction,
} from "@/features/skills/lib/skill-disable-protocol";
import {
  WelcomeCloseButton,
  WelcomeComposerPlaceholder,
  WelcomePageBackdrop,
  WelcomePageMountedSkeleton,
  WelcomeProjectRequirementNotice,
} from "@/features/welcome/components/WelcomePageShell";
import {
  type MentionNavItem,
  type MentionPopoverState,
} from "@/features/welcome/components/WelcomeMentionPopover";
import {
  DEFAULT_WELCOME_HEADLINE,
  WELCOME_HEADLINES,
  blobToBase64,
  buildAutoExtractDescription,
  buildWelcomeSummaryItems,
  isBranchConflictError,
  issueToBranchName,
  issueToWorkspaceName,
  prToWorkspaceName,
  regeneratePokemonSuffixBranch,
  renderHeadline,
  resolvePromptPlaceholders,
  resolveWorkspaceIssueTodoProvider,
  sanitizeCreateWorkspaceErrorMessage,
  useWelcomeComposerPlaceholder,
  type AgentMenuOption,
  type MentionFileCandidate,
  type WelcomeHeadline,
} from "@/features/welcome/lib/welcome-page-helpers";

interface WelcomePageProps {
  onAddProject?: () => void;
  onConnectAgent?: () => void;
  onClose?: () => void;
  className?: string;
}

const WelcomePage: React.FC<WelcomePageProps> = ({
  onAddProject,
  onConnectAgent,
  onClose,
  className,
}) => {
  const t = useTranslations("Welcome.components");
  const tr = React.useCallback(
    (key: string, values?: Record<string, string | number | boolean | null | undefined>) =>
      t(key as never, values as never),
    [t],
  );
  const [isMounted, setIsMounted] = React.useState(false);
  const router = useAppRouter();
  const selectedProjectIdFromLauncher = useDialogStore((s) => s.selectedProjectId);
  const projects = useProjects();
  const workspaceLabels = useWorkspaceLabels();
  const bootstrapQuery = useProjectBootstrapQuery();
  const isInitialProjectsLoading = bootstrapQuery.isPending && !bootstrapQuery.data;
  const addWorkspace = useProjectStore((s) => s.addWorkspace);
  const createWorkspaceLabel = useProjectStore((s) => s.createWorkspaceLabel);
  const showCreating = useWorkspaceCreationStore((s) => s.showCreating);
  const showOpening = useWorkspaceCreationStore((s) => s.showOpening);
  const queueAgentRun = useWorkspaceCreationStore((s) => s.queueAgentRun);
  const clearWorkspaceCreationOverlay = useWorkspaceCreationStore((s) => s.clear);

  const [projectId, setProjectId] = React.useState("");
  const [initialRequirement, setInitialRequirement] = React.useState("");
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
  const [mentionPopover, setMentionPopover] = React.useState<MentionPopoverState>(null);
  const [slashPopover, setSlashPopover] = React.useState<WelcomeSlashPopoverState>(null);
  const [slashPopoverView, setSlashPopoverView] = React.useState<SlashPopoverView>("menu");
  const [skillDisableFilter, setSkillDisableFilter] = React.useState("");
  const [skillDisableSessionActions, setSkillDisableSessionActions] = React.useState<
    SkillDisableSessionAction[]
  >([]);
  const suppressSlashCancelRef = React.useRef(false);
  const slashPopoverViewRef = React.useRef<SlashPopoverView>("menu");
  slashPopoverViewRef.current = slashPopoverView;
  const [name, setName] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [branchError, setBranchError] = React.useState<string | null>(null);
  const [todoProviderLabel, setTodoProviderLabel] = React.useState<string | null>(null);

  const [isLlmRoutingLoading, setIsLlmRoutingLoading] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);

  const [priority, setPriority] = React.useState<WorkspacePriority>("no_priority");
  const [workflowStatus, setWorkflowStatus] =
    React.useState<WorkspaceWorkflowStatus>("in_progress");
  const [selectedLabels, setSelectedLabels] = React.useState<WorkspaceLabel[]>([]);
  const [agentRunConfigs, setAgentRunConfigs] = React.useState<
    Record<string, TerminalAgentRunConfigInput | null>
  >({});

  const {
    availableAgents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId,
  } = useWelcomeAgentOptions();
  const [headline, setHeadline] = React.useState<WelcomeHeadline>(DEFAULT_WELCOME_HEADLINE);

  const nameTouchedRef = React.useRef(false);
  const branchTouchedRef = React.useRef(false);
  const generatedBranchRef = React.useRef<string | null>(null);
  const branchInputRef = React.useRef<HTMLInputElement | null>(null);
  const appliedLauncherProjectIdRef = React.useRef<string | null>(null);
  const prevProjectIdsRef = React.useRef<string[]>([]);
  const waitingForNewProjectRef = React.useRef(false);
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    setHeadline(WELCOME_HEADLINES[Math.floor(Math.random() * WELCOME_HEADLINES.length)]);
  }, []);



  React.useEffect(() => {
    if (selectedProjectIdFromLauncher && projects.some((project) => project.id === selectedProjectIdFromLauncher)) {
      if (appliedLauncherProjectIdRef.current !== selectedProjectIdFromLauncher) {
        appliedLauncherProjectIdRef.current = selectedProjectIdFromLauncher;
        setProjectId(selectedProjectIdFromLauncher);
      }
      return;
    }
    if (!selectedProjectIdFromLauncher) {
      appliedLauncherProjectIdRef.current = null;
    }
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projects, selectedProjectIdFromLauncher, projectId]);

  React.useEffect(() => {
    const previousIds = prevProjectIdsRef.current;
    const currentIds = projects.map((project) => project.id);

    if (waitingForNewProjectRef.current && previousIds.length > 0) {
      const newProject = projects.find((project) => !previousIds.includes(project.id));
      if (newProject) {
        setProjectId(newProject.id);
        waitingForNewProjectRef.current = false;
      }
    }

    prevProjectIdsRef.current = currentIds;
  }, [projects]);

  const selectedProject = React.useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projectId, projects],
  );
  const selectedProjectId = selectedProject?.id ?? null;
  const selectedProjectPath = selectedProject?.mainFilePath ?? null;
  const skillsContext = React.useMemo<ComposerSkillsContext | null>(() => {
    if (!selectedProject?.mainFilePath) return null;
    return {
      mode: "project",
      id: selectedProject.id,
      name: selectedProject.name,
      path: selectedProject.mainFilePath,
    };
  }, [selectedProject]);
  const {
    error: disableSkillsError,
    loading: disableSkillsLoading,
    loadSkills: loadDisableSkills,
    pendingId: disableSkillsPendingId,
    setEnabled: setDisableSkillEnabled,
    skills: disableSkillsList,
  } = useComposerDisableSkills(skillsContext);

  const slashCommands = React.useMemo<SlashCommandOption[]>(() => {
    const query = slashPopover?.query.trim().toLowerCase() ?? "";
    const commands: SlashCommandOption[] = [];
    if (matchesBrowserUseSlashQuery(query)) {
      commands.push(
        buildBrowserUseSlashCommand({
          label: t("slashPopover.browserUse.label"),
          description: t("slashPopover.browserUse.description"),
        }),
      );
    }
    if (!skillsContext) return commands;
    if (
      !query ||
      "dynamic-skills".includes(query) ||
      "dynamic skills".includes(query) ||
      "disable-skill".includes(query) ||
      "disable skill".includes(query) ||
      "disable".includes(query) ||
      "skill".includes(query)
    ) {
      commands.push({
        id: "dynamic-skills",
        label: t("slashPopover.disableSkill.label"),
        description: t("slashPopover.disableSkill.description"),
      });
    }
    return commands;
  }, [skillsContext, slashPopover?.query, t]);
  const {
    autoExtractTodos,
    autoExtractTodosPr,
    baseBranch,
    baseBranchFilter,
    displayedLinkType,
    filteredRemoteBranches,
    handleLoadIssueFromUrl,
    handleLoadPrFromUrl,
    handleRefreshIssues,
    handleRefreshPrs,
    handleSelectIssue,
    handleSelectLinkType,
    handleSelectPr,
    hasSetupScript,
    isBaseBranchesLoading,
    isBaseBranchOpen,
    isIssuePreviewLoading,
    isIssuesLoading,
    isPrPreviewLoading,
    isPrsLoading,
    issueError,
    issuePreview,
    issues,
    issueUrl,
    linkType,
    prError,
    prPreview,
    prs,
    prUrl,
    remoteBranches,
    repoContext,
    selectedIssueNumber,
    selectedPrNumber,
    setAutoExtractTodos,
    setAutoExtractTodosPr,
    setBaseBranch,
    setBaseBranchFilter,
    setIsBaseBranchOpen,
    setIssueError,
    setIssuePreview,
    setIssueUrl,
    setPrError,
    setPrPreview,
    setPrUrl,
  } = useWelcomeProjectContext({
    branchTouchedRef,
    clearAttachments,
    composerRef,
    generatedBranchRef,
    nameTouchedRef,
    selectedProjectId,
    selectedProjectPath,
    setBranch,
    setBranchError,
    setName,
    setSubmitError,
  });

  const {
    filteredAgents,
    filteredProjects,
    filteredSkills,
    allSkills,
    isSkillsLoading,
  } = useWelcomeSlashSearch({
    availableAgents,
    activeProjectId: selectedProjectId ?? null,
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
      const popover = mentionPopover;
      if (!popover) return;
      if (item.type === "file") {
        selectMentionFile(item.file);
        return;
      }
      if (item.type === "issue") {
        composerRef.current?.applyMentionAtRange(
          popover.atOffset,
          popover.query.length,
          { kind: "issue", number: item.issue.number },
        );
        setMentionPopover(null);
        return;
      }
      if (item.type === "pr") {
        composerRef.current?.applyMentionAtRange(
          popover.atOffset,
          popover.query.length,
          { kind: "pr", number: item.pr.number },
        );
        setMentionPopover(null);
      }
    },
    [mentionPopover, selectMentionFile],
  );

  const {
    activeMentionFileIndex,
    isMentionFilesLoading,
    mentionFiles,
    mentionPopoverListRef,
    setIsMentionFilesLoading,
    setMentionItemRef,
  } = useWelcomeMentionSearch({
    issuePreview,
    onSelectNavItem: selectMentionNavItem,
    popover: mentionPopover,
    prPreview,
    selectedProjectPath,
  });

  const selectSlashSkill = React.useCallback(
    (skill: SkillInfo) => {
      if (skill.status === "disabled") return;
      const popover = slashPopover;
      if (!popover) return;
      composerRef.current?.applySlashAtRange(
        popover.slashOffset,
        popover.query.length,
        { kind: "skill", absolutePath: skill.path, name: skill.name },
      );
      setSlashPopover(null);
      setSlashPopoverView("menu");
      setSkillDisableFilter("");
    },
    [slashPopover],
  );

  const selectSlashProject = React.useCallback(
    (project: { id: string }) => {
      const popover = slashPopover;
      if (!popover) return;
      // Close popover immediately to prevent re-opening from side effects
      setSlashPopover(null);
      setSlashPopoverView("menu");
      setSkillDisableFilter("");
      composerRef.current?.removeSlashAtRange(
        popover.slashOffset,
        popover.query.length,
      );
      // Then switch project
      setProjectId(project.id);
    },
    [slashPopover],
  );

  const selectSlashAgent = React.useCallback(
    (agent: AgentMenuOption) => {
      const popover = slashPopover;
      if (!popover) return;
      // Close popover immediately to prevent re-opening from side effects
      setSlashPopover(null);
      setSlashPopoverView("menu");
      setSkillDisableFilter("");
      composerRef.current?.removeSlashAtRange(
        popover.slashOffset,
        popover.query.length,
      );
      // Then switch agent
      setSelectedAgentId(agent.id);
    },
    [slashPopover, setSelectedAgentId],
  );

  const enterDisableSkillsView = React.useCallback(() => {
    const popover = slashPopover;
    if (!popover || !skillsContext) return;
    suppressSlashCancelRef.current = true;
    setSkillDisableSessionActions([]);
    composerRef.current?.applySkillDisableCommandAtRange(
      popover.slashOffset,
      popover.query.length,
    );
    slashPopoverViewRef.current = "disable_skills";
    setSlashPopoverView("disable_skills");
    setSkillDisableFilter("");
    void loadDisableSkills();
    window.requestAnimationFrame(() => {
      composerRef.current?.focusSkillDisableFilter();
      suppressSlashCancelRef.current = false;
    });
  }, [loadDisableSkills, skillsContext, slashPopover]);

  const backFromDisableSkills = React.useCallback(() => {
    suppressSlashCancelRef.current = true;
    slashPopoverViewRef.current = "menu";
    setSlashPopoverView("menu");
    setSkillDisableFilter("");
    setSkillDisableSessionActions([]);
    composerRef.current?.restoreSlashFromSkillDisable();
    window.requestAnimationFrame(() => {
      suppressSlashCancelRef.current = false;
    });
  }, []);

  const toggleDisableSkill = React.useCallback(
    async (skill: SkillInfo, enabled: boolean) => {
      const beforeEnabled = skill.status !== "disabled";
      const ok = await setDisableSkillEnabled(skill, enabled);
      if (!ok) return;
      setSkillDisableSessionActions((current) => {
        const next = upsertSkillDisableSessionAction(
          current,
          skill.id,
          skill.title || skill.name,
          beforeEnabled,
          enabled,
        );
        composerRef.current?.setSkillDisableSessionActions(next);
        return next;
      });
    },
    [setDisableSkillEnabled],
  );

  const selectSlashCommand = React.useCallback(
    (command: SlashCommandOption) => {
      if (command.id === "dynamic-skills") {
        enterDisableSkillsView();
        return;
      }
      if (command.id === BROWSER_USE_SLASH_COMMAND_ID) {
        const popover = slashPopover;
        if (!popover) return;
        const skill = resolveBrowserUseSkillRef(allSkills);
        composerRef.current?.applySlashAtRange(
          popover.slashOffset,
          popover.query.length,
          { kind: "skill", absolutePath: skill.absolutePath, name: skill.name },
        );
        setSlashPopover(null);
      }
    },
    [allSkills, enterDisableSkillsView, slashPopover],
  );

  const {
    activeIndex: activeSlashItemIndex,
    expandedSections,
    listRef: slashPopoverListRef,
    setExpandedSections,
    setItemRef: setSlashItemRef,
  } = useWelcomeSlashNavigation({
    enabled: slashPopoverView === "menu",
    filteredAgents,
    filteredCommands: slashCommands,
    filteredProjects,
    filteredSkills,
    onSelectAgent: selectSlashAgent,
    onSelectCommand: selectSlashCommand,
    onSelectProject: selectSlashProject,
    onSelectSkill: selectSlashSkill,
    popover: slashPopover,
  });

  const closeSlashPopover = React.useCallback(() => {
    if (slashPopoverViewRef.current === "disable_skills") {
      composerRef.current?.beginSkillDisableChipDismiss(SKILL_DISABLE_DISMISS_SECONDS);
    }
    setSlashPopover(null);
    slashPopoverViewRef.current = "menu";
    setSlashPopoverView("menu");
    setSkillDisableFilter("");
    setSkillDisableSessionActions([]);
    setExpandedSections({
      skills: false,
      projects: false,
      agents: false,
    });
  }, [setExpandedSections]);

  const handleSkillDisableSessionClosed = React.useCallback(() => {
    setSlashPopover(null);
    slashPopoverViewRef.current = "menu";
    setSlashPopoverView("menu");
    setSkillDisableFilter("");
    setSkillDisableSessionActions([]);
    setExpandedSections({
      skills: false,
      projects: false,
      agents: false,
    });
  }, [setExpandedSections]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadLlmRouting() {
      setIsLlmRoutingLoading(true);
      try {
        const config = await llmProvidersApi.get();
        if (cancelled) return;
        const provider = resolveWorkspaceIssueTodoProvider(config);
        setTodoProviderLabel(provider?.label ?? null);
      } catch {
        if (!cancelled) setTodoProviderLabel(null);
      } finally {
        if (!cancelled) setIsLlmRoutingLoading(false);
      }
    }

    void loadLlmRouting();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!issuePreview || !todoProviderLabel) {
      setAutoExtractTodos(false);
    }
  }, [issuePreview, setAutoExtractTodos, todoProviderLabel]);

  React.useEffect(() => {
    if (!prPreview || !todoProviderLabel) {
      setAutoExtractTodosPr(false);
    }
  }, [prPreview, setAutoExtractTodosPr, todoProviderLabel]);

  const { exitingPlaceholder, visiblePlaceholder } = useWelcomeComposerPlaceholder({
    agentLabel: selectedAgent?.label,
    projectName: selectedProject?.name,
  });

  const canAutoExtractTodosIssue = !!issuePreview && !!todoProviderLabel && !isLlmRoutingLoading;
  const canAutoExtractTodosPr = !!prPreview && !!todoProviderLabel && !isLlmRoutingLoading;
  const canAutoExtractTodos = canAutoExtractTodosIssue || canAutoExtractTodosPr;
  const autoExtractDescriptionIssue = buildAutoExtractDescription({
    hasPreview: !!issuePreview,
    isLlmRoutingLoading,
    kind: "issue",
    todoProviderLabel,
    t: tr,
  });
  const autoExtractDescriptionPr = buildAutoExtractDescription({
    hasPreview: !!prPreview,
    isLlmRoutingLoading,
    kind: "pr",
    todoProviderLabel,
    t: tr,
  });
  const filledSummaryItems = React.useMemo(
    () =>
      buildWelcomeSummaryItems({
        autoExtractTodos,
        autoExtractTodosPr,
        baseBranch,
        branch,
        canAutoExtractTodos,
        issuePreview,
        name,
        prPreview,
        t: tr,
      }),
    [autoExtractTodos, autoExtractTodosPr, baseBranch, branch, canAutoExtractTodos, issuePreview, prPreview, name, tr],
  );

  const handleRegenerateBranch = () => {
    const nextBranch = regeneratePokemonSuffixBranch(branch, issuePreview?.number);
    branchTouchedRef.current = true;
    setBranch(nextBranch);
    setBranchError(null);
    setSubmitError(null);
    requestAnimationFrame(() => branchInputRef.current?.focus());
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!projectId) {
      setSubmitError(t("page.errors.selectProjectFirst"));
      return;
    }

    let keepGlobalLoading = false;
    setIsSubmitting(true);
    setSubmitError(null);
    setBranchError(null);
    showCreating();

    try {
      const finalDisplayName = prPreview
        ? name.trim() || prToWorkspaceName(prPreview)
        : name.trim() || (issuePreview ? issueToWorkspaceName(issuePreview) : "");
      const finalBranch = prPreview
        ? prPreview.head_ref
        : branch.trim() ||
          (!branchTouchedRef.current && generatedBranchRef.current) ||
          (issuePreview ? issueToBranchName(issuePreview) : "");
      const finalBaseBranch = prPreview ? prPreview.base_ref || baseBranch : baseBranch;

      // Create labels from GitHub issue/PR if present
      let labelsToUse = selectedLabels;
      if (prPreview && prPreview.labels && prPreview.labels.length > 0) {
        const source = 'gitHub_pr' as const;
        for (const prLabel of prPreview.labels) {
          // Check if label already exists with same name (case-insensitive) and source
          const existingLabel = workspaceLabels.find(
            (l) => l.name.toLowerCase() === prLabel.name.toLowerCase() && l.source === source
          );
          if (!existingLabel) {
            const newLabel = await createWorkspaceLabel({
              name: prLabel.name,
              color: prLabel.color ? `#${prLabel.color.replace(/^#/, '')}` : '#94a3b8',
              source,
            });
            labelsToUse = [...labelsToUse, newLabel];
          } else if (!labelsToUse.find((l) => l.id === existingLabel.id)) {
            labelsToUse = [...labelsToUse, existingLabel];
          }
        }
      } else if (issuePreview && issuePreview.labels && issuePreview.labels.length > 0) {
        const source = 'gitHub_issue' as const;
        for (const issueLabel of issuePreview.labels) {
          // Check if label already exists with same name (case-insensitive) and source
          const existingLabel = workspaceLabels.find(
            (l) => l.name.toLowerCase() === issueLabel.name.toLowerCase() && l.source === source
          );
          if (!existingLabel) {
            const newLabel = await createWorkspaceLabel({
              name: issueLabel.name,
              color: issueLabel.color ? `#${issueLabel.color.replace(/^#/, '')}` : '#94a3b8',
              source,
            });
            labelsToUse = [...labelsToUse, newLabel];
          } else if (!labelsToUse.find((l) => l.id === existingLabel.id)) {
            labelsToUse = [...labelsToUse, existingLabel];
          }
        }
      }

      const rawPrompt = stripSkillDisableSession(
        composerRef.current?.getText() ?? initialRequirement,
      );
      const resolvedPrompt = resolvePromptPlaceholders(rawPrompt, attachments);
      const attachmentPayload = await Promise.all(
        attachments.map(async (a) => ({
          filename: a.filename,
          mime: a.blob.type || "application/octet-stream",
          dataBase64: await blobToBase64(a.blob),
        })),
      );

      const workspaceId = await addWorkspace({
        projectId,
        name: finalBranch,
        displayName: finalDisplayName || null,
        branch: finalBranch,
        baseBranch: finalBaseBranch,
        initialRequirement: resolvedPrompt.trim() || null,
        githubIssue: prPreview ? null : issuePreview,
        githubPr: prPreview,
        autoExtractTodos:
          !!todoProviderLabel &&
          ((prPreview && autoExtractTodosPr) || (!prPreview && !!issuePreview && autoExtractTodos)),
        hasSetupScript,
        priority,
        workflowStatus,
        labels: labelsToUse,
        attachments: attachmentPayload,
      });
      queueAgentRun({
        workspaceId,
        prompt: resolvedPrompt.trim(),
        agentRunConfig: selectedAgent ? sanitizeRunConfig(agentRunConfigs[selectedAgent.id]) : null,
        agent: selectedAgent
          ? {
              id: selectedAgent.id,
              label: selectedAgent.label,
              command: selectedAgent.launchCommand,
              launchCommand: selectedAgent.launchCommand,
              iconType: selectedAgent.iconType,
            }
          : undefined,
      });

      keepGlobalLoading = true;
      showOpening(workspaceId);
      // Clean up composer + attachments after successful create.
      clearAttachments();
      composerRef.current?.clear();
      router.push(`/workspace?id=${workspaceId}`);
    } catch (error) {
      clearWorkspaceCreationOverlay();
      const message = sanitizeCreateWorkspaceErrorMessage(
        error instanceof Error ? error.message : t("page.errors.failedToCreateWorkspace"),
      );

      if (isBranchConflictError(message)) {
        setBranchError(message);
        setIsAdvancedOpen(true);
        requestAnimationFrame(() => branchInputRef.current?.focus());
      } else {
        setSubmitError(message);
      }
    } finally {
      if (!keepGlobalLoading) {
        setIsSubmitting(false);
      }
    }
  };

  const disabledSubmit =
    isSubmitting ||
    !projectId ||
    isIssuePreviewLoading ||
    isBaseBranchesLoading ||
    (selectedProjectId ? remoteBranches.length === 0 : false);

  useHotkeys('mod+shift+enter', () => {
    if (!disabledSubmit) {
      handleSubmit();
    }
  }, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
    description: 'Create workspace',
  });

  if (!isMounted) {
    return <WelcomePageMountedSkeleton className={className} />;
  }

  const composerFooter = (
    <WelcomeComposerFooter
      advancedOptionsProps={{
        autoExtractDescriptionIssue,
        autoExtractDescriptionPr,
        autoExtractTodos,
        autoExtractTodosPr,
        baseBranch,
        baseBranchFilter,
        branch,
        branchError,
        branchInputRef,
        canAutoExtractTodosIssue,
        canAutoExtractTodosPr,
        displayedLinkType,
        filteredRemoteBranches,
        handleLoadIssueFromUrl,
        handleLoadPrFromUrl,
        handleRefreshIssues,
        handleRefreshPrs,
        handleRegenerateBranch,
        handleSelectIssue,
        handleSelectLinkType,
        handleSelectPr,
        isAdvancedOpen,
        isBaseBranchesLoading,
        isBaseBranchOpen,
        isIssuePreviewLoading,
        isIssuesLoading,
        isPrPreviewLoading,
        isPrsLoading,
        issueError,
        issuePreview,
        issues,
        issueUrl,
        linkType,
        name,
        onBranchChange: (value) => {
          branchTouchedRef.current = true;
          setSubmitError(null);
          setBranchError(null);
          setBranch(value);
        },
        onIssueUrlChange: (value) => {
          setIssuePreview(null);
          setIssueError(null);
          setIssueUrl(value);
        },
        onNameChange: (value) => {
          nameTouchedRef.current = true;
          setSubmitError(null);
          setBranchError(null);
          setName(value);
        },
        onPrUrlChange: (value) => {
          setPrPreview(null);
          setPrError(null);
          setPrUrl(value);
        },
        prError,
        prPreview,
        prs,
        prUrl,
        remoteBranches,
        repoContext,
        selectedIssueNumber,
        selectedPrNumber,
        selectedProjectId,
        setAutoExtractTodos,
        setAutoExtractTodosPr,
        setBaseBranch,
        setBaseBranchFilter,
        setIsAdvancedOpen,
        setIsBaseBranchOpen,
        submitError,
      }}
      mentionPopoverProps={{
        activeIndex: activeMentionFileIndex,
        issuePreview,
        isLoading: isMentionFilesLoading,
        listRef: mentionPopoverListRef,
        mentionFiles,
        onClose: () => setMentionPopover(null),
        onSelectFile: selectMentionFile,
        onSelectNavItem: selectMentionNavItem,
        onSetItemRef: setMentionItemRef,
        popover: mentionPopover,
        prPreview,
      }}
      previewAttachment={previewAttachment}
      slashPopoverProps={{
        activeIndex: activeSlashItemIndex,
        disableSkills:
          slashPopoverView === "disable_skills"
            ? {
                filter: skillDisableFilter,
                loading: disableSkillsLoading,
                pendingId: disableSkillsPendingId,
                skills: disableSkillsList,
                error: disableSkillsError,
              }
            : null,
        expandedSections,
        filteredAgents,
        filteredCommands: slashCommands,
        filteredProjects,
        filteredSkills,
        isSkillsLoading,
        listRef: slashPopoverListRef,
        onBackFromDisableSkills: backFromDisableSkills,
        onClose: closeSlashPopover,
        onSelectAgent: selectSlashAgent,
        onSelectCommand: selectSlashCommand,
        onSelectProject: selectSlashProject,
        onSelectSkill: selectSlashSkill,
        onToggleDisableSkill: (skill, enabled) => {
          void toggleDisableSkill(skill, enabled);
        },
        popover: slashPopover,
        setExpandedSections,
        setItemRef: setSlashItemRef,
        showCommands: slashCommands.length > 0,
        view: slashPopoverView,
      }}
      summaryItems={filledSummaryItems}
      onPreviewAttachmentClose={() => setPreviewAttachment(null)}
    />
  );

  return (
    <div
      className={cn(
        "relative min-h-full overflow-hidden bg-background px-4 py-8 selection:bg-foreground/10 sm:px-6",
        className,
      )}
    >
      <WelcomePageBackdrop />
      {onClose ? <WelcomeCloseButton onClose={onClose} /> : null}
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center py-8 md:translate-y-8">
        <div className="mb-10 flex w-full max-w-4xl flex-col items-center">
          <h1 className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            {renderHeadline(headline, t)}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-4xl">
          <div className="relative">
            <WelcomeAgentSelector
              availableAgents={availableAgents}
              onConnectAgent={onConnectAgent}
              selectedAgentId={selectedAgentId}
              runConfigByAgentId={agentRunConfigs}
              onRunConfigChange={(agentId, nextValue) => {
                setAgentRunConfigs((current) => ({
                  ...current,
                  [agentId]: nextValue,
                }));
                setSelectedAgentId(agentId);
              }}
              purpose="interactive"
              onSelectAgent={(agentId) => {
                setSelectedAgentId(agentId);
                functionSettingsApi
                  .update("agent_cli", "center_fix_terminal_default_agent", agentId)
                  .catch(() => {});
              }}
            />
            <WelcomeComposerCard
              attachments={attachments}
              composerRef={composerRef}
              createWorkspaceLabel={createWorkspaceLabel}
              disabledSubmit={disabledSubmit}
              isInitialProjectsLoading={isInitialProjectsLoading}
              isSubmitting={isSubmitting}
              onAddProject={() => {
                waitingForNewProjectRef.current = true;
                onAddProject?.();
              }}
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
              onProjectChange={setProjectId}
              onSlashCancel={() => {
                if (suppressSlashCancelRef.current) return;
                if (slashPopoverViewRef.current === "disable_skills") {
                  // Chip filter still owns focus; keep the disable session open.
                  return;
                }
                closeSlashPopover();
              }}
              onSlashTrigger={(ctx) => {
                if (slashPopoverViewRef.current === "disable_skills") return;
                setSlashPopover({
                  top: ctx.caretRect.bottom + 4,
                  left: ctx.caretRect.left,
                  slashOffset: ctx.slashOffset,
                  query: ctx.query,
                });
                setSlashPopoverView("menu");
              }}
              onSkillDisableFilterChange={setSkillDisableFilter}
              onSkillDisableSessionClosed={handleSkillDisableSessionClosed}
              onTextChange={(text) => {
                setInitialRequirement(text);
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
              placeholder={
                <WelcomeComposerPlaceholder
                  exitingPlaceholder={exitingPlaceholder}
                  visiblePlaceholder={visiblePlaceholder}
                />
              }
              priority={priority}
              projectId={projectId}
              projects={projects}
              selectedLabels={selectedLabels}
              selectedProject={selectedProject}
              setPriority={setPriority}
              setSelectedLabels={setSelectedLabels}
              setWorkflowStatus={setWorkflowStatus}
              workflowStatus={workflowStatus}
              workspaceLabels={workspaceLabels}
              footer={composerFooter}
            />
          </div>

          <WelcomeProjectRequirementNotice
            isInitialProjectsLoading={isInitialProjectsLoading}
            onAddProject={onAddProject}
            projectCount={projects.length}
          />
        </form>
      </div>
    </div>
  );
};

export default WelcomePage;

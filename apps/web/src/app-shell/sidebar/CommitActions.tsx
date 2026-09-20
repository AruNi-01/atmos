"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  BorderBeam,
  Upload,
  Loader2,
  ArrowDown,
  ChevronDown,
  RotateCw,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toastManager,
} from "@workspace/ui";
import { wrapAiContextClipboard } from "@/shared/lib/ai-context-protocol";
import {
  CloudSync,
  MessageCircleReply,
  Sparkles,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useAgentChatCenterTabsStore } from "@/features/agent/store/use-agent-chat-center-tabs";
import { useEditorStore, EDITOR_CONFLICT_RESOLVE_ALL_PATH } from "@/features/editor/store/use-editor-store";
import {
  formatGitActionErrorForDisplay,
  isConflictActionError,
} from "@/features/git/store/use-git-store";
import {
  GitChangedFile,
  functionSettingsApi,
  gitApi,
  llmProvidersApi,
  skillsApi,
  type LlmProvidersFile,
} from "@/api/ws-api";
import type { GitStatusResponse } from "@/api/ws-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import type { AgentChatMode } from "@/features/agent/types/index";
import type { QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import { agentCliRouteLabel } from "@/app-shell/llm-providers-modal-utils";
import {
  CommitActionsPanelChanges,
  CommitActionsPanelHeader,
} from "@/app-shell/sidebar/CommitActionsPanelParts";
import { basenameFromPath } from "@/app-shell/sidebar/commit-actions-paths";

export function resolveGitCommitLlmProvider(
  config: LlmProvidersFile,
): { id: string; label: string } | null {
  const providerId = config.features.git_commit ?? null;
  if (!providerId) return null;

  const localAgentLabel = agentCliRouteLabel(providerId);
  if (localAgentLabel) {
    return {
      id: providerId,
      label: localAgentLabel,
    };
  }

  const provider = config.providers[providerId];
  if (!provider?.enabled) return null;

  return {
    id: providerId,
    label: provider.displayName?.trim() || providerId,
  };
}

interface ProjectLike {
  id: string;
  name: string;
}

interface WorkspaceLike {
  id: string;
  name?: string;
  localPath?: string | null;
}

type CommitActionsVariant = "sidebar" | "panel";

export interface CommitActionsProps {
  className?: string;
  variant?: CommitActionsVariant;
  currentProjectPath: string | null;
  currentProject: ProjectLike | undefined;
  currentWorkspace: WorkspaceLike | undefined;
  workspaceId: string | null | undefined;
  projectId: string | null | undefined;

  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
  untrackedFiles?: GitChangedFile[];
  isBranchPublished: boolean;
  gitStatus: GitStatusResponse | null;
  hasChanges: boolean;

  commitChanges: (message: string) => Promise<void>;
  pushChanges: () => Promise<void>;
  stageAllUnstaged: () => Promise<void>;
  pullChanges: () => Promise<void>;
  fetchChanges: () => Promise<void>;
  syncChanges: () => Promise<void>;

  agentHasAgents: boolean;
  agentIsConnected: boolean;
  agentIsBusy: boolean;

  enqueueAgentChatPrompt: (data: Omit<QueuedAgentPrompt, "id" | "createdAt">) => string;
  setPendingAgentChatMode: (mode: AgentChatMode | null) => void;
}

export const CommitActions: React.FC<CommitActionsProps> = ({
  className,
  variant = "sidebar",
  currentProjectPath,
  currentProject,
  currentWorkspace,
  workspaceId,
  projectId,
  stagedFiles,
  unstagedFiles,
  untrackedFiles = [],
  isBranchPublished,
  gitStatus,
  hasChanges,
  commitChanges,
  pushChanges,
  stageAllUnstaged,
  pullChanges,
  fetchChanges,
  syncChanges,
  agentHasAgents,
  agentIsConnected,
  agentIsBusy,
  enqueueAgentChatPrompt,
  setPendingAgentChatMode,
}) => {
  const t = useTranslations("AppShell.chrome");
  const { resolvedTheme } = useTheme();
  const beamTheme = resolvedTheme === "light" ? "light" : "dark";
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isGeneratingCommitMessage, setIsGeneratingCommitMessage] =
    useState(false);
  const [gitCommitLlmProviderLabel, setGitCommitLlmProviderLabel] = useState<
    string | null
  >(null);
  const [isGlobalActionLoading, setIsGlobalActionLoading] = useState(false);
  const [acpNewSession, setAcpNewSession] = useState(false);
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);

  const aiPopoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitMessageStreamUnsubscribeRef = useRef<(() => void) | null>(null);
  const commitMessageTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    functionSettingsApi
      .get()
      .then((s) => {
        setAcpNewSession(s.git_commit?.acp_new_session_switch ?? false);
      })
      .catch(() => {});
  }, []);

  const refreshGitCommitLlmProvider = useCallback(() => {
    llmProvidersApi
      .get()
      .then((config) => {
        const resolved = resolveGitCommitLlmProvider(config);
        setGitCommitLlmProviderLabel(resolved?.label ?? null);
      })
      .catch(() => {
        setGitCommitLlmProviderLabel(null);
      });
  }, []);

  useEffect(() => {
    refreshGitCommitLlmProvider();
  }, [refreshGitCommitLlmProvider]);

  useEffect(
    () => () => {
      if (commitMessageStreamUnsubscribeRef.current) {
        commitMessageStreamUnsubscribeRef.current();
        commitMessageStreamUnsubscribeRef.current = null;
      }
    },
    [],
  );

  const handleAcpNewSessionToggle = useCallback((checked: boolean) => {
    setAcpNewSession(checked);
    functionSettingsApi
      .update("git_commit", "acp_new_session_switch", checked)
      .catch(() => {});
  }, []);

  useLayoutEffect(() => {
    if (!isGeneratingCommitMessage) return;
    const textarea = commitMessageTextareaRef.current;
    if (!textarea) return;

    textarea.scrollTop = textarea.scrollHeight;
    const frameId = requestAnimationFrame(() => {
      textarea.scrollTop = textarea.scrollHeight;
    });

    return () => cancelAnimationFrame(frameId);
  }, [commitMessage, isGeneratingCommitMessage]);

  const formatActionError = useCallback((error: unknown) => {
    return formatGitActionErrorForDisplay(error) || t("commitActions.unknownError");
  }, [t]);

  const shouldSilenceConflictError = useCallback(
    (error: unknown) => {
      if (isConflictActionError(error)) {
        return true;
      }

      return gitStatus?.has_merge_conflicts ?? false;
    },
    [gitStatus],
  );

  const showActionErrorToast = useCallback(
    (title: string, error: unknown) => {
      if (shouldSilenceConflictError(error)) {
        return;
      }

      const description = formatActionError(error);

      toastManager.add({
        title,
        description,
        type: "error",
      });
    },
    [formatActionError, shouldSilenceConflictError],
  );
  const hasMergeConflicts = gitStatus?.has_merge_conflicts ?? false;
  const openEditorFile = useEditorStore((s) => s.openFile);

  const conflictedFiles = useMemo(() => {
    const filesByPath = new Map<string, GitChangedFile>();
    const isConflictedStatus = (status: string) =>
      ["DD", "AU", "UD", "UA", "DU", "AA", "UU", "U"].includes(status);

    for (const file of [...stagedFiles, ...unstagedFiles]) {
      if (isConflictedStatus(file.status)) {
        filesByPath.set(file.path, file);
      }
    }

    return Array.from(filesByPath.values());
  }, [stagedFiles, unstagedFiles]);

  const handleOpenConflictResolver = useCallback(async () => {
    if (conflictedFiles.length === 0) {
      toastManager.add({
        title: t("commitActions.noConflictedFilesFoundTitle"),
        description: t("commitActions.noConflictedFilesFoundDescription"),
        type: "warning",
      });
      return;
    }

    await openEditorFile(
      EDITOR_CONFLICT_RESOLVE_ALL_PATH,
      workspaceId || undefined,
      { preview: false },
    );
  }, [conflictedFiles.length, openEditorFile, t, workspaceId]);

  const handleCopyConflictPrompt = useCallback(async () => {
    const repoPath = currentProjectPath ?? t("commitActions.conflictPromptFallbackRepoPath");
    const contextLabel =
      currentWorkspace?.name?.trim() ||
      currentProject?.name?.trim() ||
      t("commitActions.conflictPromptFallbackWorkspace");
    const prompt = t("commitActions.conflictPromptBody", {
      contextLabel,
      repoPath,
    });

    try {
      await navigator.clipboard.writeText(wrapAiContextClipboard("git-conflict", prompt));
      toastManager.add({
        title: t("commitActions.conflictPromptCopiedTitle"),
        description: t("commitActions.conflictPromptCopiedDescription"),
        type: "success",
      });
    } catch (error) {
      console.error(error);
      toastManager.add({
        title: t("commitActions.failedToCopyConflictPromptTitle"),
        description: t("commitActions.failedToCopyConflictPromptDescription"),
        type: "error",
      });
    }
  }, [currentProject?.name, currentProjectPath, currentWorkspace?.name, t]);

  const handlePublish = async () => {
    setIsGlobalActionLoading(true);
    try {
      await pushChanges();
    } catch (e) {
      if (!shouldSilenceConflictError(e)) {
        console.error(e);
      }
      showActionErrorToast(t("commitActions.failedToPublishBranch"), e);
    } finally {
      setIsGlobalActionLoading(false);
    }
  };

  const handleGlobalAction = async (
    action: () => Promise<void>,
    errorTitle: string,
  ) => {
    setIsGlobalActionLoading(true);
    try {
      await action();
    } catch (e) {
      if (!shouldSilenceConflictError(e)) {
        console.error(e);
      }
      showActionErrorToast(errorTitle, e);
    } finally {
      setIsGlobalActionLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;

    setIsCommitting(true);
    try {
      if (stagedFiles.length === 0 && unstagedFiles.length > 0) {
        await stageAllUnstaged();
      }

      await commitChanges(commitMessage);
      setCommitMessage("");
    } catch (e) {
      if (!shouldSilenceConflictError(e)) {
        console.error(e);
      }
      showActionErrorToast(t("commitActions.failedToCommitChanges"), e);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleGenerateCommitMessage = async () => {
    if (!currentProjectPath) {
      toastManager.add({
        title: t("commitActions.noRepositoryContextTitle"),
        description: t("commitActions.noRepositoryContextDescription"),
        type: "error",
      });
      return;
    }

    let resolvedGitCommitLlmProviderLabel = gitCommitLlmProviderLabel;

    // If we have a cached provider, set generating state immediately for better UX
    if (gitCommitLlmProviderLabel) {
      setAiPopoverOpen(false);
      setIsGeneratingCommitMessage(true);
    }

    // Refresh provider config to ensure it's still valid
    try {
      const config = await llmProvidersApi.get();
      const resolved = resolveGitCommitLlmProvider(config);
      resolvedGitCommitLlmProviderLabel = resolved?.label ?? null;
      setGitCommitLlmProviderLabel(resolvedGitCommitLlmProviderLabel);
    } catch {
      resolvedGitCommitLlmProviderLabel = gitCommitLlmProviderLabel;
    }

    if (resolvedGitCommitLlmProviderLabel) {
      // Set generating state again if it wasn't set above (first time)
      if (!gitCommitLlmProviderLabel) {
        setAiPopoverOpen(false);
        setIsGeneratingCommitMessage(true);
      }
      let streamedMessage = "";

      if (commitMessageStreamUnsubscribeRef.current) {
        commitMessageStreamUnsubscribeRef.current();
        commitMessageStreamUnsubscribeRef.current = null;
      }

      setCommitMessage("");
      commitMessageStreamUnsubscribeRef.current = useWebSocketStore
        .getState()
        .onEvent("git_commit_message_chunk", (payload) => {
          const chunk =
            typeof payload === "object" && payload !== null
              ? (payload as { chunk?: unknown }).chunk
              : undefined;

          if (typeof chunk !== "string" || chunk.length === 0) return;

          streamedMessage += chunk;
          setCommitMessage(streamedMessage);
        });

      try {
        const result = await gitApi.generateCommitMessage(currentProjectPath);
        const finalMessage = result.message?.trim();
        if (finalMessage) {
          setCommitMessage(finalMessage);
        } else if (streamedMessage.trim()) {
          setCommitMessage(streamedMessage.trim());
        }
      } catch (error) {
        toastManager.add({
          title: t("commitActions.failedToGenerateCommitMessageTitle"),
          description: error instanceof Error ? error.message : t("commitActions.unknownError"),
          type: "error",
        });
      } finally {
        if (commitMessageStreamUnsubscribeRef.current) {
          commitMessageStreamUnsubscribeRef.current();
          commitMessageStreamUnsubscribeRef.current = null;
        }
        setIsGeneratingCommitMessage(false);
      }
      return;
    }

    // If no provider found, reset generating state and fall back to ACP
    setIsGeneratingCommitMessage(false);

    if (!agentHasAgents) {
      toastManager.add({
        title: t("commitActions.noAcpAgentAvailableTitle"),
        description: t("commitActions.noAcpAgentAvailableDescription"),
        type: "error",
      });
      return;
    }

    try {
      const skillInstalled =
        await skillsApi.isGitCommitSkillInstalledInSystem();
      if (!skillInstalled) {
        const toastId = toastManager.add({
          title: t("commitActions.gitCommitSkillNotFoundTitle"),
          description: t("commitActions.gitCommitSkillNotFoundDescription"),
          type: "error",
          timeout: 0,
          actionProps: {
            children: t("commitActions.installNow"),
            onClick: async () => {
              toastManager.update(toastId, {
                title: t("commitActions.installingGitCommitSkill"),
                type: "loading",
                description: undefined,
                actionProps: undefined,
              });
              try {
                await skillsApi.syncSingleSystemSkill("git-commit");
                toastManager.update(toastId, {
                  title: t("commitActions.gitCommitSkillInstalled"),
                  type: "success",
                  timeout: 3000,
                });
              } catch {
                toastManager.update(toastId, {
                  title: t("commitActions.installFailedTitle"),
                  description: t("commitActions.installFailedDescription"),
                  type: "error",
                  timeout: 5000,
                });
              }
            },
          },
        });
        return;
      }
    } catch {
      toastManager.add({
        title: t("commitActions.skillCheckFailedTitle"),
        description: t("commitActions.skillCheckFailedDescription"),
        type: "error",
      });
      return;
    }

    setAiPopoverOpen(false);
    const shouldForceNewSession = acpNewSession || !agentIsConnected;
    const skillPath = "~/.atmos/skills/.system/git-commit/SKILL.md";
    const prompt = `Read the skill instructions at ${skillPath} and follow the full workflow: analyze the diff, generate a conventional commit message, and execute the git commit. Do not ask for confirmation.`;
    const contextName =
      basenameFromPath(currentWorkspace?.localPath) ??
      currentProject?.name ??
      t("commitActions.acpSessionTitleFallbackProject");
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    enqueueAgentChatPrompt({
      prompt,
      workspaceId,
      projectId: workspaceId ? undefined : projectId,
      mode: "default",
      forceNewSession: shouldForceNewSession,
      origin: "git_commit",
      ...(shouldForceNewSession
        ? {
            sessionTitle: t("commitActions.acpSessionTitle", {
              contextName,
              time: timeStr,
            }),
          }
        : {}),
    });
    setPendingAgentChatMode("default");
    useAgentChatCenterTabsStore.getState().requestNewChat();
    toastManager.add({
      title: t("commitActions.commitPromptQueuedTitle"),
      description:
        agentIsBusy && !shouldForceNewSession
          ? t("commitActions.commitPromptQueuedBusyDescription")
          : t("commitActions.commitPromptQueuedDescription"),
      type: "success",
    });
  };

  const showPublishButton = !isBranchPublished;
  const showSyncPushButton =
    isBranchPublished &&
    !!gitStatus?.has_unpushed_commits &&
    (gitStatus.upstream_behind_count ?? 0) > 0 &&
    stagedFiles.length === 0 &&
    !commitMessage.trim();
  const showPushButton =
    isBranchPublished &&
    !!gitStatus?.has_unpushed_commits &&
    (gitStatus.upstream_behind_count ?? 0) === 0 &&
    stagedFiles.length === 0 &&
    !commitMessage.trim();
  const hasPrimaryGitAction =
    showPublishButton || showSyncPushButton || showPushButton;
  const isCommitDisabled =
    !commitMessage.trim() ||
    (stagedFiles.length === 0 && unstagedFiles.length === 0);
  const isPrimaryButtonDisabled =
    isCommitting ||
    isGeneratingCommitMessage ||
    isGlobalActionLoading ||
    (hasMergeConflicts && conflictedFiles.length === 0) ||
    (!hasMergeConflicts && !hasPrimaryGitAction && isCommitDisabled);
  const isPanel = variant === "panel";

  return (
    <div
      className={cn(
        isPanel
          ? "flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background"
          : "shrink-0 space-y-3 p-3 backdrop-blur-sm",
        className,
      )}
    >
      {isPanel ? (
        <CommitActionsPanelHeader
          currentProjectName={currentProject?.name}
          currentProjectPath={currentProjectPath}
          currentWorkspaceName={currentWorkspace?.name}
          gitStatus={gitStatus}
          stagedFiles={stagedFiles}
          unstagedFiles={unstagedFiles}
          untrackedFiles={untrackedFiles}
        />
      ) : null}

      <div
        className={cn(
          isPanel
            ? "flex min-h-0 flex-1 gap-4 overflow-hidden px-4 pb-4"
            : "space-y-3",
        )}
      >
        <div
          className={cn(isPanel ? "order-2 flex min-h-0 flex-none flex-col gap-3" : "space-y-3")}
          style={isPanel ? { width: "calc(40% - 0.5rem)" } : undefined}
        >
          <div className={cn("relative", isPanel && "min-h-0 flex-1")}>
            <BorderBeam
              size="pulse-inner"
              colorVariant="mono"
              theme={beamTheme}
              active={isGeneratingCommitMessage}
              className={cn(
                // Fixed host size in sidebar; only the beam animation toggles.
                // Bloom stays out of flow so it cannot stretch the frame.
                "block w-full [&>[data-beam-bloom]]:pointer-events-none [&>[data-beam-bloom]]:!absolute [&>[data-beam-bloom]]:!inset-0 [&>[data-beam-bloom]]:!h-auto [&>[data-beam-bloom]]:!w-auto",
                isPanel
                  ? "h-full min-h-0 [&>:first-child]:h-full [&>:first-child]:w-full"
                  : "h-[60px] [&>:first-child]:h-full [&>:first-child]:w-full",
              )}
              borderRadius={isPanel ? 8 : 6}
            >
              <textarea
                ref={commitMessageTextareaRef}
                rows={3}
                placeholder={
                  isGeneratingCommitMessage
                    ? ""
                    : t("commitActions.messagePlaceholder")
                }
                value={
                  isGeneratingCommitMessage && !commitMessage.trim()
                    ? t("commitActions.generatingCommitMessage")
                    : commitMessage
                }
                onChange={(e) => {
                  if (isGeneratingCommitMessage) return;
                  setCommitMessage(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (isGeneratingCommitMessage) {
                    e.preventDefault();
                    return;
                  }
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleCommit();
                  }
                }}
                readOnly={isGeneratingCommitMessage}
                disabled={isGeneratingCommitMessage}
                aria-busy={isGeneratingCommitMessage}
                className={cn(
                  // Fixed height + internal scroll: streaming/long messages never
                  // grow the beam frame (field-sizing-fixed disables content sizing).
                  "box-border field-sizing-fixed w-full resize-none overflow-y-auto focus:outline-none focus:ring-0",
                  isPanel
                    ? "h-full min-h-[220px] rounded-lg border border-border/70 bg-muted/30 p-3 pr-10 text-sm leading-6 text-foreground placeholder:text-muted-foreground/60 focus:border-border focus:bg-background"
                    : "h-full rounded-md border border-transparent bg-sidebar-accent/50 p-2.5 pr-8 text-xs leading-snug text-sidebar-foreground placeholder:text-muted-foreground/50 focus:border-sidebar-border/50 focus:bg-sidebar-accent",
                  isGeneratingCommitMessage && "cursor-wait text-muted-foreground",
                )}
              />
            </BorderBeam>
            <Popover open={aiPopoverOpen} onOpenChange={setAiPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  onClick={handleGenerateCommitMessage}
                  onMouseEnter={() => {
                    refreshGitCommitLlmProvider();
                    if (aiPopoverTimer.current)
                      clearTimeout(aiPopoverTimer.current);
                    aiPopoverTimer.current = setTimeout(
                      () => setAiPopoverOpen(true),
                      400,
                    );
                  }}
                  onMouseLeave={() => {
                    if (aiPopoverTimer.current) {
                      clearTimeout(aiPopoverTimer.current);
                      aiPopoverTimer.current = null;
                    }
                    aiPopoverTimer.current = setTimeout(
                      () => setAiPopoverOpen(false),
                      300,
                    );
                  }}
                  disabled={!hasChanges || isGeneratingCommitMessage}
                  className={cn(
                    "absolute rounded-sm",
                    isPanel ? "right-2.5 top-2.5 p-1.5" : "right-1.5 top-1.5 p-1",
                    hasChanges && !isGeneratingCommitMessage
                      ? "text-muted-foreground hover:text-foreground cursor-pointer"
                      : "text-muted-foreground/30 cursor-not-allowed",
                  )}
                >
                  <Sparkles
                    className={cn(
                      isPanel ? "size-4" : "size-3.5",
                      isGeneratingCommitMessage && "animate-pulse",
                    )}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                className="w-56 p-1"
                onMouseEnter={() => {
                  if (aiPopoverTimer.current) {
                    clearTimeout(aiPopoverTimer.current);
                    aiPopoverTimer.current = null;
                  }
                }}
                onMouseLeave={() => {
                  aiPopoverTimer.current = setTimeout(
                    () => setAiPopoverOpen(false),
                    300,
                  );
                }}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {gitCommitLlmProviderLabel ? (
                  <p className="px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    {t("commitActions.llmProviderEnabled")}
                    <span className="block pt-1 text-foreground/80">
                      {t("commitActions.llmProviderEnabledDescription", {
                        provider: gitCommitLlmProviderLabel,
                      })}
                    </span>
                  </p>
                ) : (
                  <>
                    <p className="px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {t("commitActions.noLlmProviderEnabled")}
                      <span className="block pt-1">
                        {t("commitActions.noLlmProviderEnabledDescription")}
                      </span>
                    </p>
                    <div className="border-t border-border mx-1.5 my-1" />
                    <div className="flex items-center justify-between gap-3 rounded-sm px-2.5 py-2 hover:bg-muted">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <label
                              htmlFor="acp-new-session"
                              className="text-xs font-medium text-popover-foreground cursor-help select-none"
                            >
                              {t("commitActions.newAcpSession")}
                            </label>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-[200px] text-xs"
                          >
                            {t("commitActions.newAcpSessionTooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Switch
                        id="acp-new-session"
                        checked={acpNewSession}
                        onCheckedChange={handleAcpNewSessionToggle}
                        className="scale-80 shrink-0"
                      />
                    </div>
                    <div className="border-t border-border mx-1.5 my-1" />
                    <p className="px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {t("commitActions.fallbackModeDescription")}
                    </p>
                  </>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <div className={cn("flex w-full items-stretch shadow-sm group", isPanel ? "h-10" : "h-8")}>
            <button
              onClick={
                hasMergeConflicts
                  ? () => void handleOpenConflictResolver()
                  : showPublishButton
                  ? handlePublish
                  : showSyncPushButton
                    ? () => handleGlobalAction(syncChanges, t("commitActions.failedToSyncAndPush"))
                    : showPushButton
                    ? () => handleGlobalAction(pushChanges, t("commitActions.failedToPushChanges"))
                    : handleCommit
              }
              disabled={isPrimaryButtonDisabled}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 transition-all font-semibold select-none",
                isPanel ? "rounded-l-lg text-sm" : "rounded-l-md text-xs",
                isPrimaryButtonDisabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : showSyncPushButton || showPushButton
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-sidebar-border border-r-sidebar-border/40"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 border-r border-r-primary-foreground/20",
              )}
            >
              {(isCommitting || isGlobalActionLoading) && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              <span>
                {hasMergeConflicts
                  ? t("commitActions.needResolveConflicts")
                  : showPublishButton
                  ? isGlobalActionLoading
                    ? t("commitActions.publishing")
                    : t("commitActions.publishBranch")
                  : showSyncPushButton
                    ? isGlobalActionLoading
                      ? t("commitActions.syncing")
                      : t("commitActions.syncAndPush", {
                          unpushedSuffix: gitStatus?.unpushed_count ? ` ↑${gitStatus.unpushed_count}` : "",
                          behindSuffix:
                            (gitStatus?.upstream_behind_count ?? 0) > 0
                              ? ` ↓${gitStatus?.upstream_behind_count}`
                              : "",
                        })
                  : showPushButton
                    ? isGlobalActionLoading
                      ? t("commitActions.pushing")
                      : t("commitActions.push", {
                          suffix: gitStatus?.unpushed_count ? ` ↑${gitStatus.unpushed_count}` : "",
                        })
                    : isCommitting
                      ? t("commitActions.committing")
                      : t("common.commit")}
              </span>
            </button>

            {hasMergeConflicts ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => void handleCopyConflictPrompt()}
                      className={cn(
                        "flex h-full items-center justify-center border-l border-l-blue-500/40 bg-blue-500/10 text-blue-300 hover:text-blue-200",
                        isPanel ? "rounded-r-lg px-3" : "rounded-r-md px-2",
                      )}
                    >
                      <MessageCircleReply className="size-3.5 text-blue-400" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {t("commitActions.askAgentToResolveConflict")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center justify-center border-l-0",
                      isPanel ? "rounded-r-lg px-3" : "rounded-r-md px-2",
                      isPrimaryButtonDisabled
                        ? "bg-muted text-muted-foreground"
                        : showSyncPushButton || showPushButton
                          ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-y border-r border-sidebar-border"
                          : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                    disabled={isPrimaryButtonDisabled}
                  >
                    <ChevronDown className="size-3.5 opacity-80" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => handleGlobalAction(pullChanges, t("commitActions.failedToPullChanges"))}>
                    <ArrowDown className="mr-2 size-4" /> {t("common.pull")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleGlobalAction(pushChanges, t("commitActions.failedToPushChanges"))}>
                    <Upload className="mr-2 size-4" /> {t("common.push")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleGlobalAction(fetchChanges, t("commitActions.failedToFetchChanges"))}>
                    <RotateCw className="mr-2 size-4" /> {t("common.fetch")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleGlobalAction(syncChanges, t("commitActions.failedToSyncWithRemote"))}>
                    <CloudSync className="mr-2 size-4" /> {t("commitActions.syncWithRemote")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {isPanel ? (
          <CommitActionsPanelChanges
            stagedFiles={stagedFiles}
            unstagedFiles={unstagedFiles}
            untrackedFiles={untrackedFiles}
            workspaceId={workspaceId}
          />
        ) : null}
      </div>
    </div>
  );
};

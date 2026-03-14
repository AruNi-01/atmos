"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import {
  Upload,
  Loader2,
  ArrowDown,
  ChevronDown,
  RefreshCw,
} from "@workspace/ui";
import {
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
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GitChangedFile,
  functionSettingsApi,
  gitApi,
  llmProvidersApi,
  skillsApi,
  type LlmProvidersFile,
} from "@/api/ws-api";
import type { GitStatusResponse } from "@/api/ws-api";
import { useWebSocketStore } from "@/hooks/use-websocket";
import type { AgentChatMode } from "@/types/agent-chat";
import type { QueuedAgentPrompt } from "@/hooks/use-dialog-store";

export function resolveGitCommitLlmProvider(
  config: LlmProvidersFile,
): { id: string; label: string } | null {
  const providerId = config.features.git_commit ?? null;
  if (!providerId) return null;

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

export interface CommitActionsProps {
  currentProjectPath: string | null;
  currentProject: ProjectLike | undefined;
  currentWorkspace: WorkspaceLike | undefined;
  workspaceId: string | null | undefined;
  projectId: string | null | undefined;

  stagedFiles: GitChangedFile[];
  unstagedFiles: GitChangedFile[];
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
  setAgentChatOpen: (open: boolean) => void;
}

export const CommitActions: React.FC<CommitActionsProps> = ({
  currentProjectPath,
  currentProject,
  currentWorkspace,
  workspaceId,
  projectId,
  stagedFiles,
  unstagedFiles,
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
  setAgentChatOpen,
}) => {
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

  const handlePublish = async () => {
    setIsGlobalActionLoading(true);
    try {
      await pushChanges();
    } catch (e) {
      console.error(e);
    } finally {
      setIsGlobalActionLoading(false);
    }
  };

  const handleGlobalAction = async (action: () => Promise<void>) => {
    setIsGlobalActionLoading(true);
    try {
      await action();
    } catch (e) {
      console.error(e);
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
      console.error(e);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleGenerateCommitMessage = async () => {
    if (!currentProjectPath) {
      toastManager.add({
        title: "No Repository Context",
        description:
          "Open a project workspace first to generate a commit message.",
        type: "error",
      });
      return;
    }

    let resolvedGitCommitLlmProviderLabel = gitCommitLlmProviderLabel;
    try {
      const config = await llmProvidersApi.get();
      const resolved = resolveGitCommitLlmProvider(config);
      resolvedGitCommitLlmProviderLabel = resolved?.label ?? null;
      setGitCommitLlmProviderLabel(resolvedGitCommitLlmProviderLabel);
    } catch {
      resolvedGitCommitLlmProviderLabel = gitCommitLlmProviderLabel;
    }

    if (resolvedGitCommitLlmProviderLabel) {
      setAiPopoverOpen(false);
      setIsGeneratingCommitMessage(true);
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
          title: "Failed to generate commit message",
          description: error instanceof Error ? error.message : "Unknown error",
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

    if (!agentHasAgents) {
      toastManager.add({
        title: "No ACP Agent Available",
        description:
          "Install an ACP agent first to use AI commit message generation.",
        type: "error",
      });
      return;
    }

    try {
      const skillInstalled =
        await skillsApi.isGitCommitSkillInstalledInSystem();
      if (!skillInstalled) {
        const toastId = toastManager.add({
          title: "Git Commit Skill Not Found",
          description: "The git-commit skill is not installed.",
          type: "error",
          timeout: 0,
          actionProps: {
            children: "Install Now",
            onClick: async () => {
              toastManager.update(toastId, {
                title: "Installing git-commit skill...",
                type: "loading",
                description: undefined,
                actionProps: undefined,
              });
              try {
                await skillsApi.syncSingleSystemSkill("git-commit");
                toastManager.update(toastId, {
                  title: "Git Commit Skill Installed",
                  type: "success",
                  timeout: 3000,
                });
              } catch {
                toastManager.update(toastId, {
                  title: "Install Failed",
                  description: "Please try again.",
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
        title: "Skill Check Failed",
        description:
          "Unable to verify git-commit skill status. Please try again.",
        type: "error",
      });
      return;
    }

    setAiPopoverOpen(false);
    const shouldForceNewSession = acpNewSession || !agentIsConnected;
    const skillPath = "~/.atmos/skills/.system/git-commit/SKILL.md";
    const prompt = `Read the skill instructions at ${skillPath} and follow the full workflow: analyze the diff, generate a conventional commit message, and execute the git commit. Do not ask for confirmation.`;
    const contextName =
      currentWorkspace?.localPath?.split("/").pop() ??
      currentProject?.name ??
      "Project";
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
        ? { sessionTitle: `${contextName}_GitCommit_${timeStr}` }
        : {}),
    });
    setPendingAgentChatMode("default");
    setAgentChatOpen(true);
    toastManager.add({
      title: "Commit Prompt Queued",
      description:
        agentIsBusy && !shouldForceNewSession
          ? "The ACP git-commit prompt was added to the chat queue."
          : "The ACP git-commit prompt was queued and will run in Agent Chat.",
      type: "success",
    });
  };

  const showPublishButton = !isBranchPublished;
  const showPushButton =
    isBranchPublished &&
    !!gitStatus?.has_unpushed_commits &&
    stagedFiles.length === 0 &&
    !commitMessage.trim();

  return (
    <div className="p-3 border-t border-sidebar-border shrink-0 space-y-3  backdrop-blur-sm">
      {/* Input with AI generate button */}
      <div className="relative">
        <textarea
          ref={commitMessageTextareaRef}
          placeholder={
            isGeneratingCommitMessage
              ? ""
              : "Message (⌘+Enter to commit)"
          }
          value={
            isGeneratingCommitMessage && !commitMessage
              ? "Generating commit message..."
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
          className={cn(
            "w-full min-h-[60px] p-2.5 pr-8 bg-sidebar-accent/50 border-transparent focus:border-sidebar-border/50 focus:bg-sidebar-accent rounded-md text-sidebar-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 transition-all ease-out duration-200 text-xs resize-none",
            isGeneratingCommitMessage &&
              "cursor-wait animate-pulse text-muted-foreground",
          )}
        />
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
                "absolute top-1.5 right-1.5 p-1 rounded-sm transition-colors",
                hasChanges && !isGeneratingCommitMessage
                  ? "text-muted-foreground hover:text-foreground cursor-pointer"
                  : "text-muted-foreground/30 cursor-not-allowed",
              )}
            >
              <Sparkles
                className={cn(
                  "size-3.5",
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
                LLM Provider is enabled for git commit generation.
                <span className="block pt-1 text-foreground/80">
                  Click to generate directly here with{" "}
                  {gitCommitLlmProviderLabel}.
                </span>
              </p>
            ) : (
              <>
                <p className="px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  No LLM Provider is enabled for git commit
                  generation.
                  <span className="block pt-1">
                    Configure one in LLM Providers to generate
                    directly in this input.
                  </span>
                </p>
                <div className="border-t border-border mx-1.5 my-1" />
                <div className="flex items-center justify-between gap-3 rounded-sm px-2.5 py-2 hover:bg-muted transition-colors">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          htmlFor="acp-new-session"
                          className="text-xs font-medium text-popover-foreground cursor-help select-none"
                        >
                          New ACP Session
                        </label>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-[200px] text-xs"
                      >
                        Starts a fresh ACP session each time, which
                        may take ~10s to initialize.
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
                  Fallback mode uses ACP Agent to generate the commit
                  message and commit locally.
                </p>
              </>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Main Button with Dropdown */}
      <div className="flex items-stretch gap-px h-8 w-full group shadow-sm">
        <button
          onClick={
            showPublishButton
              ? handlePublish
              : showPushButton
                ? () => handleGlobalAction(syncChanges)
                : handleCommit
          }
          disabled={
            isCommitting ||
            isGeneratingCommitMessage ||
            isGlobalActionLoading ||
            (!showPublishButton &&
              !showPushButton &&
              (!commitMessage.trim() ||
                (stagedFiles.length === 0 &&
                  unstagedFiles.length === 0)))
          }
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-l-md transition-all text-xs font-semibold select-none",
            isCommitting ||
              isGeneratingCommitMessage ||
              isGlobalActionLoading ||
              (!showPublishButton &&
                !showPushButton &&
                (!commitMessage.trim() ||
                  (stagedFiles.length === 0 &&
                    unstagedFiles.length === 0)))
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : showPushButton
                ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-sidebar-border"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {(isCommitting || isGlobalActionLoading) && (
            <Loader2 className="size-3.5 animate-spin" />
          )}
          <span>
            {showPublishButton
              ? isGlobalActionLoading
                ? "Publishing..."
                : "Publish Branch"
              : showPushButton
                ? isGlobalActionLoading
                  ? "Syncing..."
                  : `Sync Changes ${gitStatus?.unpushed_count ? `↑${gitStatus.unpushed_count}` : ""}`
                : isCommitting
                  ? "Committing..."
                  : "Commit"}
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "px-2 flex items-center justify-center rounded-r-md border-l transition-colors",
                isCommitting ||
                  isGlobalActionLoading ||
                  (!showPublishButton &&
                    !showPushButton &&
                    (!commitMessage.trim() ||
                      (stagedFiles.length === 0 &&
                        unstagedFiles.length === 0)))
                  ? "bg-muted text-muted-foreground border-l-transparent"
                  : showPushButton
                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-y border-r border-sidebar-border border-l-sidebar-border/50"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 border-l-primary-foreground/10",
              )}
              disabled={
                isCommitting ||
                isGlobalActionLoading ||
                (!showPublishButton &&
                  !showPushButton &&
                  (!commitMessage.trim() ||
                    (stagedFiles.length === 0 &&
                      unstagedFiles.length === 0)))
              }
            >
              <ChevronDown className="size-3.5 opacity-80" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => handleGlobalAction(pullChanges)}
            >
              <ArrowDown className="mr-2 size-4" /> Pull
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleGlobalAction(pushChanges)}
            >
              <Upload className="mr-2 size-4" /> Push
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleGlobalAction(fetchChanges)}
            >
              <RefreshCw className="mr-2 size-4" /> Fetch
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleGlobalAction(syncChanges)}
            >
              <RefreshCw className="mr-2 size-4" /> Sync
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

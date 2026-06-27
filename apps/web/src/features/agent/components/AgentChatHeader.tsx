"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TextShimmer,
  TextScramble,
  cn,
} from "@workspace/ui";
import { Bot, Download, ExternalLink, Folder, Heart, LogOut, Maximize2, Minimize2, MoreHorizontal, Plus, X } from "lucide-react";
import type { RegistryAgent } from "@/api/ws-api";
import type {
  AgentCapabilities,
  AgentChatSessionItem,
  AgentImplementationInfo,
} from "@/api/rest-api";
import type { ConversationMessage } from "@workspace/ui";
import { AgentIcon } from "./AgentIcon";
import { AgentChatHistoryPopover } from "./AgentChatHistoryPopover";

interface AgentChatHeaderProps {
  variant: "modal" | "sidebar" | "standalone";
  handleDragStart?: (e: React.MouseEvent) => void;
  handleOpenStandaloneWindow?: () => Promise<void>;
  handleToggleFullscreen?: () => void;
  isFullscreen?: boolean;

  // Hover
  headerHovered: boolean;
  setHeaderHovered: React.Dispatch<React.SetStateAction<boolean>>;

  // Connection
  isConnected: boolean;
  isConnecting: boolean;

  // Agent
  activeAgent: RegistryAgent | null;
  agentInfo: AgentImplementationInfo | null;
  capabilities: AgentCapabilities | null;
  installedAgents: RegistryAgent[];
  defaultRegistryId: string;
  registryId: string;

  // New session agents menu
  newSessionAgentsOpen: boolean;
  setNewSessionAgentsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleCreateNewSession: (targetRegistryId?: string) => Promise<void>;
  handleOpenNewSessionAgentsMenu: () => void;
  handleScheduleCloseNewSessionAgentsMenu: () => void;
  handleSetDefaultAgent: (agentId: string) => void;

  // Labels
  panelTitle: string;

  // CWD
  localPath: string | null;
  sessionCwd: string | null;

  // Export
  exportableMessages: ConversationMessage[];
  handleExportConversation: () => void;

  // History
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historySessions: AgentChatSessionItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  historyResumeUnsupportedReason: string | null;
  historyUnsupportedReason: string | null;
  loadHistorySessions: (cursor?: string) => Promise<void>;
  handleSelectHistorySession: (s: AgentChatSessionItem) => void;
  historyTriggerClassName?: string;

  // Close
  handleClose: () => void;
  handleLogoutAgent: () => Promise<void>;

  // Title
  displaySessionTitle: string | null;
  isAutoGeneratingTitle: boolean;
  shouldScrambleAutoTitle: boolean;
  setShouldScrambleAutoTitle: React.Dispatch<React.SetStateAction<boolean>>;
  sessionTitleSource: string | null;
  sessionId: string | null;
}

export function AgentChatHeader({
  variant,
  handleDragStart,
  handleOpenStandaloneWindow,
  handleToggleFullscreen,
  isFullscreen = false,
  headerHovered,
  setHeaderHovered,
  isConnected,
  isConnecting,
  activeAgent,
  agentInfo,
  capabilities,
  installedAgents,
  defaultRegistryId,
  newSessionAgentsOpen,
  setNewSessionAgentsOpen,
  handleCreateNewSession,
  handleOpenNewSessionAgentsMenu,
  handleScheduleCloseNewSessionAgentsMenu,
  handleSetDefaultAgent,
  panelTitle,
  localPath,
  sessionCwd,
  exportableMessages,
  handleExportConversation,
  historyOpen,
  setHistoryOpen,
  historySessions,
  historyHasMore,
  historyLoading,
  historyCursor,
  historyResumeUnsupportedReason,
  historyUnsupportedReason,
  loadHistorySessions,
  handleSelectHistorySession,
  historyTriggerClassName,
  handleClose,
  handleLogoutAgent,
  displaySessionTitle,
  isAutoGeneratingTitle,
  shouldScrambleAutoTitle,
  setShouldScrambleAutoTitle,
  sessionTitleSource,
  sessionId,
}: AgentChatHeaderProps) {
  const [logoutConfirmOpen, setLogoutConfirmOpen] = React.useState(false);
  const displayedAgentName = isConnected && activeAgent
    ? (agentInfo?.title ?? agentInfo?.name ?? activeAgent.name)
    : panelTitle;
  const canLogout = Boolean(capabilities?.logout.supported);
  const shouldAnimateSessionTitle =
    shouldScrambleAutoTitle &&
    Boolean(displaySessionTitle) &&
    (sessionTitleSource === "auto" || sessionTitleSource === "agent");
  const animatedSessionTitle = shouldAnimateSessionTitle ? displaySessionTitle : null;
  const displayedCwd = sessionCwd ?? localPath;
  const displayedCwdLabel = sessionCwd ? "Current working directory" : "Context directory";

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-1 px-4 py-3",
        variant === "modal" && handleDragStart && "cursor-grab active:cursor-grabbing"
      )}
      onMouseDown={variant === "modal" && handleDragStart ? handleDragStart : undefined}
      onMouseEnter={() => setHeaderHovered(true)}
      onMouseLeave={() => setHeaderHovered(false)}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative size-5">
              <div
                className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${headerHovered
                  ? "translate-y-[-2px] scale-90 opacity-0"
                  : "translate-y-0 scale-100 opacity-100"
                  }`}
              >
                {isConnected && activeAgent ? (
                  <AgentIcon
                    registryId={activeAgent.id}
                    name={activeAgent.name}
                    size={16}
                    isCustom={activeAgent.install_method === "custom"}
                    registryIcon={activeAgent.icon}
                  />
                ) : (
                  <Bot className="size-4 shrink-0 text-foreground" />
                )}
              </div>
              <Popover open={newSessionAgentsOpen} onOpenChange={setNewSessionAgentsOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void handleCreateNewSession()}
                    onMouseEnter={handleOpenNewSessionAgentsMenu}
                    onMouseLeave={handleScheduleCloseNewSessionAgentsMenu}
                    className={`absolute inset-0 flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-all duration-200 ease-out hover:bg-muted hover:text-foreground ${headerHovered
                      ? "translate-y-0 scale-100 opacity-100"
                      : "translate-y-[2px] scale-90 opacity-0 pointer-events-none"
                      }`}
                    aria-label="New chat session"
                    title="New session (default agent)"
                  >
                    <Plus className="size-4 shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 p-1"
                  align="start"
                  onMouseEnter={handleOpenNewSessionAgentsMenu}
                  onMouseLeave={handleScheduleCloseNewSessionAgentsMenu}
                >
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Create session with agent</p>
                  </div>
                  <div className="max-h-56 overflow-auto">
                    {installedAgents.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground">No installed agent</div>
                    )}
                    {installedAgents.map((agent) => {
                      const isDefault = agent.id === defaultRegistryId;
                      return (
                        <div
                          key={agent.id}
                          className="group flex items-center justify-between gap-1 rounded-sm px-1 py-0.5 hover:bg-muted"
                        >
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                            onClick={() => {
                              setNewSessionAgentsOpen(false);
                              void handleCreateNewSession(agent.id);
                            }}
                          >
                            <AgentIcon
                              registryId={agent.id}
                              name={agent.name}
                              size={14}
                              isCustom={agent.install_method === "custom"}
                              registryIcon={agent.icon}
                            />
                            <span className="truncate">{agent.name}</span>
                          </button>
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className={`rounded-sm p-1.5 transition-all ${isDefault
                                    ? "text-primary opacity-100"
                                    : "text-muted-foreground/60 opacity-0 group-hover:opacity-100 hover:text-primary hover:bg-primary/5"
                                    }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetDefaultAgent(agent.id);
                                  }}
                                  aria-label={isDefault ? "Current default agent" : `Set ${agent.name} as default`}
                                >
                                  <Heart className={`size-3.5 ${isDefault ? "fill-primary" : ""}`} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="z-100 text-[10px] py-1 px-2">
                                {isDefault ? "Default agent" : "Set as default"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {isConnected && activeAgent ? (
              <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                <TooltipProvider delayDuration={250}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="max-w-[200px] shrink-0 truncate text-sm font-medium">
                        {displayedAgentName}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      {agentInfo ? (
                        <div className="space-y-0.5">
                          <p>{agentInfo.title ?? agentInfo.name}</p>
                          <p className="text-muted-foreground">
                            {agentInfo.name}{agentInfo.version ? ` ${agentInfo.version}` : ""}
                          </p>
                        </div>
                      ) : (
                        activeAgent.name
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-sm font-medium shrink-0">{panelTitle}</span>
              </div>
            )}
          </div>

          {displayedCwd && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="ml-2 flex min-w-0 max-w-[180px] cursor-help items-center gap-1.5 overflow-hidden rounded-md border border-border/50 bg-muted/40 px-2 py-0.5">
                    <Folder className="size-3 shrink-0 text-muted-foreground/70" />
                    <span
                      className="truncate select-none text-[10px] leading-none text-muted-foreground/80"
                      style={{ direction: "rtl", textAlign: "left" }}
                    >
                      {displayedCwd}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs break-all">
                  <p className="mb-0.5 text-[11px] text-muted-foreground">{displayedCwdLabel}</p>
                  <p className="text-[11px]">{displayedCwd}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <AgentChatHistoryPopover
            triggerClassName={historyTriggerClassName}
            historyOpen={historyOpen}
            setHistoryOpen={setHistoryOpen}
            historySessions={historySessions}
            historyHasMore={historyHasMore}
            historyLoading={historyLoading}
            historyCursor={historyCursor}
            historyResumeUnsupportedReason={historyResumeUnsupportedReason}
            historyUnsupportedReason={historyUnsupportedReason}
            loadHistorySessions={loadHistorySessions}
            handleSelectHistorySession={handleSelectHistorySession}
            isConnecting={isConnecting}
          />
          {variant !== "standalone" && handleToggleFullscreen ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleToggleFullscreen}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={isFullscreen ? "Exit fullscreen chat" : "Open chat fullscreen"}
                  >
                    {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <DropdownMenu>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="More chat actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">More actions</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                className="cursor-pointer"
                disabled={exportableMessages.length === 0}
                onSelect={handleExportConversation}
              >
                <Download className="size-4" />
                <span>Export conversation</span>
              </DropdownMenuItem>
              {variant === "modal" && handleOpenStandaloneWindow ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => void handleOpenStandaloneWindow()}
                >
                  <ExternalLink className="size-4" />
                  <span>Open in window</span>
                </DropdownMenuItem>
              ) : null}
              {canLogout ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  disabled={isConnecting}
                  variant="destructive"
                  onSelect={() => setLogoutConfirmOpen(true)}
                >
                  <LogOut className="size-4" />
                  <span>Log out agent</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
            <DialogContent className="w-72 gap-3 p-4" showCloseButton={false}>
              <DialogTitle className="text-sm">Log out agent?</DialogTitle>
              <DialogDescription className="text-xs leading-5">
                This clears the agent authentication for the current workspace context.
              </DialogDescription>
              <DialogFooter className="mt-1 flex-row justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => setLogoutConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                  disabled={isConnecting}
                  onClick={() => {
                    setLogoutConfirmOpen(false);
                    void handleLogoutAgent();
                  }}
                >
                  Log out
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {variant === "modal" && (
            <button
              type="button"
              onClick={handleClose}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close chat"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
      {(displaySessionTitle || isAutoGeneratingTitle) && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex w-fit max-w-full items-center gap-1 rounded px-1 -mx-1">
                {isAutoGeneratingTitle ? (
                  <span className="truncate text-xs">
                    <TextShimmer as="span" duration={1.5}>
                      Generating title...
                    </TextShimmer>
                  </span>
                ) : animatedSessionTitle ? (
                  <TextScramble
                    key={`session-title-${sessionTitleSource ?? "unknown"}-${sessionId ?? "session"}-${
                      animatedSessionTitle
                    }`}
                    as="span"
                    className="truncate text-xs text-muted-foreground"
                    duration={0.6}
                    speed={0.025}
                    onScrambleComplete={() => setShouldScrambleAutoTitle(false)}
                  >
                    {animatedSessionTitle}
                  </TextScramble>
                ) : (
                  <span className="truncate text-xs text-muted-foreground">{displaySessionTitle}</span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="z-100 max-w-[300px] break-words text-xs">
              {displaySessionTitle ?? "Generating title..."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

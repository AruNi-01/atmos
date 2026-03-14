"use client";

import React from "react";
import {
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
import { Bot, Download, Folder, Heart, Pencil, Plus, X } from "lucide-react";
import type { RegistryAgent } from "@/api/ws-api";
import type { AgentChatMode } from "@/types/agent-chat";
import type { AgentChatSessionItem } from "@/api/rest-api";
import type { ConversationMessage } from "@workspace/ui";
import { AgentIcon } from "./AgentIcon";
import { AgentChatHistoryPopover } from "./AgentChatHistoryPopover";

interface AgentChatHeaderProps {
  variant: "modal" | "sidebar";
  handleDragStart?: (e: React.MouseEvent) => void;

  // Hover
  headerHovered: boolean;
  setHeaderHovered: React.Dispatch<React.SetStateAction<boolean>>;

  // Connection
  isConnected: boolean;
  isConnecting: boolean;

  // Agent
  activeAgent: RegistryAgent | null;
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
  panelLabel: string;
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
  loadHistorySessions: (cursor?: string) => Promise<void>;
  handleSelectHistorySession: (s: AgentChatSessionItem) => void;
  chatMode: AgentChatMode;
  sessionWorkspaceId: string | null;
  sessionProjectId: string | null;
  wikiPath: string | null;

  // Close
  handleClose: () => void;

  // Title
  displaySessionTitle: string | null;
  isAutoGeneratingTitle: boolean;
  shouldScrambleAutoTitle: boolean;
  setShouldScrambleAutoTitle: React.Dispatch<React.SetStateAction<boolean>>;
  sessionTitleSource: string | null;
  sessionId: string | null;
  isEditingTitle: boolean;
  editingTitleValue: string;
  setEditingTitleValue: React.Dispatch<React.SetStateAction<string>>;
  handleStartEditTitle: () => void;
  handleFinishEditTitle: () => void;
  handleTitleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
}

export function AgentChatHeader({
  variant,
  handleDragStart,
  headerHovered,
  setHeaderHovered,
  isConnected,
  isConnecting,
  activeAgent,
  installedAgents,
  defaultRegistryId,
  newSessionAgentsOpen,
  setNewSessionAgentsOpen,
  handleCreateNewSession,
  handleOpenNewSessionAgentsMenu,
  handleScheduleCloseNewSessionAgentsMenu,
  handleSetDefaultAgent,
  panelLabel,
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
  loadHistorySessions,
  handleSelectHistorySession,
  chatMode,
  sessionWorkspaceId,
  sessionProjectId,
  wikiPath,
  handleClose,
  displaySessionTitle,
  isAutoGeneratingTitle,
  shouldScrambleAutoTitle,
  setShouldScrambleAutoTitle,
  sessionTitleSource,
  sessionId,
  isEditingTitle,
  editingTitleValue,
  setEditingTitleValue,
  handleStartEditTitle,
  handleFinishEditTitle,
  handleTitleKeyDown,
  titleInputRef,
}: AgentChatHeaderProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-border px-4 py-3",
        variant === "modal" && "cursor-grab active:cursor-grabbing"
      )}
      onMouseDown={variant === "modal" ? handleDragStart : undefined}
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
                <span className="text-sm font-medium shrink-0 truncate max-w-[200px]">{activeAgent.name}</span>
                <span className="inline-flex items-center rounded-sm border border-dashed border-current px-1.5 py-0.5 text-[10px] font-medium leading-none bg-foreground/85 text-background shrink-0">
                  {panelLabel}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-sm font-medium shrink-0">{panelTitle}</span>
                <span className="inline-flex items-center rounded-sm border border-dashed border-current px-1.5 py-0.5 text-[10px] font-medium leading-none bg-foreground/85 text-background">
                  {panelLabel}
                </span>
              </div>
            )}
          </div>

          {(localPath ?? sessionCwd) && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="ml-2 flex min-w-0 max-w-[180px] cursor-help items-center gap-1.5 overflow-hidden rounded-md border border-border/50 bg-muted/40 px-2 py-0.5">
                    <Folder className="size-3 shrink-0 text-muted-foreground/70" />
                    <span
                      className="truncate select-none text-[10px] leading-none text-muted-foreground/80"
                      style={{ direction: "rtl", textAlign: "left" }}
                    >
                      {localPath ?? sessionCwd}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs break-all">
                  {!localPath && sessionCwd && (
                    <p className="mb-0.5 text-[11px] text-muted-foreground">Temp directory</p>
                  )}
                  <p className="text-[11px]">{localPath ?? sessionCwd}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleExportConversation}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Export conversation"
                  disabled={exportableMessages.length === 0}
                >
                  <Download className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export conversation</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <AgentChatHistoryPopover
            historyOpen={historyOpen}
            setHistoryOpen={setHistoryOpen}
            historySessions={historySessions}
            historyHasMore={historyHasMore}
            historyLoading={historyLoading}
            historyCursor={historyCursor}
            loadHistorySessions={loadHistorySessions}
            handleSelectHistorySession={handleSelectHistorySession}
            isConnecting={isConnecting}
            chatMode={chatMode}
            sessionWorkspaceId={sessionWorkspaceId}
            sessionProjectId={sessionProjectId}
            localPath={localPath}
            wikiPath={wikiPath}
          />
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
        isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={editingTitleValue}
            onChange={(e) => setEditingTitleValue(e.target.value)}
            onBlur={handleFinishEditTitle}
            onKeyDown={handleTitleKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full rounded border border-border bg-transparent px-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="group/title flex w-fit items-center gap-1 max-w-full cursor-pointer rounded px-1 -mx-1 hover:bg-muted transition-colors"
                  onClick={displaySessionTitle ? handleStartEditTitle : undefined}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {isAutoGeneratingTitle ? (
                    <span className="truncate text-xs">
                      <TextShimmer as="span" duration={1.5}>
                        Generating title...
                      </TextShimmer>
                    </span>
                  ) : shouldScrambleAutoTitle && displaySessionTitle && sessionTitleSource === "auto" ? (
                    <TextScramble
                      key={`auto-title-${sessionId ?? "session"}-${displaySessionTitle}`}
                      as="span"
                      className="truncate text-xs text-muted-foreground"
                      duration={0.6}
                      speed={0.025}
                      onScrambleComplete={() => setShouldScrambleAutoTitle(false)}
                    >
                      {displaySessionTitle}
                    </TextScramble>
                  ) : (
                    <span className="truncate text-xs text-muted-foreground">{displaySessionTitle}</span>
                  )}
                  {displaySessionTitle ? (
                    <Pencil className="size-3 shrink-0 text-muted-foreground/0 group-hover/title:text-muted-foreground transition-colors" />
                  ) : null}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="z-100 max-w-[300px] break-words text-xs">
                {displaySessionTitle ?? "Generating title..."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      )}
    </div>
  );
}

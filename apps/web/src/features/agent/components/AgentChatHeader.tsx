"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TextShimmer,
  TextScramble,
  cn,
  type ConversationMessage,
} from "@workspace/ui";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "@workspace/ui/components/motion/popover-morph";
import { Download, Folder, LogOut, Maximize2, Minimize2, MoreHorizontal, MessagesSquare, PictureInPicture, PictureInPicture2, Plus, X } from "lucide-react";
import type { AgentCapabilities } from "@/api/rest-api";
import type { AgentChatSurfaceVariant } from "@/features/agent/hooks/use-agent-chat-session-types";
import type { AgentChatHistoryRow } from "@/features/agent/lib/agent-chat-thread";
import {
  agentChatCwdLabel,
  isAgentScratchCwd,
  isThreadWorkingDirectory,
  resolveWorkingDirectoryLabel,
  type AgentChatWorkingDirectory,
} from "@/features/agent/lib/agent-chat-working-directory";
import type { Project } from "@/shared/types/domain";
import { useDesktopWindowDrag } from "@/shared/hooks/use-desktop-window-drag";
import { AgentChatHistoryPopover } from "./AgentChatHistoryPopover";

interface AgentChatHeaderProps {
  variant: AgentChatSurfaceVariant;
  handleDragStart?: (e: React.MouseEvent) => void;
  handleOpenStandaloneWindow?: () => Promise<void>;
  handleReturnToEmbeddedWindow?: () => void;
  handleToggleFullscreen?: () => void;
  isFullscreen?: boolean;

  // Connection
  isConnecting: boolean;

  // Agent
  capabilities: AgentCapabilities | null;

  // Labels
  localPath: string | null;
  sessionCwd: string | null;

  // Export
  exportableMessages: ConversationMessage[];
  handleExportChat: () => void;

  // History
  historyOpen: boolean;
  setHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  historySessions: AgentChatHistoryRow[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursor: string | null;
  historyResumeUnsupportedReason: string | null;
  historyUnsupportedReason: string | null;
  trafficLightsContentInset?: boolean;
  loadHistorySessions: (cursor?: string) => Promise<void>;
  handleSelectHistorySession: (row: AgentChatHistoryRow) => void;
  historyTriggerClassName?: string;
  historySidebarControl?: React.ReactNode;

  // Close
  handleClose: () => void;
  handleLogoutAgent: () => Promise<void>;
  handleCreateNewSession: (targetRegistryId?: string) => void | Promise<void>;
  canCreateNewSession?: boolean;

  // Title
  displaySessionTitle: string | null;
  isAutoGeneratingTitle: boolean;
  shouldScrambleAutoTitle: boolean;
  setShouldScrambleAutoTitle: React.Dispatch<React.SetStateAction<boolean>>;
  sessionTitleSource: string | null;
  chatId: string | null;
  constrainWidth?: boolean;
  contextProjects?: Project[];
  contextSelection?: AgentChatWorkingDirectory | null;
}

const ICON_BUTTON =
  "desktop-no-drag rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

export function AgentChatHeader({
  variant,
  handleDragStart,
  handleOpenStandaloneWindow,
  handleReturnToEmbeddedWindow,
  handleToggleFullscreen,
  isFullscreen = false,
  isConnecting,
  capabilities,
  localPath,
  sessionCwd,
  exportableMessages,
  handleExportChat,
  historyOpen,
  setHistoryOpen,
  historySessions,
  historyHasMore,
  historyLoading,
  historyCursor,
  historyResumeUnsupportedReason,
  historyUnsupportedReason,
  trafficLightsContentInset = false,
  loadHistorySessions,
  handleSelectHistorySession,
  historyTriggerClassName,
  historySidebarControl,
  handleClose,
  handleLogoutAgent,
  handleCreateNewSession,
  canCreateNewSession = true,
  displaySessionTitle,
  isAutoGeneratingTitle,
  shouldScrambleAutoTitle,
  setShouldScrambleAutoTitle,
  sessionTitleSource,
  chatId,
  constrainWidth = false,
  contextProjects = [],
  contextSelection = null,
}: AgentChatHeaderProps) {
  const t = useTranslations("Agent.components");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const canLogout = Boolean(capabilities?.logout.supported);
  const shouldAnimateSessionTitle =
    shouldScrambleAutoTitle &&
    Boolean(displaySessionTitle) &&
    (sessionTitleSource === "auto" || sessionTitleSource === "agent");
  const animatedSessionTitle = shouldAnimateSessionTitle ? displaySessionTitle : null;
  const threadLabel = t("composer.workingDirectory.thread");
  const displayedCwd = agentChatCwdLabel(sessionCwd ?? localPath, threadLabel);
  const displayedCwdLabel = sessionCwd
    ? t("header.cwd.current")
    : t("header.cwd.context");
  const lockedSelection = variant === "modal" && chatId ? contextSelection : null;
  const lockedContextIsThread = lockedSelection
    ? isThreadWorkingDirectory(lockedSelection)
    : false;
  const lockedContextLabel = lockedSelection
    ? resolveWorkingDirectoryLabel(lockedSelection, contextProjects, threadLabel)
    : null;
  const showPathChip = !lockedSelection && Boolean(displayedCwd);
  const { handleDesktopWindowMouseDown, isDesktopDragEnabled } = useDesktopWindowDrag();
  const useNativeWindowDrag = variant === "standalone" && isDesktopDragEnabled;
  const sessionTitleText = isAutoGeneratingTitle
    ? t("header.generatingTitle")
    : displaySessionTitle || (chatId ? "" : t("header.newSession.defaultTitle"));
  const showOpenInWindow = variant !== "standalone" && Boolean(handleOpenStandaloneWindow);
  const showFullscreen = variant !== "standalone" && Boolean(handleToggleFullscreen);
  const showReturnToEmbedded = variant === "standalone" && Boolean(handleReturnToEmbeddedWindow);

  const closeMore = () => setMoreOpen(false);

  return (
    <div
      onMouseDown={
        useNativeWindowDrag
          ? handleDesktopWindowMouseDown
          : variant === "modal" && handleDragStart
            ? handleDragStart
            : undefined
      }
      data-tauri-drag-region={useNativeWindowDrag ? "true" : undefined}
      className={cn(
        // Match main Header: animate traffic-light inset on enter/leave fullscreen.
        "flex w-full shrink-0 items-start justify-between gap-3 py-3 pr-4 transition-[padding] duration-300 ease-out",
        trafficLightsContentInset ? "pl-[124px]" : "pl-4",
        constrainWidth && "mx-auto w-full max-w-3xl",
        useNativeWindowDrag && "desktop-drag-region select-none",
        variant === "modal" && handleDragStart && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex min-w-0 max-w-[50%] items-start gap-2">
        {historySidebarControl}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="min-w-0">
                  {isAutoGeneratingTitle ? (
                    <span className="block truncate text-sm font-medium">
                      <TextShimmer as="span" duration={1.5}>
                        {t("header.generatingTitle")}
                      </TextShimmer>
                    </span>
                  ) : animatedSessionTitle ? (
                    <TextScramble
                      key={`session-title-${sessionTitleSource ?? "unknown"}-${chatId ?? "chat"}-${
                        animatedSessionTitle
                      }`}
                      as="span"
                      className="block truncate text-sm font-medium"
                      duration={0.6}
                      speed={0.025}
                      onScrambleComplete={() => setShouldScrambleAutoTitle(false)}
                    >
                      {animatedSessionTitle}
                    </TextScramble>
                  ) : (
                    <span className="block truncate text-sm font-medium">{sessionTitleText}</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="z-100 max-w-[300px] break-words text-xs">
                {sessionTitleText}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {lockedContextLabel ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex w-fit max-w-full cursor-help items-center gap-1.5 overflow-hidden rounded-md border border-border/50 bg-muted/40 px-2 py-0.5">
                    {lockedContextIsThread ? (
                      <MessagesSquare className="size-3 shrink-0 text-muted-foreground/70" />
                    ) : (
                      <Folder className="size-3 shrink-0 text-muted-foreground/70" />
                    )}
                    <span className="truncate select-none text-[10px] leading-none text-muted-foreground/80">
                      {lockedContextLabel}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs break-all">
                  <p className="mb-0.5 text-[11px] text-muted-foreground">
                    {lockedContextIsThread
                      ? t("composer.workingDirectory.threadDescription")
                      : displayedCwdLabel}
                  </p>
                  {displayedCwd ? <p className="text-[11px]">{displayedCwd}</p> : null}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {showPathChip ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex w-fit max-w-full cursor-help items-center gap-1.5 overflow-hidden rounded-md border border-border/50 bg-muted/40 px-2 py-0.5">
                    <Folder className="size-3 shrink-0 text-muted-foreground/70" />
                    <span
                      className="truncate select-none text-[10px] leading-none text-muted-foreground/80"
                      style={
                        isAgentScratchCwd(sessionCwd ?? localPath)
                          ? undefined
                          : { direction: "rtl", textAlign: "left" }
                      }
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
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => void handleCreateNewSession()}
                disabled={!canCreateNewSession || isConnecting}
                className={ICON_BUTTON}
                aria-label={t("header.newSession.aria")}
              >
                <Plus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("header.newSession.defaultTitle")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {historyTriggerClassName === "hidden" ? null : (
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
        )}
        <MorphPopover open={moreOpen} onOpenChange={setMoreOpen}>
          <MorphPopoverTrigger>
            <button
              type="button"
              className={cn(ICON_BUTTON, moreOpen && "bg-muted text-foreground")}
              aria-label={t("header.moreActions.aria")}
              title={t("header.moreActions.tooltip")}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </MorphPopoverTrigger>
          <MorphPopoverContent
            side="bottom"
            align="end"
            sideOffset={8}
            radius={16}
            className="w-56 p-1.5"
          >
            {showOpenInWindow ? (
              <HeaderMenuItem
                icon={<PictureInPicture2 />}
                label={t("header.actions.openInWindow")}
                onSelect={() => {
                  closeMore();
                  void handleOpenStandaloneWindow?.();
                }}
              />
            ) : null}
            {showFullscreen ? (
              <HeaderMenuItem
                icon={isFullscreen ? <Minimize2 /> : <Maximize2 />}
                label={isFullscreen
                  ? t("header.fullscreen.exitTooltip")
                  : t("header.fullscreen.openTooltip")}
                onSelect={() => {
                  closeMore();
                  handleToggleFullscreen?.();
                }}
              />
            ) : null}
            {showReturnToEmbedded ? (
              <HeaderMenuItem
                icon={<PictureInPicture />}
                label={t("header.actions.returnToEmbedded")}
                onSelect={() => {
                  closeMore();
                  handleReturnToEmbeddedWindow?.();
                }}
              />
            ) : null}
            <HeaderMenuItem
              icon={<Download />}
              label={t("header.actions.exportChat")}
              disabled={exportableMessages.length === 0}
              onSelect={() => {
                closeMore();
                handleExportChat();
              }}
            />
            {canLogout ? (
              <HeaderMenuItem
                icon={<LogOut />}
                label={t("header.actions.logoutAgent")}
                disabled={isConnecting}
                destructive
                onSelect={() => {
                  closeMore();
                  setLogoutConfirmOpen(true);
                }}
              />
            ) : null}
          </MorphPopoverContent>
        </MorphPopover>
        <Dialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
          <DialogContent className="w-72 gap-3 p-4" showCloseButton={false}>
            <DialogTitle className="text-sm">{t("header.logout.title")}</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              {t("header.logout.description")}
            </DialogDescription>
            <DialogFooter className="mt-1 flex-row justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setLogoutConfirmOpen(false)}
              >
                {t("common.cancel")}
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
                {t("header.logout.action")}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {variant === "modal" && (
          <button
            type="button"
            onClick={handleClose}
            className={ICON_BUTTON}
            aria-label={t("header.closeChatAria")}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function HeaderMenuItem({
  icon,
  label,
  disabled,
  destructive = false,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
        destructive
          ? "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10"
          : "text-foreground hover:bg-muted focus-visible:bg-muted",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center [&_svg]:size-4",
          destructive ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

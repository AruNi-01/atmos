"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TextShimmer,
  TextScramble,
  cn,
  type ConversationMessage,
} from "@workspace/ui";
import { Download, Folder, LogOut, Maximize2, Minimize2, MoreHorizontal, PictureInPicture, PictureInPicture2, X } from "lucide-react";
import type { AgentCapabilities } from "@/api/rest-api";
import type { AgentChatSurfaceVariant } from "@/features/agent/hooks/use-agent-chat-session-types";
import type { AgentChatHistoryRow } from "@/features/agent/lib/agent-chat-thread";
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

  // Title
  displaySessionTitle: string | null;
  isAutoGeneratingTitle: boolean;
  shouldScrambleAutoTitle: boolean;
  setShouldScrambleAutoTitle: React.Dispatch<React.SetStateAction<boolean>>;
  sessionTitleSource: string | null;
  chatId: string | null;
  constrainWidth?: boolean;
}

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
  displaySessionTitle,
  isAutoGeneratingTitle,
  shouldScrambleAutoTitle,
  setShouldScrambleAutoTitle,
  sessionTitleSource,
  chatId,
  constrainWidth = false,
}: AgentChatHeaderProps) {
  const t = useTranslations("Agent.components");
  const [logoutConfirmOpen, setLogoutConfirmOpen] = React.useState(false);
  const canLogout = Boolean(capabilities?.logout.supported);
  const shouldAnimateSessionTitle =
    shouldScrambleAutoTitle &&
    Boolean(displaySessionTitle) &&
    (sessionTitleSource === "auto" || sessionTitleSource === "agent");
  const animatedSessionTitle = shouldAnimateSessionTitle ? displaySessionTitle : null;
  const displayedCwd = sessionCwd ?? localPath;
  const displayedCwdLabel = sessionCwd
    ? t("header.cwd.current")
    : t("header.cwd.context");
  const { handleDesktopWindowMouseDown, isDesktopDragEnabled } = useDesktopWindowDrag();
  const useNativeWindowDrag = variant === "standalone" && isDesktopDragEnabled;
  const showSessionTitle = Boolean(displaySessionTitle || isAutoGeneratingTitle);

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
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {historySidebarControl}
        <div className="flex min-w-0 flex-col gap-1">
          {showSessionTitle ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex w-fit max-w-full items-center gap-1 rounded px-1 -mx-1">
                    {isAutoGeneratingTitle ? (
                      <span className="truncate text-sm font-medium">
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
                        className="truncate text-sm font-medium"
                        duration={0.6}
                        speed={0.025}
                        onScrambleComplete={() => setShouldScrambleAutoTitle(false)}
                      >
                        {animatedSessionTitle}
                      </TextScramble>
                    ) : (
                      <span className="truncate text-sm font-medium">{displaySessionTitle}</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="z-100 max-w-[300px] break-words text-xs">
                  {displaySessionTitle ?? t("header.generatingTitle")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}

          {displayedCwd ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex min-w-0 max-w-full cursor-help items-center gap-1.5 overflow-hidden rounded-md border border-border/50 bg-muted/40 px-2 py-0.5">
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
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
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
        {variant !== "standalone" && handleOpenStandaloneWindow ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void handleOpenStandaloneWindow()}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("header.actions.openInWindow")}
                >
                  <PictureInPicture2 className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("header.actions.openInWindow")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {variant !== "standalone" && handleToggleFullscreen ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={isFullscreen
                    ? t("header.fullscreen.exitAria")
                    : t("header.fullscreen.openAria")}
                >
                  {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isFullscreen ? t("header.fullscreen.exitTooltip") : t("header.fullscreen.openTooltip")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {variant === "standalone" && handleReturnToEmbeddedWindow ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleReturnToEmbeddedWindow}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("header.actions.returnToEmbedded")}
                >
                  <PictureInPicture className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("header.actions.returnToEmbedded")}
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
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={t("header.moreActions.aria")}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("header.moreActions.tooltip")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              className="cursor-pointer"
              disabled={exportableMessages.length === 0}
              onSelect={handleExportChat}
            >
              <Download className="size-4" />
              <span>{t("header.actions.exportChat")}</span>
            </DropdownMenuItem>
            {canLogout ? (
              <DropdownMenuItem
                className="cursor-pointer"
                disabled={isConnecting}
                variant="destructive"
                onSelect={() => setLogoutConfirmOpen(true)}
              >
                <LogOut className="size-4" />
                <span>{t("header.actions.logoutAgent")}</span>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
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
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("header.closeChatAria")}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

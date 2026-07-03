"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Minus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTab,
  cn,
} from "@workspace/ui";

import {
  useSideChatModalLayout,
  type SideChatResizeEdge,
} from "@/features/terminal/hooks/use-side-chat-modal-layout";
import {
  sideChatTabLabel,
  type LocalSideChatRecord,
} from "@/features/terminal/lib/terminal-side-chat";
import {
  isTerminalAgentInputShortcut,
  resolveTerminalAgentSubmitMode,
} from "@/features/terminal/lib/terminal-runtime-utils";
import { Terminal, type TerminalRef } from "./Terminal";
import {
  TerminalAgentInputOverlay,
  type TerminalAgentInputOverlayHandle,
} from "./TerminalAgentInputOverlay";

export interface TerminalSideChatModalProps {
  activeSideChatId: string;
  localPath?: string | null;
  onClose: (sideChatId: string) => void;
  onCloseAll: (sideChatIds: string[]) => void;
  onHide: () => void;
  onInteraction?: (event: Event | React.SyntheticEvent) => void;
  onReady: (record: LocalSideChatRecord) => void;
  onSelectSideChat: (sideChatId: string) => void;
  projectName?: string | null;
  projectRootPath?: string | null;
  records: LocalSideChatRecord[];
  sideChatFlyTargetRef: React.RefObject<HTMLDivElement | null>;
  sourcePaneId: string;
  sourceTmuxWindowName: string;
  terminalRefs: React.MutableRefObject<Map<string, TerminalRef>>;
  terminalScale?: number;
  workspaceId: string;
  workspaceName?: string | null;
}

export function TerminalSideChatModal({
  activeSideChatId,
  localPath,
  projectName,
  projectRootPath,
  records,
  sideChatFlyTargetRef,
  sourcePaneId,
  sourceTmuxWindowName,
  terminalRefs,
  terminalScale,
  workspaceId,
  workspaceName,
  onClose,
  onCloseAll,
  onHide,
  onInteraction,
  onReady,
  onSelectSideChat,
}: TerminalSideChatModalProps) {
  const t = useTranslations("terminal.sideChat");
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const agentInputOverlayRefs = React.useRef<Map<string, TerminalAgentInputOverlayHandle>>(new Map());
  const [closeAllConfirmOpen, setCloseAllConfirmOpen] = React.useState(false);
  const [readySideChatIds, setReadySideChatIds] = React.useState<Set<string>>(() => new Set());
  const {
    handleDragStart,
    handleResizeStart,
    markInteraction,
    modalStyle,
    suppressNextHeaderClickRef,
  } = useSideChatModalLayout({
    overlayRef,
    onInteraction,
  });

  const stopModalInteraction = React.useCallback(
    (event: React.SyntheticEvent) => {
      markInteraction(event);
      event.stopPropagation();
    },
    [markInteraction],
  );

  const handleModalKeyDownCapture = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      markInteraction(event);
      if (!isTerminalAgentInputShortcut(event)) return;

      event.preventDefault();
      event.stopPropagation();
      agentInputOverlayRefs.current.get(activeSideChatId)?.toggle();
    },
    [activeSideChatId, markInteraction],
  );

  const handleModalKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      markInteraction(event);
      event.stopPropagation();
    },
    [markInteraction],
  );

  return (
    <div
      data-side-chat-modal="true"
      ref={overlayRef}
      className="pointer-events-none absolute inset-2 z-[95]"
    >
      <div
        className="pointer-events-auto absolute flex min-w-0 flex-col overflow-hidden rounded-md border border-border/70 bg-background shadow-[0_22px_60px_rgba(0,0,0,0.38)]"
        onContextMenu={(event) => {
          markInteraction(event);
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseDown={stopModalInteraction}
        onPointerDown={stopModalInteraction}
        onWheel={stopModalInteraction}
        onKeyDownCapture={handleModalKeyDownCapture}
        onKeyDown={handleModalKeyDown}
        style={modalStyle}
      >
        <SideChatResizeHandles onResizeStart={handleResizeStart} />
        <Tabs
          value={activeSideChatId}
          onValueChange={(value) => onSelectSideChat(value)}
          className="min-h-0 flex-1"
        >
          <div
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-between gap-3 bg-background px-3 pt-1 active:cursor-grabbing"
            onPointerDown={handleDragStart}
            onClickCapture={(event) => {
              if (!suppressNextHeaderClickRef.current) return;
              suppressNextHeaderClickRef.current = false;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div className="min-w-0 flex-1 overflow-hidden">
              <TabsList className="max-w-full justify-start overflow-x-auto bg-muted/70">
                {records.map((record, index) => (
                  <TabsTab
                    key={record.side_chat_id}
                    value={record.side_chat_id}
                    nativeButton={false}
                    render={<div />}
                    className="group/side-tab relative h-7 min-w-0 max-w-40 gap-1.5 px-2 pr-2 text-xs data-active:pr-7"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: record.color_hex }}
                    />
                    <span className="min-w-0 truncate">
                      {sideChatTabLabel(record, index, t("title"))}
                    </span>
                    <button
                      type="button"
                      data-side-chat-control="true"
                      aria-label={t("closeTab")}
                      className={cn(
                        "absolute right-1 top-1/2 z-10 size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground",
                        activeSideChatId === record.side_chat_id
                          ? "flex opacity-0 group-hover/side-tab:opacity-100 focus-visible:opacity-100"
                          : "hidden",
                      )}
                      onPointerDown={(event) => {
                        markInteraction(event);
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onClose(record.side_chat_id);
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </TabsTab>
                ))}
              </TabsList>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-side-chat-control="true"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t("hide")}
                title={t("hide")}
                onClick={() => onHide()}
              >
                <Minus className="size-3.5" />
              </button>
              <Popover open={closeAllConfirmOpen} onOpenChange={setCloseAllConfirmOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    data-side-chat-control="true"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/12 hover:text-destructive"
                    aria-label={t("closeAll")}
                    title={t("closeAll")}
                    onClick={() => setCloseAllConfirmOpen(true)}
                  >
                    <X className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-3" data-side-chat-control="true">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 size-4.5 text-amber-500" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{t("closeAllTitle")}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">{t("closeAllDescription")}</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded-md border border-border/70 px-3 text-xs font-medium text-foreground hover:bg-accent"
                      onClick={() => setCloseAllConfirmOpen(false)}
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 items-center rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        setCloseAllConfirmOpen(false);
                        onCloseAll(records.map((record) => record.side_chat_id));
                      }}
                    >
                      {t("closeAllConfirm")}
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div ref={sideChatFlyTargetRef} className="min-h-0 flex-1 bg-background">
            {records.map((record) => (
              <TabsContent
                key={record.side_chat_id}
                keepMounted
                value={record.side_chat_id}
                className="relative m-0 h-full min-h-0 overflow-hidden"
              >
                <Terminal
                  ref={(terminalRef) => {
                    if (terminalRef) {
                      terminalRefs.current.set(record.side_chat_id, terminalRef);
                    } else {
                      terminalRefs.current.delete(record.side_chat_id);
                    }
                  }}
                  sessionId={record.sessionId}
                  workspaceId={workspaceId}
                  terminalName={record.isNew ? record.side_tmux_window_name : undefined}
                  tmuxWindowName={record.isNew ? undefined : record.side_tmux_window_name}
                  projectName={projectName ?? undefined}
                  workspaceName={workspaceName ?? undefined}
                  isNewPane={record.isNew}
                  cwd={localPath ?? undefined}
                  projectRootPath={projectRootPath ?? localPath ?? undefined}
                  terminalKind="side_chat"
                  sideChatId={record.side_chat_id}
                  sourcePaneId={sourcePaneId}
                  sourceTmuxWindowName={sourceTmuxWindowName}
                  terminalScale={terminalScale}
                  onSessionReady={() => {
                    setReadySideChatIds((current) => new Set(current).add(record.side_chat_id));
                    onReady(record);
                  }}
                  onSessionClose={() => {
                    setReadySideChatIds((current) => {
                      const next = new Set(current);
                      next.delete(record.side_chat_id);
                      return next;
                    });
                  }}
                  onSessionError={() => {
                    setReadySideChatIds((current) => {
                      const next = new Set(current);
                      next.delete(record.side_chat_id);
                      return next;
                    });
                  }}
                />
                <TerminalAgentInputOverlay
                  ref={(inputOverlayRef) => {
                    if (inputOverlayRef) {
                      agentInputOverlayRefs.current.set(record.side_chat_id, inputOverlayRef);
                    } else {
                      agentInputOverlayRefs.current.delete(record.side_chat_id);
                    }
                  }}
                  getTerminalCursorClientPoint={() =>
                    terminalRefs.current.get(record.side_chat_id)?.getCursorClientPoint() ?? null
                  }
                  isTerminalReady={readySideChatIds.has(record.side_chat_id)}
                  localPath={localPath}
                  onInteraction={onInteraction}
                  onSendEnter={() => {
                    terminalRefs.current.get(record.side_chat_id)?.sendEnter();
                  }}
                  onSendText={(text) => {
                    const terminalRef = terminalRefs.current.get(record.side_chat_id);
                    terminalRef?.focus();
                    terminalRef?.sendText(text);
                  }}
                  submitMode={resolveTerminalAgentSubmitMode(record.agent)}
                />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function SideChatResizeHandles({
  onResizeStart,
}: {
  onResizeStart: (edge: SideChatResizeEdge) => (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute left-3 right-3 top-0 z-50 h-2 cursor-n-resize touch-none"
        onPointerDown={onResizeStart("n")}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-3 right-3 z-50 h-2 cursor-s-resize touch-none"
        onPointerDown={onResizeStart("s")}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-3 left-0 top-3 z-50 w-2 cursor-w-resize touch-none"
        onPointerDown={onResizeStart("w")}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-3 right-0 top-3 z-50 w-2 cursor-e-resize touch-none"
        onPointerDown={onResizeStart("e")}
      />
      <div
        aria-hidden="true"
        className="absolute left-0 top-0 z-[60] size-4 cursor-nw-resize touch-none"
        onPointerDown={onResizeStart("nw")}
      />
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 z-[60] size-4 cursor-ne-resize touch-none"
        onPointerDown={onResizeStart("ne")}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 z-[60] size-4 cursor-sw-resize touch-none"
        onPointerDown={onResizeStart("sw")}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 right-0 z-[60] size-4 cursor-se-resize touch-none"
        onPointerDown={onResizeStart("se")}
      />
    </>
  );
}

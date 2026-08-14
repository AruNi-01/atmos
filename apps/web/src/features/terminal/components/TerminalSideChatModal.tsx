"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Minus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@workspace/ui";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/motion/tabs";

import {
  useSideChatModalLayout,
  type SideChatResizeEdge,
} from "@/features/terminal/hooks/use-side-chat-modal-layout";
import {
  sideChatTabLabel,
  type LocalSideChatRecord,
} from "@/features/terminal/lib/terminal-side-chat";
import { useTerminalRichInputSettingsStore } from "@/features/settings/store/terminal-rich-input-settings-store";
import {
  isTerminalAgentInputPinShortcut,
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
  focusNonce?: number;
  localPath?: string | null;
  onClose: (sideChatId: string) => void;
  onCloseAll: (sideChatIds: string[]) => void;
  onHide: () => void;
  onInteraction?: (event: Event | React.SyntheticEvent) => void;
  onReady: (record: LocalSideChatRecord) => void;
  onSelectSideChat: (sideChatId: string) => void;
  projectId?: string | null;
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
  focusNonce = 0,
  localPath,
  projectId,
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
  const richInputActive = useTerminalRichInputSettingsStore(
    (s) => s.loaded && s.enabled,
  );
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const agentInputOverlayRefs = React.useRef<Map<string, TerminalAgentInputOverlayHandle>>(new Map());
  const [closeAllConfirmOpen, setCloseAllConfirmOpen] = React.useState(false);
  const skillsContext = React.useMemo(() => {
    if (!localPath) return null;
    const isProjectRoot =
      !!projectRootPath &&
      (localPath === projectRootPath || localPath.replace(/\/$/, "") === projectRootPath.replace(/\/$/, ""));
    if (isProjectRoot) {
      if (!projectId) return null;
      return {
        mode: "project" as const,
        id: projectId,
        name: projectName || projectId,
        path: projectRootPath || localPath,
      };
    }
    return {
      mode: "workspace" as const,
      id: workspaceId,
      name: workspaceName || projectName || workspaceId,
      path: localPath,
    };
  }, [localPath, projectId, projectName, projectRootPath, workspaceId, workspaceName]);
  const [readySideChatIds, setReadySideChatIds] = React.useState<Set<string>>(() => new Set());
  const [isFocusedWithin, setIsFocusedWithin] = React.useState(true);
  const modalRef = React.useRef<HTMLDivElement | null>(null);
  const holdFocusUntilRef = React.useRef(0);

  const claimSideChatFocus = React.useCallback((sideChatId: string) => {
    holdFocusUntilRef.current = Date.now() + 500;
    setIsFocusedWithin(true);
    modalRef.current?.focus({ preventScroll: true });
    terminalRefs.current.get(sideChatId)?.focus();
  }, [terminalRefs]);
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
      const rich = useTerminalRichInputSettingsStore.getState();
      if (!rich.loaded || !rich.enabled) return;
      if (isTerminalAgentInputPinShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        agentInputOverlayRefs.current.get(activeSideChatId)?.togglePin();
        return;
      }
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

  React.useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const handleFocusIn = () => setIsFocusedWithin(true);
    const handleFocusOut = (event: FocusEvent) => {
      if (Date.now() < holdFocusUntilRef.current) {
        setIsFocusedWithin(true);
        return;
      }
      if (event.relatedTarget instanceof Node && modal.contains(event.relatedTarget)) return;
      setIsFocusedWithin(false);
    };
    // Capture: header drag/resize call stopPropagation, so a bubble listener
    // never sees those clicks and the modal would stay dimmed.
    const handlePointerDownCapture = () => setIsFocusedWithin(true);
    modal.addEventListener("focusin", handleFocusIn);
    modal.addEventListener("focusout", handleFocusOut);
    modal.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => {
      modal.removeEventListener("focusin", handleFocusIn);
      modal.removeEventListener("focusout", handleFocusOut);
      modal.removeEventListener("pointerdown", handlePointerDownCapture, true);
    };
  }, []);

  const handleHeaderPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      claimSideChatFocus(activeSideChatId);
      handleDragStart(event);
    },
    [activeSideChatId, claimSideChatFocus, handleDragStart],
  );

  const handleResizePointerDown = React.useCallback(
    (edge: SideChatResizeEdge) => (event: React.PointerEvent<HTMLDivElement>) => {
      claimSideChatFocus(activeSideChatId);
      handleResizeStart(edge)(event);
    },
    [activeSideChatId, claimSideChatFocus, handleResizeStart],
  );

  React.useEffect(() => {
    claimSideChatFocus(activeSideChatId);
  }, [activeSideChatId, claimSideChatFocus, focusNonce]);

  React.useEffect(() => {
    if (!readySideChatIds.has(activeSideChatId)) return;
    const frame = window.requestAnimationFrame(() => {
      claimSideChatFocus(activeSideChatId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSideChatId, claimSideChatFocus, focusNonce, readySideChatIds]);

  return (
    <div
      data-side-chat-modal="true"
      ref={overlayRef}
      className="pointer-events-none absolute inset-2 z-[95]"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          "pointer-events-auto absolute flex min-w-0 flex-col overflow-hidden rounded-md border border-border/70 bg-background shadow-[0_22px_60px_rgba(0,0,0,0.38)] outline-none transition-opacity duration-200",
          isFocusedWithin ? "opacity-100" : "opacity-75",
        )}
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
        <SideChatResizeHandles onResizeStart={handleResizePointerDown} />
        <Tabs
          value={activeSideChatId}
          onValueChange={(value) => onSelectSideChat(value)}
          variant="pill"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-between gap-3 bg-background px-3 pt-1 active:cursor-grabbing"
            onPointerDown={handleHeaderPointerDown}
            onClickCapture={(event) => {
              if (!suppressNextHeaderClickRef.current) return;
              suppressNextHeaderClickRef.current = false;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div
              className="min-w-0 flex-1 overflow-x-auto"
              onPointerDown={(event) => {
                claimSideChatFocus(activeSideChatId);
                event.stopPropagation();
              }}
            >
              <TabsList className="h-8 max-w-full gap-0.5 p-0.5">
                {records.map((record, index) => {
                  const isActive = activeSideChatId === record.side_chat_id;
                  return (
                    <div key={record.side_chat_id} className="group/side-tab relative">
                      <TabsTrigger
                        value={record.side_chat_id}
                        className={cn(
                          "h-7 max-w-40 gap-1.5 px-2.5 text-xs",
                          isActive && "pr-7",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: record.color_hex }}
                        />
                        <span className="min-w-0 truncate">
                          {sideChatTabLabel(record, index, t("title"))}
                        </span>
                      </TabsTrigger>
                      {isActive ? (
                        <button
                          type="button"
                          data-side-chat-control="true"
                          aria-label={t("closeTab")}
                          className="absolute right-1 top-1/2 z-20 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-primary-foreground/70 opacity-0 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground group-hover/side-tab:opacity-100 focus-visible:opacity-100"
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
                      ) : null}
                    </div>
                  );
                })}
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
          <div ref={sideChatFlyTargetRef} className="relative min-h-0 flex-1 bg-background">
            {records.map((record) => (
              <div
                key={record.side_chat_id}
                className={cn(
                  "absolute inset-0 min-h-0 overflow-hidden",
                  record.side_chat_id === activeSideChatId ? "block" : "hidden",
                )}
                aria-hidden={record.side_chat_id !== activeSideChatId}
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
                  surfaceActive={record.side_chat_id === activeSideChatId}
                  onAddSelectionAsContext={
                    richInputActive
                      ? (snapshot) => {
                          agentInputOverlayRefs.current
                            .get(record.side_chat_id)
                            ?.addTerminalSelectionContext(snapshot);
                        }
                      : undefined
                  }
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
                  agent={record.agent}
                  isTerminalReady={readySideChatIds.has(record.side_chat_id)}
                  localPath={localPath}
                  skillsContext={skillsContext}
                  surfaceActive={record.side_chat_id === activeSideChatId}
                  onHide={() => {
                    terminalRefs.current.get(record.side_chat_id)?.focus();
                  }}
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
              </div>
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

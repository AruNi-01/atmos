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

import { AgentIcon } from "@/features/agent/components/AgentIcon";
import {
  useAgentAttentionStore,
  type PaneFocusAck,
} from "@/features/agent/store/agent-attention-store";
import { useTerminalRichInputSettingsStore } from "@/features/settings/store/terminal-rich-input-settings-store";
import {
  useSideChatModalLayout,
  type SideChatResizeEdge,
} from "@/features/terminal/hooks/use-side-chat-modal-layout";
import {
  sideChatStablePaneId,
  sideChatTabLabel,
  type LocalSideChatRecord,
} from "@/features/terminal/lib/terminal-side-chat";
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

  const recordsRef = React.useRef(records);
  recordsRef.current = records;
  const activeSideChatIdRef = React.useRef(activeSideChatId);
  activeSideChatIdRef.current = activeSideChatId;
  const claimSideChatFocus = React.useCallback((
    sideChatId: string,
    ack: PaneFocusAck = "deferred",
  ) => {
    holdFocusUntilRef.current = Date.now() + 500;
    setIsFocusedWithin(true);
    modalRef.current?.focus({ preventScroll: true });
    terminalRefs.current.get(sideChatId)?.focus();
    const record = recordsRef.current.find((item) => item.side_chat_id === sideChatId);
    const paneId = record ? sideChatStablePaneId(record) : null;
    if (paneId) useAgentAttentionStore.getState().notifyPaneFocused(paneId, { ack });
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
    const handlePointerDownCapture = () => {
      setIsFocusedWithin(true);
      const sideChatId = activeSideChatIdRef.current;
      const record = recordsRef.current.find((item) => item.side_chat_id === sideChatId);
      const paneId = record ? sideChatStablePaneId(record) : null;
      if (paneId) {
        useAgentAttentionStore.getState().notifyPaneFocused(paneId, {
          ack: "immediate",
        });
      }
    };
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
      if (isSideChatControlTarget(event.target)) {
        markInteraction(event);
        return;
      }
      handleDragStart(event);
    },
    [handleDragStart, markInteraction],
  );

  const handleHeaderClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isSideChatControlTarget(event.target)) return;
      claimSideChatFocus(activeSideChatId, "immediate");
    },
    [activeSideChatId, claimSideChatFocus],
  );

  const stopControlPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      markInteraction(event);
      event.stopPropagation();
    },
    [markInteraction],
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
        <SideChatResizeHandles onResizeStart={handleResizeStart} />
        <Tabs
          value={activeSideChatId}
          onValueChange={(value) => onSelectSideChat(value)}
          variant="pill"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            className="relative z-[70] flex h-11 shrink-0 cursor-grab touch-none items-center justify-between gap-3 bg-background px-3 pt-1 active:cursor-grabbing"
            onPointerDown={handleHeaderPointerDown}
            onClick={handleHeaderClick}
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
                if (
                  event.target instanceof Element &&
                  event.target.closest("button, [role='tab']")
                ) {
                  event.stopPropagation();
                }
              }}
            >
              <TabsList className="h-8 max-w-full gap-0.5 p-0.5">
                {records.map((record, index) => (
                  <TabsTrigger
                    key={record.side_chat_id}
                    value={record.side_chat_id}
                    className="group h-7 max-w-40 gap-1.5 px-2.5 text-xs"
                  >
                    <SideChatTabLeadingIcon
                      record={record}
                      closeLabel={t("closeTab")}
                      onClose={() => onClose(record.side_chat_id)}
                      onPointerDown={stopControlPointerDown}
                    />
                    <span className="min-w-0 truncate">
                      {sideChatTabLabel(record, index, t("title"))}
                    </span>
                  </TabsTrigger>
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
                onPointerDown={stopControlPointerDown}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onHide();
                }}
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
                    onPointerDown={stopControlPointerDown}
                  >
                    <X className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="z-[200] w-72 space-y-3"
                  data-side-chat-control="true"
                  onFocusOutside={(event) => {
                    const target = event.target;
                    if (target instanceof Node && modalRef.current?.contains(target)) {
                      event.preventDefault();
                    }
                  }}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                >
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
                  stablePaneId={sideChatStablePaneId(record)}
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

function isSideChatControlTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-side-chat-control='true']"));
}

function SideChatTabLeadingIcon({
  record,
  closeLabel,
  onClose,
  onPointerDown,
}: {
  record: LocalSideChatRecord;
  closeLabel: string;
  onClose: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}) {
  const agent = record.agent;
  return (
    <span className="relative flex size-3.5 shrink-0 items-center justify-center">
      <span className="flex items-center justify-center group-hover:invisible">
        <AgentIcon
          registryId={agent?.id ?? ""}
          name={agent?.label ?? "Agent"}
          size={14}
          isCustom={agent?.iconType === "custom"}
          color={record.color_hex}
        />
      </span>
      <span
        role="button"
        data-side-chat-control="true"
        aria-label={closeLabel}
        onPointerDown={onPointerDown}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full opacity-0 pointer-events-none hover:bg-current/15 group-hover:pointer-events-auto group-hover:opacity-100"
      >
        <X className="size-3" />
      </span>
    </span>
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

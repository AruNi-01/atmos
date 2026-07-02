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
  toastManager,
} from "@workspace/ui";

import {
  terminalSideChatApi,
  type TerminalSideChatRecord,
  type TerminalSideChatStatus,
  type TerminalSideContextCaptureResponse,
} from "@/api/ws-api";
import { buildInteractiveAgentCommand } from "@/features/agent/lib/terminal-agent-run-config";
import { useTerminalSideChatSettingsStore } from "@/features/settings/store/terminal-side-chat-settings-store";
import { Terminal, type TerminalRef } from "@/features/terminal/components/Terminal";
import { TerminalAgentInputOverlay } from "@/features/terminal/components/TerminalAgentInputOverlay";
import { resolveTerminalAgentSubmitMode } from "@/features/terminal/lib/terminal-runtime-utils";
import type { TerminalPaneAgent } from "@/features/terminal/types";

type SourceSurfaceKind = "terminal_pane" | "canvas_terminal";

type LocalSideChatRecord = TerminalSideChatRecord & {
  agent?: TerminalPaneAgent;
  hasSentInitialCommand?: boolean;
  initialCommand?: string;
  isNew: boolean;
  sessionId: string;
};

type LegacySideChatStatus = TerminalSideChatStatus | "visible" | "closed" | string;

export interface UseTerminalSideChatsOptions {
  workspaceId: string;
  projectName?: string | null;
  workspaceName?: string | null;
  localPath?: string | null;
  projectRootPath?: string | null;
  sourcePaneId: string;
  sourceSurfaceKind: SourceSurfaceKind;
  sourceSurfaceRef?: unknown;
  sourceTmuxWindowName?: string | null;
  terminalScale?: number;
}

const BRIGHT_SIDE_CHAT_COLORS = [
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
  "#3b82f6",
  "#f97316",
];

type SideChatModalLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SideChatResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type SideChatModalBounds = {
  width: number;
  height: number;
};

const SIDE_CHAT_MODAL_DEFAULT_WIDTH = 900;
const SIDE_CHAT_MODAL_DEFAULT_HEIGHT = 560;
const SIDE_CHAT_MODAL_MIN_WIDTH = 360;
const SIDE_CHAT_MODAL_MIN_HEIGHT = 260;

export function useTerminalSideChats({
  workspaceId,
  projectName,
  workspaceName,
  localPath,
  projectRootPath,
  sourcePaneId,
  sourceSurfaceKind,
  sourceSurfaceRef,
  sourceTmuxWindowName,
  terminalScale,
}: UseTerminalSideChatsOptions) {
  const t = useTranslations("terminal.sideChat");
  const terminalRefs = React.useRef<Map<string, TerminalRef>>(new Map());
  const openedSideChatParamRef = React.useRef<string | null>(null);
  const [records, setRecords] = React.useState<LocalSideChatRecord[]>([]);
  const [activeSideChatId, setActiveSideChatId] = React.useState<string | null>(null);
  const [isStarting, setIsStarting] = React.useState(false);
  const {
    sideContextPromptBudgetBytes,
    loadSettings: loadTerminalSideChatSettings,
  } = useTerminalSideChatSettingsStore();

  React.useEffect(() => {
    void loadTerminalSideChatSettings();
  }, [loadTerminalSideChatSettings]);

  const sourceSurfaceRefJson = React.useMemo(() => {
    if (sourceSurfaceRef == null) return null;
    try {
      return JSON.stringify(sourceSurfaceRef);
    } catch {
      return null;
    }
  }, [sourceSurfaceRef]);

  React.useEffect(() => {
    if (!workspaceId || !sourceTmuxWindowName) return;
    let cancelled = false;
    void terminalSideChatApi
      .list(workspaceId)
      .then((response) => {
        if (cancelled) return;
        const sourceRecords = response.records
          .filter(
            (record) =>
              record.source_tmux_window_name === sourceTmuxWindowName &&
              record.source_surface_kind === sourceSurfaceKind &&
              !isSideChatClosing(record.status),
          )
          .map<LocalSideChatRecord>((record) => ({
            ...record,
            status: normalizeSideChatStatus(record.status),
            agent: parseAgentRef(record.agent_ref_json),
            isNew: false,
            sessionId: crypto.randomUUID(),
          }));
        setRecords((current) => mergeSideChatRecords(current, sourceRecords));
      })
      .catch((error) => {
        console.error("Failed to load terminal side chats:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceSurfaceKind, sourceTmuxWindowName, workspaceId]);

  const persistRecord = React.useCallback(async (record: LocalSideChatRecord) => {
    return terminalSideChatApi.upsert(toSideChatDto(record));
  }, []);

  const updateLocalRecord = React.useCallback((sideChatId: string, patch: Partial<LocalSideChatRecord>) => {
    setRecords((current) =>
      current.map((record) =>
        record.side_chat_id === sideChatId ? { ...record, ...patch } : record,
      ),
    );
  }, []);

  const startSideChat = React.useCallback(
    async (userPrompt: string, agent: TerminalPaneAgent) => {
      if (!sourceTmuxWindowName) {
        toastManager.add({
          title: t("errorTitle"),
          description: t("sourceNotReady"),
          type: "error",
        });
        return;
      }
      setIsStarting(true);
      try {
        const capture = await terminalSideChatApi.captureContext({
          workspace_id: workspaceId,
          project_name: projectName,
          workspace_name: workspaceName,
          source_tmux_window_name: sourceTmuxWindowName,
          max_prompt_bytes: sideContextPromptBudgetBytes,
        });
        const sideChatId = `side-${crypto.randomUUID()}`;
        const sideTmuxWindowName = `side-${sideChatId.slice(5, 13)}`;
        const colorHex = pickUniqueBrightColor(records.map((record) => record.color_hex));
        const sidePrompt = buildSideChatPrompt({
          capture,
          sourceTmuxWindowName,
          userPrompt,
        });
        const initialCommand = `${buildInteractiveAgentCommand({
          agentId: agent.id,
          launchCommand: agent.pipeCommand ?? agent.command,
          prompt: sidePrompt,
        })}\r`;
        const record: LocalSideChatRecord = {
          side_chat_id: sideChatId,
          workspace_id: workspaceId,
          project_name: projectName ?? null,
          workspace_name: workspaceName ?? null,
          source_pane_id: sourcePaneId,
          source_tmux_window_name: sourceTmuxWindowName,
          source_surface_kind: sourceSurfaceKind,
          source_surface_ref_json: sourceSurfaceRefJson,
          side_tmux_window_name: sideTmuxWindowName,
          agent_ref_json: JSON.stringify({
            id: agent.id,
            label: agent.label,
            command: agent.command,
            iconType: agent.iconType,
            pipeCommand: agent.pipeCommand,
          }),
          color_hex: colorHex,
          status: "open",
          agent,
          hasSentInitialCommand: false,
          initialCommand,
          isNew: true,
          sessionId: crypto.randomUUID(),
        };
        setActiveSideChatId(sideChatId);
        setRecords((current) => [...current, record]);
      } catch (error) {
        console.error("Failed to start terminal side chat:", error);
        toastManager.add({
          title: t("errorTitle"),
          description: t("startFailed"),
          type: "error",
        });
      } finally {
        setIsStarting(false);
      }
    },
    [
      projectName,
      records,
      sideContextPromptBudgetBytes,
      sourcePaneId,
      sourceSurfaceKind,
      sourceSurfaceRefJson,
      sourceTmuxWindowName,
      t,
      workspaceId,
      workspaceName,
    ],
  );

  const hideSideChat = React.useCallback(
    async () => {
      const openRecords = records.filter((record) => isSideChatOpen(record.status));
      if (openRecords.length === 0) return;
      const openIds = new Set(openRecords.map((record) => record.side_chat_id));
      setRecords((current) =>
        current.map((record) =>
          openIds.has(record.side_chat_id)
            ? { ...record, status: "hidden", sessionId: crypto.randomUUID(), isNew: false }
            : record,
        ),
      );
      try {
        await Promise.all(
          openRecords.map((record) =>
            terminalSideChatApi.setStatus({
              workspace_id: workspaceId,
              side_chat_id: record.side_chat_id,
              status: "hidden",
            }),
          ),
        );
      } catch (error) {
        console.error("Failed to hide terminal side chat:", error);
      }
    },
    [records, workspaceId],
  );

  const showSideChat = React.useCallback(
    async (sideChatId: string) => {
      setActiveSideChatId(sideChatId);
      updateLocalRecord(sideChatId, { status: "open", sessionId: crypto.randomUUID(), isNew: false });
      try {
        await terminalSideChatApi.setStatus({
          workspace_id: workspaceId,
          side_chat_id: sideChatId,
          status: "open",
        });
      } catch (error) {
        console.error("Failed to show terminal side chat:", error);
      }
    },
    [updateLocalRecord, workspaceId],
  );

  const closeSideChat = React.useCallback(
    async (sideChatId: string) => {
      terminalRefs.current.get(sideChatId)?.destroy();
      terminalRefs.current.delete(sideChatId);
      setActiveSideChatId((current) => (current === sideChatId ? null : current));
      setRecords((current) => current.filter((record) => record.side_chat_id !== sideChatId));
      try {
        await terminalSideChatApi.close({
          workspace_id: workspaceId,
          side_chat_id: sideChatId,
        });
      } catch (error) {
        console.error("Failed to close terminal side chat:", error);
      }
    },
    [workspaceId],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const sideChatId = new URLSearchParams(window.location.search).get("sideChat");
    if (!sideChatId || openedSideChatParamRef.current === sideChatId) return;
    const record = records.find((item) => item.side_chat_id === sideChatId);
    if (!record) return;
    openedSideChatParamRef.current = sideChatId;
    if (!isSideChatOpen(record.status)) {
      void showSideChat(sideChatId);
    }
  }, [records, showSideChat]);

  React.useEffect(() => {
    const availableRecords = records.filter((record) => !isSideChatClosing(record.status));
    if (availableRecords.length === 0) {
      if (activeSideChatId !== null) setActiveSideChatId(null);
      return;
    }
    if (!activeSideChatId || !availableRecords.some((record) => record.side_chat_id === activeSideChatId)) {
      const fallback = availableRecords.find((record) => isSideChatOpen(record.status)) ?? availableRecords[0];
      setActiveSideChatId(fallback.side_chat_id);
    }
  }, [activeSideChatId, records]);

  const sideChatLayer = (
    <TerminalSideChatLayer
      localPath={localPath}
      projectName={projectName}
      projectRootPath={projectRootPath}
      records={records}
      activeSideChatId={activeSideChatId}
      sourcePaneId={sourcePaneId}
      sourceTmuxWindowName={sourceTmuxWindowName ?? ""}
      terminalRefs={terminalRefs}
      terminalScale={terminalScale}
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      onClose={closeSideChat}
      onCloseAll={(sideChatIds) => {
        void Promise.all(sideChatIds.map((sideChatId) => closeSideChat(sideChatId)));
      }}
      onHide={hideSideChat}
      onSelectSideChat={(sideChatId) => {
        const record = records.find((item) => item.side_chat_id === sideChatId);
        if (!record) return;
        if (isSideChatOpen(record.status)) {
          setActiveSideChatId(sideChatId);
          return;
        }
        void showSideChat(sideChatId);
      }}
      onReady={(record) => {
        if (record.initialCommand && !record.hasSentInitialCommand) {
          terminalRefs.current.get(record.side_chat_id)?.sendText(record.initialCommand);
          updateLocalRecord(record.side_chat_id, {
            hasSentInitialCommand: true,
            initialCommand: undefined,
            isNew: false,
          });
        } else if (record.isNew) {
          updateLocalRecord(record.side_chat_id, { isNew: false });
        }
        void persistRecord({
          ...record,
          hasSentInitialCommand: true,
          initialCommand: undefined,
          isNew: false,
          status: "open",
        });
      }}
    />
  );

  const sideChatDots = (
    <TerminalSideChatDots
      records={records}
      activeSideChatId={activeSideChatId}
      isStarting={isStarting}
      onShow={showSideChat}
    />
  );

  return {
    sideChatDots,
    sideChatLayer,
    startSideChat,
  };
}

function TerminalSideChatLayer({
  localPath,
  projectName,
  projectRootPath,
  records,
  activeSideChatId,
  sourcePaneId,
  sourceTmuxWindowName,
  terminalRefs,
  terminalScale,
  workspaceId,
  workspaceName,
  onClose,
  onCloseAll,
  onHide,
  onSelectSideChat,
  onReady,
}: {
  localPath?: string | null;
  projectName?: string | null;
  projectRootPath?: string | null;
  records: LocalSideChatRecord[];
  activeSideChatId: string | null;
  sourcePaneId: string;
  sourceTmuxWindowName: string;
  terminalRefs: React.MutableRefObject<Map<string, TerminalRef>>;
  terminalScale?: number;
  workspaceId: string;
  workspaceName?: string | null;
  onClose: (sideChatId: string) => void;
  onCloseAll: (sideChatIds: string[]) => void;
  onHide: () => void;
  onSelectSideChat: (sideChatId: string) => void;
  onReady: (record: LocalSideChatRecord) => void;
}) {
  const availableRecords = records.filter((record) => !isSideChatClosing(record.status));
  const activeRecord =
    availableRecords.find((record) => record.side_chat_id === activeSideChatId) ??
    availableRecords.find((record) => isSideChatOpen(record.status)) ??
    availableRecords[0] ??
    null;
  const hasOpenRecord = availableRecords.some((record) => isSideChatOpen(record.status));

  if (!activeRecord || !hasOpenRecord) return null;

  return (
    <TerminalSideChatModal
      activeSideChatId={activeRecord.side_chat_id}
      localPath={localPath}
      projectName={projectName}
      projectRootPath={projectRootPath}
      records={availableRecords}
      sourcePaneId={sourcePaneId}
      sourceTmuxWindowName={sourceTmuxWindowName}
      terminalRefs={terminalRefs}
      terminalScale={terminalScale}
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      onClose={onClose}
      onCloseAll={onCloseAll}
      onHide={onHide}
      onReady={onReady}
      onSelectSideChat={onSelectSideChat}
    />
  );
}

function TerminalSideChatModal({
  activeSideChatId,
  localPath,
  projectName,
  projectRootPath,
  records,
  sourcePaneId,
  sourceTmuxWindowName,
  terminalRefs,
  terminalScale,
  workspaceId,
  workspaceName,
  onClose,
  onCloseAll,
  onHide,
  onReady,
  onSelectSideChat,
}: {
  activeSideChatId: string;
  localPath?: string | null;
  projectName?: string | null;
  projectRootPath?: string | null;
  records: LocalSideChatRecord[];
  sourcePaneId: string;
  sourceTmuxWindowName: string;
  terminalRefs: React.MutableRefObject<Map<string, TerminalRef>>;
  terminalScale?: number;
  workspaceId: string;
  workspaceName?: string | null;
  onClose: (sideChatId: string) => void;
  onCloseAll: (sideChatIds: string[]) => void;
  onHide: () => void;
  onReady: (record: LocalSideChatRecord) => void;
  onSelectSideChat: (sideChatId: string) => void;
}) {
  const t = useTranslations("terminal.sideChat");
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const resizeAbortControllerRef = React.useRef<AbortController | null>(null);
  const dragAbortControllerRef = React.useRef<AbortController | null>(null);
  const resizeStateRef = React.useRef<{
    startX: number;
    startY: number;
    original: SideChatModalLayout;
    edge: SideChatResizeEdge;
  } | null>(null);
  const dragStateRef = React.useRef<{
    startX: number;
    startY: number;
    original: SideChatModalLayout;
    moved: boolean;
  } | null>(null);
  const suppressNextHeaderClickRef = React.useRef(false);
  const [closeAllConfirmOpen, setCloseAllConfirmOpen] = React.useState(false);
  const [layout, setLayout] = React.useState<SideChatModalLayout | null>(null);
  const [readySideChatIds, setReadySideChatIds] = React.useState<Set<string>>(() => new Set());

  React.useLayoutEffect(() => {
    const node = overlayRef.current;
    if (!node) return;

    const syncLayout = () => {
      const bounds = readSideChatModalBounds(node);
      setLayout((current) => {
        const next = current
          ? clampSideChatModalLayout(current, bounds)
          : createInitialSideChatModalLayout(bounds);
        return sideChatModalLayoutsEqual(current, next) ? current : next;
      });
    };

    syncLayout();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncLayout);
      return () => window.removeEventListener("resize", syncLayout);
    }

    const resizeObserver = new ResizeObserver(syncLayout);
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  React.useEffect(() => {
    return () => {
      resizeAbortControllerRef.current?.abort();
      resizeAbortControllerRef.current = null;
      dragAbortControllerRef.current?.abort();
      dragAbortControllerRef.current = null;
    };
  }, []);

  const handleResizeStart = React.useCallback(
    (edge: SideChatResizeEdge) => (event: React.PointerEvent<HTMLDivElement>) => {
      const overlay = overlayRef.current;
      if (!overlay || !layout) return;

      event.preventDefault();
      event.stopPropagation();
      resizeAbortControllerRef.current?.abort();

      resizeStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        original: layout,
        edge,
      };

      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = sideChatModalResizeCursor(edge);
      document.body.style.userSelect = "none";

      const finishResize = () => {
        resizeStateRef.current = null;
        resizeAbortControllerRef.current?.abort();
        resizeAbortControllerRef.current = null;
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const state = resizeStateRef.current;
        const currentOverlay = overlayRef.current;
        if (!state || !currentOverlay) return;

        const dx = moveEvent.clientX - state.startX;
        const dy = moveEvent.clientY - state.startY;
        const next = resizeSideChatModalLayout(state.original, state.edge, dx, dy);
        setLayout(clampSideChatModalLayout(next, readSideChatModalBounds(currentOverlay)));
      };

      resizeAbortControllerRef.current = new AbortController();
      const { signal } = resizeAbortControllerRef.current;
      document.addEventListener("pointermove", handlePointerMove, { signal });
      document.addEventListener("pointerup", finishResize, { signal });
      document.addEventListener("pointercancel", finishResize, { signal });
    },
    [layout],
  );

  const handleDragStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const overlay = overlayRef.current;
      if (event.button !== 0 || !overlay || !layout) return;
      if ((event.target as HTMLElement | null)?.closest("[data-side-chat-control='true']")) return;

      event.stopPropagation();
      dragAbortControllerRef.current?.abort();
      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        original: layout,
        moved: false,
      };

      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      const finishDrag = () => {
        dragStateRef.current = null;
        dragAbortControllerRef.current?.abort();
        dragAbortControllerRef.current = null;
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const state = dragStateRef.current;
        const currentOverlay = overlayRef.current;
        if (!state || !currentOverlay) return;

        const dx = moveEvent.clientX - state.startX;
        const dy = moveEvent.clientY - state.startY;
        if (!state.moved && Math.hypot(dx, dy) < 3) return;

        state.moved = true;
        suppressNextHeaderClickRef.current = true;
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        setLayout(
          clampSideChatModalLayout(
            { ...state.original, x: state.original.x + dx, y: state.original.y + dy },
            readSideChatModalBounds(currentOverlay),
          ),
        );
      };

      dragAbortControllerRef.current = new AbortController();
      const { signal } = dragAbortControllerRef.current;
      document.addEventListener("pointermove", handlePointerMove, { signal });
      document.addEventListener("pointerup", finishDrag, { signal });
      document.addEventListener("pointercancel", finishDrag, { signal });
    },
    [layout],
  );

  const modalStyle: React.CSSProperties = layout
    ? {
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
      }
    : {
        left: "50%",
        top: "50%",
        width: "min(900px, 100%)",
        height: "min(560px, 100%)",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-2 z-[95]"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div
        className="absolute flex min-w-0 flex-col overflow-hidden rounded-md border border-border/70 bg-background shadow-[0_22px_60px_rgba(0,0,0,0.38)]"
        style={modalStyle}
      >
        <SideChatResizeHandles onResizeStart={handleResizeStart} />
        <Tabs
          value={activeSideChatId}
          onValueChange={(value) => onSelectSideChat(value)}
          className="min-h-0 flex-1"
        >
          <div
            className="flex h-10 shrink-0 cursor-grab items-center justify-between gap-3 bg-background px-3 active:cursor-grabbing"
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
                    <span
                      data-side-chat-control="true"
                      role="button"
                      tabIndex={0}
                      aria-label={t("closeTab")}
                      className={cn(
                        "absolute right-1 top-1/2 z-10 size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground",
                        activeSideChatId === record.side_chat_id
                          ? "flex opacity-0 group-hover/side-tab:opacity-100"
                          : "hidden",
                      )}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onClose(record.side_chat_id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        onClose(record.side_chat_id);
                      }}
                    >
                      <X className="size-3" />
                    </span>
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
          <div className="min-h-0 flex-1 bg-background">
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
                  getTerminalCursorClientPoint={() =>
                    terminalRefs.current.get(record.side_chat_id)?.getCursorClientPoint() ?? null
                  }
                  isTerminalReady={readySideChatIds.has(record.side_chat_id)}
                  localPath={localPath}
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
        className="absolute -top-1 left-2 right-2 z-20 h-2 cursor-n-resize touch-none"
        onPointerDown={onResizeStart("n")}
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-1 left-2 right-2 z-20 h-2 cursor-s-resize touch-none"
        onPointerDown={onResizeStart("s")}
      />
      <div
        aria-hidden="true"
        className="absolute -left-1 bottom-2 top-2 z-20 w-2 cursor-w-resize touch-none"
        onPointerDown={onResizeStart("w")}
      />
      <div
        aria-hidden="true"
        className="absolute -right-1 bottom-2 top-2 z-20 w-2 cursor-e-resize touch-none"
        onPointerDown={onResizeStart("e")}
      />
      <div
        aria-hidden="true"
        className="absolute -left-1 -top-1 z-30 size-3 cursor-nw-resize touch-none"
        onPointerDown={onResizeStart("nw")}
      />
      <div
        aria-hidden="true"
        className="absolute -right-1 -top-1 z-30 size-3 cursor-ne-resize touch-none"
        onPointerDown={onResizeStart("ne")}
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-1 -left-1 z-30 size-3 cursor-sw-resize touch-none"
        onPointerDown={onResizeStart("sw")}
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-1 -right-1 z-30 size-3 cursor-se-resize touch-none"
        onPointerDown={onResizeStart("se")}
      />
    </>
  );
}

function readSideChatModalBounds(node: HTMLElement): SideChatModalBounds {
  const rect = node.getBoundingClientRect();
  return {
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
  };
}

function createInitialSideChatModalLayout(bounds: SideChatModalBounds): SideChatModalLayout {
  const width = Math.min(SIDE_CHAT_MODAL_DEFAULT_WIDTH, bounds.width);
  const height = Math.min(SIDE_CHAT_MODAL_DEFAULT_HEIGHT, bounds.height);
  return {
    x: Math.max(0, Math.round((bounds.width - width) / 2)),
    y: Math.max(0, Math.round((bounds.height - height) / 2)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function clampSideChatModalLayout(
  layout: SideChatModalLayout,
  bounds: SideChatModalBounds,
): SideChatModalLayout {
  const maxWidth = Math.max(0, bounds.width);
  const maxHeight = Math.max(0, bounds.height);
  const minWidth = Math.min(SIDE_CHAT_MODAL_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(SIDE_CHAT_MODAL_MIN_HEIGHT, maxHeight);
  const width = clampNumber(layout.width, minWidth, maxWidth);
  const height = clampNumber(layout.height, minHeight, maxHeight);
  const x = clampNumber(layout.x, 0, Math.max(0, maxWidth - width));
  const y = clampNumber(layout.y, 0, Math.max(0, maxHeight - height));

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function resizeSideChatModalLayout(
  layout: SideChatModalLayout,
  edge: SideChatResizeEdge,
  dx: number,
  dy: number,
): SideChatModalLayout {
  let { x, y, width, height } = layout;

  if (edge.includes("e")) width += dx;
  if (edge.includes("s")) height += dy;
  if (edge.includes("w")) {
    width -= dx;
    x += dx;
  }
  if (edge.includes("n")) {
    height -= dy;
    y += dy;
  }

  return { x, y, width, height };
}

function sideChatModalResizeCursor(edge: SideChatResizeEdge): string {
  if (edge === "n" || edge === "s") return `${edge}-resize`;
  if (edge === "e" || edge === "w") return `${edge}-resize`;
  return `${edge}-resize`;
}

function sideChatModalLayoutsEqual(
  a: SideChatModalLayout | null,
  b: SideChatModalLayout,
): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function clampNumber(value: number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.min(max, Math.max(min, value));
}

function TerminalSideChatDots({
  records,
  activeSideChatId,
  isStarting,
  onShow,
}: {
  records: LocalSideChatRecord[];
  activeSideChatId: string | null;
  isStarting: boolean;
  onShow: (sideChatId: string) => void;
}) {
  const t = useTranslations("terminal.sideChat");
  const availableRecords = records.filter((record) => !isSideChatClosing(record.status));
  const hasOpenRecord = availableRecords.some((record) => isSideChatOpen(record.status));
  const targetRecord =
    availableRecords.find((record) => record.side_chat_id === activeSideChatId) ??
    availableRecords.at(-1) ??
    null;

  return (
    <>
      {isStarting ? (
        <span
          className="inline-flex size-5 items-center justify-center"
          title={t("starting")}
        >
          <span className="size-1 rounded-full bg-foreground/25 shadow-[0_1px_4px_rgba(0,0,0,0.16)] animate-pulse" />
        </span>
      ) : null}
      {targetRecord && !hasOpenRecord ? (
        <button
          type="button"
          className="group/side-dot inline-flex size-5 items-center justify-center"
          aria-label={t("show")}
          title={t("show")}
          onClick={() => onShow(targetRecord.side_chat_id)}
        >
          <span className="size-1 rounded-full bg-foreground/25 shadow-[0_1px_4px_rgba(0,0,0,0.16)] transition-colors duration-200 group-hover/side-dot:bg-foreground/35" />
        </button>
      ) : null}
    </>
  );
}

function sideChatTabLabel(record: LocalSideChatRecord, index: number, fallbackTitle: string): string {
  return record.agent?.label?.trim() || `${fallbackTitle} ${index + 1}`;
}

function mergeSideChatRecords(
  current: LocalSideChatRecord[],
  incoming: LocalSideChatRecord[],
) {
  const currentById = new Map(current.map((record) => [record.side_chat_id, record]));
  const incomingIds = new Set(incoming.map((record) => record.side_chat_id));
  const merged = incoming.map((record) => ({
    ...record,
    ...currentById.get(record.side_chat_id),
    ...record,
  }));
  for (const record of current) {
    if (!incomingIds.has(record.side_chat_id) && record.isNew) {
      merged.push(record);
    }
  }
  return merged;
}

function toSideChatDto(record: LocalSideChatRecord): TerminalSideChatRecord {
  return {
    side_chat_id: record.side_chat_id,
    workspace_id: record.workspace_id,
    project_name: record.project_name,
    workspace_name: record.workspace_name,
    source_pane_id: record.source_pane_id,
    source_tmux_window_name: record.source_tmux_window_name,
    source_surface_kind: record.source_surface_kind,
    source_surface_ref_json: record.source_surface_ref_json,
    side_tmux_window_name: record.side_tmux_window_name,
    agent_ref_json: record.agent_ref_json,
    color_hex: record.color_hex,
    status: normalizeSideChatStatus(record.status),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function normalizeSideChatStatus(status: LegacySideChatStatus): TerminalSideChatStatus {
  if (status === "visible") return "open";
  if (status === "closed") return "closing";
  if (status === "open" || status === "hidden" || status === "closing") return status;
  return "hidden";
}

function isSideChatOpen(status: LegacySideChatStatus): boolean {
  return normalizeSideChatStatus(status) === "open";
}

function isSideChatClosing(status: LegacySideChatStatus): boolean {
  return normalizeSideChatStatus(status) === "closing";
}

function pickUniqueBrightColor(existingColors: string[]) {
  const used = new Set(existingColors.map((color) => color.toLowerCase()));
  const available = BRIGHT_SIDE_CHAT_COLORS.filter((color) => !used.has(color.toLowerCase()));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const hue = Math.floor(Math.random() * 360);
    const color = hslToHex(hue, 78, 54);
    if (!used.has(color.toLowerCase())) return color;
  }
  return hslToHex(Math.floor(Math.random() * 360), 78, 54);
}

function buildSideChatPrompt({
  capture,
  sourceTmuxWindowName,
  userPrompt,
}: {
  capture: TerminalSideContextCaptureResponse;
  sourceTmuxWindowName: string;
  userPrompt: string;
}) {
  const metadata = [
    `Source terminal: ${sourceTmuxWindowName}`,
    `Captured lines: ${capture.captured_lines}`,
    `Captured bytes: ${capture.captured_bytes}/${capture.prompt_budget_bytes}`,
  ];
  if (capture.omitted_older_bytes > 0 || capture.omitted_middle_bytes > 0 || capture.truncated_bytes) {
    metadata.push("Capture was bounded; omitted content may exist outside this excerpt.");
  }

  return [
    "You are continuing in a side chat forked from an Atmos terminal.",
    "Use the captured terminal context below as background. Do not assume it is complete.",
    "",
    metadata.join("\n"),
    "",
    "Captured terminal context:",
    "```text",
    capture.text,
    "```",
    "",
    "User prompt:",
    userPrompt.trim(),
  ].join("\n");
}

function hslToHex(h: number, s: number, l: number) {
  const saturation = s / 100;
  const lightness = l / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
      ? [x, c, 0]
      : h < 180
      ? [0, c, x]
      : h < 240
      ? [0, x, c]
      : h < 300
      ? [x, 0, c]
      : [c, 0, x];
  return `#${[r, g, b]
    .map((value) => Math.round((value + m) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseAgentRef(value: string | null | undefined): TerminalPaneAgent | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<TerminalPaneAgent>;
    if (
      typeof parsed.id === "string" &&
      typeof parsed.label === "string" &&
      typeof parsed.command === "string" &&
      (parsed.iconType === "built-in" || parsed.iconType === "custom")
    ) {
      return {
        id: parsed.id,
        label: parsed.label,
        command: parsed.command,
        iconType: parsed.iconType,
        pipeCommand: typeof parsed.pipeCommand === "string" ? parsed.pipeCommand : undefined,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

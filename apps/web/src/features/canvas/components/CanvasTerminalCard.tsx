"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import {
  HTMLContainer,
  useEditor,
  useValue,
  type TLShapeId,
} from "tldraw";
import { ArrowUpRight, PinOff, Plus, SquareTerminal, X } from "lucide-react";
import { cn, toastManager } from "@workspace/ui";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { Terminal, type TerminalRef } from "@/features/terminal/components/Terminal";
import {
  TerminalAgentInputOverlay,
  type TerminalAgentInputOverlayHandle,
} from "@/features/terminal/components/TerminalAgentInputOverlay";
import { TerminalTitleWithAgent } from "@/features/terminal/components/terminal-title";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";
import { useTerminalToolbarTitle } from "@/features/terminal/hooks/use-terminal-toolbar-title";
import { useTerminalSideChats } from "@/features/terminal/hooks/use-terminal-side-chats";
import {
  isTerminalAgentInputPinShortcut,
  isTerminalAgentInputShortcut,
  resolveTerminalAgentSubmitMode,
} from "@/features/terminal/lib/terminal-runtime-utils";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/store/use-terminal-store";
import { clearLastPinnedTerminal } from "@/shared/stores/use-ui-pref-hooks";
import { useCanvasSettingsStore } from "@/features/canvas/store/canvas-settings-store";
import { useCanvasBoard } from "../hooks/use-canvas-board";
import { useCreateRelatedCanvasTerminal } from "../hooks/use-create-related-canvas-terminal";
import { useCanvasRuntimeStore } from "../store/canvas-runtime-store";
import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  CanvasTerminalShapeSchemaUtil,
  dispatchCanvasTerminalCloseRequest,
  dispatchCanvasTerminalPinStateChange,
  getCanvasTerminalShapes,
  type CanvasTerminalShape,
} from "../lib/canvas-terminal-shape";
import {
  areShapeIdListsEqual,
  promoteRenderedShapeId,
} from "../lib/canvas-terminal-rendering";
import {
  registerCanvasTerminalRef,
  useCanvasTerminalRefs,
} from "../lib/canvas-terminal-ref-context";
import {
  CANVAS_CARD_CORNER_RADIUS,
  getCanvasCardInnerCornerRadius,
} from "../lib/canvas-shape-indicator";

export const CanvasAgentContext = React.createContext<TerminalPaneAgent[]>([]);

type TerminalOverlayViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
};

const CANVAS_TERMINAL_OVERLAY_Z_INDEX = 155;

export class CanvasTerminalShapeUtil extends CanvasTerminalShapeSchemaUtil {
  component(shape: CanvasTerminalShape) {
    return <CanvasTerminalCard shape={shape} />;
  }
}

function CanvasTerminalCard({ shape }: { shape: CanvasTerminalShape }) {
  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: shape.props.w,
        height: shape.props.h,
        pointerEvents: "all",
      }}
    >
      <CanvasTerminalCardInner shape={shape} />
    </HTMLContainer>
  );
}

function CanvasTerminalCardInner({ shape }: { shape: CanvasTerminalShape }) {
  const t = useTranslations("Canvas.chrome");
  const [sessionId] = React.useState(() => crypto.randomUUID());
  const [portalRoot, setPortalRoot] = React.useState<HTMLElement | null>(null);
  const [terminalViewport, setTerminalViewport] =
    React.useState<TerminalOverlayViewport | null>(null);
  const { board } = useCanvasBoard();
  const { workspaceId, tmuxWindowName, contextScope } = shape.props;
  const editor = useEditor();
  const router = useAppRouter();
  const terminalHostRef = React.useRef<HTMLDivElement | null>(null);
  const terminalOverlayRef = React.useRef<HTMLDivElement | null>(null);
  const terminalApiRef = React.useRef<TerminalRef | null>(null);
  const agentInputOverlayRef = React.useRef<TerminalAgentInputOverlayHandle | null>(null);
  const [isTerminalReady, setIsTerminalReady] = React.useState(false);
  const terminalRefs = useCanvasTerminalRefs();
  const activeShapeId = useCanvasRuntimeStore((state) => state.activeShapeId);
  const renderedShapeIds = useCanvasRuntimeStore((state) => state.renderedShapeIds);
  const consumePendingTerminalCommand = useCanvasRuntimeStore((state) => state.consumePendingTerminalCommand);
  const setActiveShapeId = useCanvasRuntimeStore((state) => state.setActiveShapeId);
  const setRenderedShapeIds = useCanvasRuntimeStore((state) => state.setRenderedShapeIds);
  const removeRenderedShapeId = useCanvasRuntimeStore((state) => state.removeRenderedShapeId);
  const maxRenderedTerminals = useCanvasSettingsStore((state) => state.maxRenderedTerminals);
  const configuredAgents = React.useContext(CanvasAgentContext);
  const createRelatedTerminal = useCreateRelatedCanvasTerminal(shape);
  const markCanvasOverlayInteractionHandled = React.useCallback(
    (event: Event | React.SyntheticEvent) => {
      editor.markEventAsHandled(event);
    },
    [editor],
  );

  const storeWrite = React.useMemo(
    () =>
      contextScope === "workspace" || contextScope === "project"
        ? ({ kind: "tmux-window" as const, workspaceId, tmuxWindowName, contextScope })
        : ({ kind: "none" as const }),
    [contextScope, workspaceId, tmuxWindowName],
  );

  const { displayTitle, toolbarAgent, onTitleChange } = useTerminalToolbarTitle({
    baseTitle: shape.props.terminalName,
    configuredAgents,
    pinnedAgent: shape.props.paneAgent,
    storeWrite,
  });
  const contextLabel = [shape.props.projectName, shape.props.workspaceName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");

  const isSelected = useValue(
    "canvas-card-selected",
    () => editor.getSelectedShapeIds().includes(shape.id as TLShapeId),
    [editor, shape.id],
  );
  const isActive = activeShapeId === shape.id;
  const isRendered = renderedShapeIds.includes(shape.id);
  const sourcePaneId = `${shape.props.workspaceId}:${shape.props.tmuxWindowName}`;
  const agentForSubmit = shape.props.paneAgent ?? toolbarAgent;
  const agentSubmitMode = resolveTerminalAgentSubmitMode(agentForSubmit);
  const sideChatAgentOptions = React.useMemo(() => {
    const options = [...configuredAgents];
    if (agentForSubmit?.command?.trim() && !options.some((agent) => agent.id === agentForSubmit.id)) {
      options.unshift(agentForSubmit);
    }
    return options;
  }, [agentForSubmit, configuredAgents]);
  const {
    sideChatDots,
    sideChatLayer,
    startSideChat,
  } = useTerminalSideChats({
    workspaceId: shape.props.workspaceId,
    projectName: shape.props.projectName,
    workspaceName: shape.props.workspaceName,
    localPath: shape.props.localPath || null,
    projectRootPath: shape.props.localPath || null,
    sourcePaneId,
    sourceSessionId: sessionId,
    sourceSurfaceKind: "canvas_terminal",
    sourceSurfaceRef: { shapeId: shape.id, contextScope: shape.props.contextScope },
    sourceTmuxWindowName: shape.props.tmuxWindowName,
    terminalScale: terminalViewport?.scale,
    onInteraction: markCanvasOverlayInteractionHandled,
  });

  React.useEffect(() => {
    const container = editor.getContainer();
    const wrapper = container.closest(".tldraw-wrapper");
    setPortalRoot(wrapper instanceof HTMLElement ? wrapper : container);
  }, [editor]);

  const markAttached = React.useCallback(() => {
    if (!shape.props.isNewTerminal) {
      return;
    }

    editor.updateShape({
      id: shape.id,
      type: CANVAS_TERMINAL_SHAPE_TYPE,
      props: {
        isNewTerminal: false,
      },
    });
  }, [editor, shape]);

  const handleSessionReady = React.useCallback(() => {
    markAttached();
    setIsTerminalReady(true);
    const pendingCommand = consumePendingTerminalCommand(shape.id);
    if (pendingCommand) {
      terminalApiRef.current?.sendText(pendingCommand);
    }
  }, [consumePendingTerminalCommand, markAttached, shape.id]);

  const focusTerminal = React.useCallback(() => {
    terminalApiRef.current?.focus();
  }, []);

  const activateTerminal = React.useCallback(() => {
    setActiveShapeId(shape.id);
    editor.select(shape.id as TLShapeId);
    const attachedAt = Date.now();
    const nextRenderedShapeIds = promoteRenderedShapeId(
      getCanvasTerminalShapes(editor),
      renderedShapeIds,
      shape.id,
      attachedAt,
      maxRenderedTerminals,
    );
    if (!areShapeIdListsEqual(nextRenderedShapeIds, renderedShapeIds)) {
      setRenderedShapeIds(nextRenderedShapeIds);
    }
    editor.updateShape({
      id: shape.id,
      type: CANVAS_TERMINAL_SHAPE_TYPE,
      props: {
        lastAttachedAt: attachedAt,
      },
    });
    requestAnimationFrame(() => {
      focusTerminal();
    });
  }, [
    editor,
    focusTerminal,
    maxRenderedTerminals,
    renderedShapeIds,
    setActiveShapeId,
    setRenderedShapeIds,
    shape.id,
  ]);

  const markTerminalInteractionHandled = React.useCallback(
    (event: React.SyntheticEvent) => {
      editor.markEventAsHandled(event);
      activateTerminal();
      event.stopPropagation();
    },
    [activateTerminal, editor],
  );

  const syncTerminalViewport = React.useCallback(() => {
    const host = terminalHostRef.current;
    const next = host ? measureTerminalOverlayViewport(host) : null;
    setTerminalViewport((current) =>
      areTerminalOverlayViewportsEqual(current, next) ? current : next,
    );
  }, []);

  React.useEffect(() => {
    if (!isRendered) {
      setTerminalViewport(null);
      return;
    }

    let frame = 0;
    let disposed = false;

    const tick = () => {
      syncTerminalViewport();
      if (!disposed) {
        frame = requestAnimationFrame(tick);
      }
    };

    tick();
    window.addEventListener("resize", syncTerminalViewport);
    window.addEventListener("scroll", syncTerminalViewport, true);

    return () => {
      disposed = true;
      if (frame) {
        cancelAnimationFrame(frame);
      }
      window.removeEventListener("resize", syncTerminalViewport);
      window.removeEventListener("scroll", syncTerminalViewport, true);
    };
  }, [isRendered, syncTerminalViewport]);

  React.useEffect(() => {
    if (!isActive || !isRendered) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      focusTerminal();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [focusTerminal, isActive, isRendered]);

  React.useEffect(() => {
    const resolveCanvasTerminalTarget = (event: KeyboardEvent) => {
      const overlay = terminalOverlayRef.current;
      if (!overlay || overlay.getClientRects().length === 0) return false;

      const eventTarget = event.target instanceof Node ? event.target : null;
      const activeTarget = document.activeElement;
      const isSideChatTarget = (target: Element | null) => {
        return !!target && !!target.closest("[data-side-chat-modal='true']");
      };
      const isCanvasTerminalTarget =
        (eventTarget !== null && overlay.contains(eventTarget)) ||
        (activeTarget !== null && overlay.contains(activeTarget));
      return (
        isCanvasTerminalTarget &&
        !isSideChatTarget(eventTarget instanceof Element ? eventTarget : null) &&
        !isSideChatTarget(activeTarget)
      );
    };

    const handleCanvasTerminalAgentInputShortcut = (event: KeyboardEvent) => {
      if (isTerminalAgentInputPinShortcut(event) && resolveCanvasTerminalTarget(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        agentInputOverlayRef.current?.togglePin();
        return;
      }
      if (isTerminalAgentInputShortcut(event) && resolveCanvasTerminalTarget(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        agentInputOverlayRef.current?.toggle();
      }
    };

    window.addEventListener("keydown", handleCanvasTerminalAgentInputShortcut, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleCanvasTerminalAgentInputShortcut, { capture: true });
    };
  }, []);

  const stopCanvasInteractionWhileActive = React.useCallback(
    (event: React.SyntheticEvent) => {
      if (!isActive) {
        return;
      }
      editor.markEventAsHandled(event);
      event.stopPropagation();
    },
    [editor, isActive],
  );

  React.useEffect(() => {
    const host = terminalHostRef.current;
    if (!host) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!isRendered) {
        return;
      }
      editor.markEventAsHandled(event);
      event.stopPropagation();
      // xterm stops scrolling at buffer ends but the wheel event still chains to the canvas
      // unless default scrolling is cancelled (passive: false is required).
      event.preventDefault();
    };

    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      host.removeEventListener("wheel", handleWheel);
    };
  }, [editor, isRendered]);

  const handleRevealSource = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const base = shape.props.contextScope === "project" ? "/project" : "/workspace";
      const params = new URLSearchParams();
      params.set("id", shape.props.workspaceId);
      params.set("tab", shape.props.sourceTerminalTabId || FIXED_TERMINAL_TAB_VALUE);
      params.set("terminalTmux", shape.props.tmuxWindowName);
      router.push(`${base}?${params.toString()}`);
    },
    [
      router,
      shape.props.contextScope,
      shape.props.workspaceId,
      shape.props.sourceTerminalTabId,
      shape.props.tmuxWindowName,
    ],
  );

  const handleCreateRelatedTerminal = React.useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const result = await createRelatedTerminal();
      if (result.status === "placement-failed") {
        toastManager.add({
          title: t("common.canvas"),
          description: t("terminalCard.couldNotPlaceNewTerminal"),
          type: "error",
        });
        return;
      }

      if (result.status === "terminal-create-failed") {
        toastManager.add({
          title: t("common.canvas"),
          description: t("terminalCard.couldNotCreateNewTerminalTab"),
          type: "error",
        });
        return;
      }

      toastManager.add({
        title: t("common.canvas"),
        description: t("terminalCard.newTerminalCreated"),
        type: "success",
      });
    },
    [
      createRelatedTerminal,
      t,
    ],
  );

  const bindTerminalRef = React.useCallback(
    (api: TerminalRef | null) => {
      terminalApiRef.current = api;
      registerCanvasTerminalRef(terminalRefs, shape.id, api);
    },
    [terminalRefs, shape.id],
  );

  const handleUnpin = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      editor.deleteShapes([shape.id as TLShapeId]);
      dispatchCanvasTerminalPinStateChange(shape.props.pinKey, false);
      clearLastPinnedTerminal(board?.guid, shape.props.pinKey);
      removeRenderedShapeId(shape.id);
      if (activeShapeId === shape.id) {
        setActiveShapeId(null);
      }
    },
    [activeShapeId, board?.guid, editor, removeRenderedShapeId, setActiveShapeId, shape.id, shape.props.pinKey],
  );

  const handleCloseTerminal = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dispatchCanvasTerminalCloseRequest({
        contextScope: shape.props.contextScope,
        workspaceId: shape.props.workspaceId,
        sourceTerminalTabId: shape.props.sourceTerminalTabId || FIXED_TERMINAL_TAB_VALUE,
        tmuxWindowName: shape.props.tmuxWindowName,
        pinKey: shape.props.pinKey,
        shapeId: shape.id as TLShapeId,
      });
      editor.deleteShapes([shape.id as TLShapeId]);
      dispatchCanvasTerminalPinStateChange(shape.props.pinKey, false);
      clearLastPinnedTerminal(board?.guid, shape.props.pinKey);
      removeRenderedShapeId(shape.id);
      if (activeShapeId === shape.id) {
        setActiveShapeId(null);
      }
    },
    [
      activeShapeId,
      board?.guid,
      editor,
      removeRenderedShapeId,
      setActiveShapeId,
      shape.id,
      shape.props.contextScope,
      shape.props.pinKey,
      shape.props.sourceTerminalTabId,
      shape.props.tmuxWindowName,
      shape.props.workspaceId,
    ],
  );

  const terminalPortal =
    isRendered && portalRoot && terminalViewport
      ? createPortal(
          <div
            ref={terminalOverlayRef}
            data-canvas-terminal-overlay="true"
            style={{
              left: terminalViewport.left,
              top: terminalViewport.top,
              width: terminalViewport.width,
              height: terminalViewport.height,
              borderBottomLeftRadius: getCanvasCardInnerCornerRadius(terminalViewport.scale),
              borderBottomRightRadius: getCanvasCardInnerCornerRadius(terminalViewport.scale),
              zIndex: isActive
                ? CANVAS_TERMINAL_OVERLAY_Z_INDEX + 1
                : CANVAS_TERMINAL_OVERLAY_Z_INDEX,
            }}
            className="fixed overflow-hidden bg-background"
            onPointerDown={markTerminalInteractionHandled}
            onPointerMove={stopCanvasInteractionWhileActive}
            onPointerUp={stopCanvasInteractionWhileActive}
            onDoubleClick={markTerminalInteractionHandled}
            onMouseDown={markTerminalInteractionHandled}
            onKeyDown={stopCanvasInteractionWhileActive}
            onWheel={(event) => {
              editor.markEventAsHandled(event);
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <Terminal
              ref={bindTerminalRef}
              sessionId={sessionId}
              workspaceId={shape.props.workspaceId}
              tmuxWindowName={shape.props.tmuxWindowName}
              terminalName={shape.props.terminalName}
              projectName={shape.props.projectName}
              workspaceName={shape.props.workspaceName}
              cwd={shape.props.localPath || undefined}
              projectRootPath={shape.props.localPath || undefined}
              isNewPane={shape.props.isNewTerminal}
              className="h-full"
              terminalScale={terminalViewport.scale}
              onAddSelectionAsContext={(snapshot) => {
                activateTerminal();
                agentInputOverlayRef.current?.addTerminalSelectionContext(snapshot);
              }}
              onStartSideChatForSelection={(snapshot) => {
                activateTerminal();
                agentInputOverlayRef.current?.startSideChatForTerminalSelection(snapshot);
              }}
              onSessionReady={handleSessionReady}
              onTitleChange={onTitleChange}
              onSessionError={(_, error) => {
                setIsTerminalReady(false);
                toastManager.add({
                  title: t("common.canvas"),
                  description: error,
                  type: "error",
                });
              }}
            />
            <TerminalAgentInputOverlay
              ref={agentInputOverlayRef}
              activeProjectId={shape.props.contextScope === "project" ? shape.props.workspaceId : null}
              getTerminalCursorClientPoint={() => terminalApiRef.current?.getCursorClientPoint() ?? null}
              isTerminalReady={isTerminalReady}
              localPath={shape.props.localPath || null}
              onInteraction={markCanvasOverlayInteractionHandled}
              onStartSideChat={startSideChat}
              onSendEnter={() => {
                terminalApiRef.current?.sendEnter();
              }}
              onSendText={(text) => {
                activateTerminal();
                terminalApiRef.current?.focus();
                terminalApiRef.current?.sendText(text);
              }}
              sideChatAgent={agentForSubmit ?? null}
              sideChatAgentOptions={sideChatAgentOptions}
              sideChatDots={sideChatDots}
              submitMode={agentSubmitMode}
            />
            {sideChatLayer}
          </div>,
          portalRoot,
        )
      : null;

  return (
    <>
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden border bg-background text-foreground shadow-sm",
        isSelected ? "border-transparent" : "border-border",
      )}
      style={{ borderRadius: CANVAS_CARD_CORNER_RADIUS }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-border/70 bg-background px-4 py-3"
        onPointerDown={() => {
          activateTerminal();
        }}
      >
        <div className="min-w-0 flex items-center gap-2">
          <TerminalTitleWithAgent
            displayTitle={displayTitle}
            toolbarAgent={toolbarAgent}
            className="gap-1.5 text-sm font-semibold text-foreground"
          />
          {contextLabel ? (
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              ({contextLabel})
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleCreateRelatedTerminal}
            aria-label={t("terminalCard.newTerminal")}
            title={t("terminalCard.newTerminal")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
          {shape.props.isPinned && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleUnpin}
              aria-label={t("terminalCard.unpinFromCanvas")}
              title={t("common.unpin")}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PinOff className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleCloseTerminal}
            aria-label={t("terminalCard.closeTerminal")}
            title={t("terminalCard.closeTerminal")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/12 hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleRevealSource}
            aria-label={t("terminalCard.openSourceTerminal")}
            title={t("common.source")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={terminalHostRef}
        className="min-h-0 flex-1 overflow-hidden bg-background"
        style={{
          borderBottomLeftRadius: CANVAS_CARD_CORNER_RADIUS - 1,
          borderBottomRightRadius: CANVAS_CARD_CORNER_RADIUS - 1,
          overscrollBehavior: "contain",
        }}
        onPointerDown={markTerminalInteractionHandled}
        onPointerMove={stopCanvasInteractionWhileActive}
        onPointerUp={stopCanvasInteractionWhileActive}
        onDoubleClick={markTerminalInteractionHandled}
        onMouseDown={markTerminalInteractionHandled}
        onKeyDown={stopCanvasInteractionWhileActive}
      >
        {isRendered ? (
          <div className="h-full bg-background" aria-hidden />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <SquareTerminal className="size-8 text-muted-foreground" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                {isSelected
                  ? t("terminalCard.activateThisCardToOpenLiveTerminal")
                  : t("terminalCard.selectThisCardToActivateLiveTerminal")}
              </div>
              <div className="text-xs text-muted-foreground">
                {shape.props.localPath || t("terminalCard.attachedTmuxWindow")}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    {terminalPortal}
    </>
  );
}

function measureTerminalOverlayViewport(host: HTMLElement): TerminalOverlayViewport | null {
  const rect = host.getBoundingClientRect();
  const width = Math.max(0, rect.width);
  const height = Math.max(0, rect.height);
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || width <= 0 || height <= 0) {
    return null;
  }

  const unscaledWidth = host.offsetWidth || width;
  const rawScale = unscaledWidth > 0 ? width / unscaledWidth : 1;
  const scale = Math.max(0.1, Math.round(rawScale * 1000) / 1000);

  return {
    left: roundViewportValue(rect.left),
    top: roundViewportValue(rect.top),
    width: roundViewportValue(width),
    height: roundViewportValue(height),
    scale,
  };
}

function areTerminalOverlayViewportsEqual(
  a: TerminalOverlayViewport | null,
  b: TerminalOverlayViewport | null,
) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height &&
    a.scale === b.scale
  );
}

function roundViewportValue(value: number) {
  return Math.round(value * 10) / 10;
}

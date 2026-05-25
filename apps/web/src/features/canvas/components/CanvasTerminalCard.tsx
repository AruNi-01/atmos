"use client";

import React from "react";
import {
  HTMLContainer,
  useEditor,
  useValue,
  type TLShapeId,
} from "tldraw";
import { ArrowUpRight, PinOff, SquareTerminal } from "lucide-react";
import { cn, toastManager } from "@workspace/ui";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { Terminal, type TerminalRef } from "@/features/terminal/components/Terminal";
import { TerminalTitleWithAgent } from "@/features/terminal/components/terminal-title";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";
import { useTerminalToolbarTitle } from "@/features/terminal/hooks/use-terminal-toolbar-title";
import { FIXED_TERMINAL_TAB_VALUE } from "@/features/terminal/store/use-terminal-store";
import { clearLastPinnedTerminal } from "@/shared/stores/use-ui-pref-hooks";
import { useCanvasSettingsStore } from "@/features/canvas/store/canvas-settings-store";
import { useCanvasBoard } from "../hooks/use-canvas-board";
import { useCanvasRuntimeStore } from "../store/canvas-runtime-store";
import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  CanvasTerminalShapeSchemaUtil,
  dispatchCanvasTerminalPinStateChange,
  getCanvasTerminalShapes,
  type CanvasTerminalShape,
} from "../lib/canvas-terminal-shape";
import {
  promoteRenderedShapeId,
} from "../lib/canvas-terminal-rendering";
import {
  registerCanvasTerminalRef,
  useCanvasTerminalRefs,
} from "../lib/canvas-terminal-ref-context";

export const CanvasAgentContext = React.createContext<TerminalPaneAgent[]>([]);

export function areShapeIdListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((shapeId, index) => shapeId === right[index]);
}

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
  const [sessionId] = React.useState(() => crypto.randomUUID());
  const { board } = useCanvasBoard();
  const { workspaceId, tmuxWindowName, contextScope } = shape.props;
  const editor = useEditor();
  const router = useAppRouter();
  const terminalHostRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRefs = useCanvasTerminalRefs();
  const activeShapeId = useCanvasRuntimeStore((state) => state.activeShapeId);
  const renderedShapeIds = useCanvasRuntimeStore((state) => state.renderedShapeIds);
  const setActiveShapeId = useCanvasRuntimeStore((state) => state.setActiveShapeId);
  const setRenderedShapeIds = useCanvasRuntimeStore((state) => state.setRenderedShapeIds);
  const removeRenderedShapeId = useCanvasRuntimeStore((state) => state.removeRenderedShapeId);
  const maxRenderedTerminals = useCanvasSettingsStore((state) => state.maxRenderedTerminals);
  const configuredAgents = React.useContext(CanvasAgentContext);

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

  const isSelected = useValue(
    "canvas-card-selected",
    () => editor.getSelectedShapeIds().includes(shape.id as TLShapeId),
    [editor, shape.id],
  );
  const isActive = activeShapeId === shape.id;
  const isRendered = renderedShapeIds.includes(shape.id);

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

  const focusTerminal = React.useCallback(() => {
    const container = terminalHostRef.current;
    if (!container) {
      return;
    }

    const target =
      container.querySelector<HTMLElement>(".xterm-helper-textarea") ??
      container.querySelector<HTMLElement>(".xterm");
    target?.focus();
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

  const bindTerminalRef = React.useCallback(
    (api: TerminalRef | null) => {
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

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-[20px] bg-background text-foreground",
        // 已挂载 live terminal：不画卡片外框，由 tldraw 选区/形状指示承担轮廓
        isRendered ? "border-0 shadow-none" : "border border-border shadow-sm",
      )}
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3"
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
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            ({shape.props.projectName} · {shape.props.workspaceName})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {shape.props.isPinned && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleUnpin}
              aria-label="Unpin from canvas"
              title="Unpin"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PinOff className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleRevealSource}
            aria-label="Open source terminal"
            title="Source"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={terminalHostRef}
        className="min-h-0 flex-1 bg-background"
        style={{ overscrollBehavior: "contain" }}
        onPointerDown={markTerminalInteractionHandled}
        onPointerMove={stopCanvasInteractionWhileActive}
        onPointerUp={stopCanvasInteractionWhileActive}
        onDoubleClick={markTerminalInteractionHandled}
        onMouseDown={markTerminalInteractionHandled}
        onKeyDown={stopCanvasInteractionWhileActive}
      >
        {isRendered ? (
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
            onSessionReady={markAttached}
            onTitleChange={onTitleChange}
            onSessionError={(_, error) => {
              toastManager.add({
                title: "Canvas",
                description: error,
                type: "error",
              });
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <SquareTerminal className="size-8 text-muted-foreground" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                {isSelected
                  ? "Activate this card to open the live terminal"
                  : "Select this card to activate the live terminal"}
              </div>
              <div className="text-xs text-muted-foreground">
                {shape.props.localPath || "Attached tmux window"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

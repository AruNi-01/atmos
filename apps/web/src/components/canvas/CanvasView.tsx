"use client";

import React from "react";
import { useTheme } from "next-themes";
import { useHotkeys } from "react-hotkeys-hook";
import {
  DefaultToolbar,
  DefaultToolbarContent,
  HTMLContainer,
  PORTRAIT_BREAKPOINT,
  Tldraw,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiRow,
  TldrawUiToolbar,
  createShapeId,
  getSnapshot,
  useBreakpoint,
  useEditor,
  usePassThroughWheelEvents,
  useTldrawUiComponents,
  useValue,
  type Editor,
  type TLComponents,
  type TLEditorSnapshot,
  type TLShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import {
  Button,
  SlidingNumber,
  toastManager,
  cn,
} from "@workspace/ui";
import {
  AlertTriangle,
  ChevronsRight,
  Frame,
  Loader2,
  LoaderCircle,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  SquareTerminal,
  ArrowUpRight,
  PinOff,
} from "lucide-react";
import { useCanvasSettings } from "@/hooks/use-canvas-settings";
import { useDesktopTrafficLightsPadding } from "@/hooks/use-desktop-traffic-lights-padding";
import { canvasWsApi, codeAgentCustomApi, type CodeAgentCustomEntry } from "@/api/ws-api";
import { useAppRouter } from "@/hooks/use-app-router";
import { useFunctionSettingsStore } from "@/hooks/use-function-settings-store";
import { Terminal } from "@/components/terminal/Terminal";
import { TerminalTitleWithAgent } from "@/components/terminal/terminal-title";
import type { TerminalPaneAgent } from "@/components/terminal/types";
import { useTerminalToolbarTitle } from "@/components/terminal/use-terminal-toolbar-title";
import { AGENT_OPTIONS } from "@/components/wiki/AgentSelect";
import { useCanvasRuntime } from "./use-canvas-runtime";
import {
  createCanvasSnapshot,
  useCanvasBoard,
  type CanvasBoardDocument,
  type CanvasTldrawDocument,
  type CanvasTldrawSession,
} from "./use-canvas-board";
import { readCanvasSession, writeCanvasSession } from "@/hooks/use-ui-pref-hooks";
import { useConnectionStore } from "@/hooks/use-connection-store";
import {
  readCanvasChromePrefs,
  patchCanvasChromePrefs,
} from "@/lib/canvas-chrome-prefs";
import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  CanvasTerminalShapeSchemaUtil,
  dispatchCanvasTerminalPinStateChange,
  isCanvasTerminalShapeRecord,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";
import {
  getRestoredRenderedShapeIds,
  promoteRenderedShapeId,
  trimRenderedShapeIds,
} from "./canvas-terminal-rendering";
import { FIXED_TERMINAL_TAB_VALUE } from "@/hooks/use-terminal-store";
import { useCanvasAgentBridge } from "./use-canvas-agent-bridge";
import { CanvasAgentBridgeControls, CanvasAgentOverlay } from "./CanvasAgentOverlay";

const SESSION_SAVE_DEBOUNCE_MS = 400;
const TLDRAW_LICENSE_KEY = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

const CanvasAgentContext = React.createContext<TerminalPaneAgent[]>([]);
const CanvasTopLeftToolbarContext = React.createContext<{
  isCollapsed: boolean;
  toggle: () => void;
}>({
  isCollapsed: false,
  toggle: () => {},
});

class CanvasTerminalShapeUtil extends CanvasTerminalShapeSchemaUtil {
  component(shape: CanvasTerminalShape) {
    return <CanvasTerminalCard shape={shape} />;
  }
}

function createCanvasDocument(document: CanvasTldrawDocument | null): CanvasBoardDocument {
  return {
    schema: "canvas.v1",
    boardSlug: "default",
    tldrawDocument: document,
  };
}

function getCanvasTerminalShapes(editor: Editor) {
  return editor.getCurrentPageShapes().filter(isCanvasTerminalShapeRecord) as CanvasTerminalShape[];
}

function areShapeIdListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((shapeId, index) => shapeId === right[index]);
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
  const { workspaceId, tmuxWindowName, contextScope } = shape.props;
  const editor = useEditor();
  const router = useAppRouter();
  const terminalHostRef = React.useRef<HTMLDivElement | null>(null);
  const activeShapeId = useCanvasRuntime((state) => state.activeShapeId);
  const renderedShapeIds = useCanvasRuntime((state) => state.renderedShapeIds);
  const setActiveShapeId = useCanvasRuntime((state) => state.setActiveShapeId);
  const setRenderedShapeIds = useCanvasRuntime((state) => state.setRenderedShapeIds);
  const removeRenderedShapeId = useCanvasRuntime((state) => state.removeRenderedShapeId);
  const maxRenderedTerminals = useCanvasSettings((state) => state.maxRenderedTerminals);
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

  const handleUnpin = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      editor.deleteShapes([shape.id as TLShapeId]);
      dispatchCanvasTerminalPinStateChange(shape.props.pinKey, false);
      removeRenderedShapeId(shape.id);
      if (activeShapeId === shape.id) {
        setActiveShapeId(null);
      }
    },
    [activeShapeId, editor, removeRenderedShapeId, setActiveShapeId, shape.id, shape.props.pinKey],
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
        <div className="flex items-center gap-2">
          {shape.props.isPinned && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleUnpin}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Unpin
              <PinOff className="size-3" />
            </button>
          )}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleRevealSource}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Source
            <ArrowUpRight className="size-3" />
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

/**
 * Bridges next-themes' Atmos theme into tldraw's user preferences.
 *
 * - Atmos is the source of truth when the app theme *changes*; we do not
 *   overwrite tldraw's restored localStorage prefs on editor mount.
 * - Users can still pick a different theme from tldraw's own menu; that
 *   choice persists (tldraw writes it to `TLDRAW_USER_DATA_v3`) until Atmos
 *   theme changes again.
 */
function CanvasThemeBridge() {
  const editor = useEditor();
  const { theme } = useTheme();
  const prevThemeRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (!editor || !theme) return;

    const prevTheme = prevThemeRef.current;
    prevThemeRef.current = theme;

    // Let tldraw restore user prefs from localStorage on first mount.
    if (prevTheme === undefined) return;
    if (prevTheme === theme) return;

    const colorScheme: "light" | "dark" | "system" =
      theme === "dark" ? "dark" : theme === "light" ? "light" : "system";
    editor.user.updateUserPreferences({ colorScheme });
  }, [editor, theme]);

  return null;
}

function CanvasCollapsibleMenuPanel({
  isCollapsed,
  children,
}: {
  isCollapsed: boolean;
  children: React.ReactNode;
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setContentWidth(element.scrollWidth);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [children]);

  return (
    <div
      aria-hidden={isCollapsed}
      style={{
        width: isCollapsed ? 0 : `${contentWidth}px`,
      }}
      className={cn(
        "origin-left overflow-hidden transition-[width,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isCollapsed ? "pointer-events-none -mr-2" : "mr-0",
      )}
    >
      <div
        ref={contentRef}
        className={cn(
          "origin-left transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
          isCollapsed
            ? "translate-x-3 scale-x-95 opacity-0 blur-[1px]"
            : "translate-x-0 scale-x-100 opacity-100 blur-0",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function CanvasMenuPanel() {
  const { isCollapsed } = React.useContext(CanvasTopLeftToolbarContext);
  const breakpoint = useBreakpoint();
  const ref = React.useRef<HTMLDivElement | null>(null);
  usePassThroughWheelEvents(ref);

  const { MainMenu, QuickActions, ActionsMenu, PageMenu } = useTldrawUiComponents();
  const editor = useEditor();
  const isSinglePageMode = useValue("isSinglePageMode", () => editor.options.maxPages <= 1, [editor]);

  const showQuickActions =
    editor.options.actionShortcutsLocation === "menu"
      ? true
      : editor.options.actionShortcutsLocation === "toolbar"
        ? false
        : breakpoint >= PORTRAIT_BREAKPOINT.TABLET;

  if (!MainMenu && !PageMenu && !showQuickActions) {
    return null;
  }

  return (
    <div ref={ref} className="tlui-menu-zone pointer-events-auto">
      <TldrawUiToolbar label="Canvas menu" className="tlui-buttons__horizontal">
        <CanvasCollapsibleMenuPanel isCollapsed={isCollapsed}>
          <TldrawUiRow>
            {MainMenu && <MainMenu />}
            {PageMenu && !isSinglePageMode && <PageMenu />}
            {showQuickActions ? (
              <>
                {QuickActions && <QuickActions />}
                {ActionsMenu && <ActionsMenu />}
              </>
            ) : null}
          </TldrawUiRow>
        </CanvasCollapsibleMenuPanel>
        <CanvasTopLeftToolbarToggle />
      </TldrawUiToolbar>
    </div>
  );
}

function CanvasTopLeftToolbarToggle() {
  const { isCollapsed, toggle } = React.useContext(CanvasTopLeftToolbarContext);
  const label = isCollapsed ? "Expand toolbar" : "Collapse toolbar";

  return (
    <TldrawUiButton
      type="icon"
      aria-label={label}
      tooltip={label}
      onClick={toggle}
      className={cn(
        "pointer-events-auto shrink-0 bg-transparent transition-transform duration-300 ease-out",
        "hover:bg-transparent focus:bg-transparent active:bg-transparent",
      )}
    >
      <TldrawUiButtonIcon
        icon={
          <CanvasToolbarIconFrame>
            <PanelLeftClose
              className={cn(
                "absolute left-1/2 top-1/2 size-[14px] -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out",
                isCollapsed ? "-rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100",
              )}
              strokeWidth={1.8}
            />
            <PanelLeftOpen
              className={cn(
                "absolute left-1/2 top-1/2 size-[14px] -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out",
                isCollapsed ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-75 opacity-0",
              )}
              strokeWidth={1.8}
            />
          </CanvasToolbarIconFrame>
        }
      />
    </TldrawUiButton>
  );
}

function CanvasToolbarIconFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("relative flex size-[14px] items-center justify-center", className)}>
      {children}
    </span>
  );
}

function CanvasBottomToolbarPeek() {
  const [isDocked, setIsDocked] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(true);
  const [shouldRenderToolbar, setShouldRenderToolbar] = React.useState(true);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const openFrameRef = React.useRef<number | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (openFrameRef.current != null) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
  }, []);

  /**
   * Schedule `setIsOpen(true)` AFTER the browser has had a chance to paint
   * the initial `opacity-0` state of a freshly-mounted toolbar. A single rAF
   * fires before paint commits, so React would batch mount + open into the
   * same frame and the browser would interpolate from "nothing" to fully
   * visible — i.e. no fade-in at all. Two stacked rAFs guarantee the
   * mount frame is painted first, then the next frame flips opacity to
   * 1, giving `transition-opacity` a real start value to animate from.
   */
  const scheduleOpenAfterMount = React.useCallback(() => {
    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = requestAnimationFrame(() => {
        setIsOpen(true);
        openFrameRef.current = null;
      });
    });
  }, []);

  const openToolbar = React.useCallback(() => {
    cancelClose();
    if (shouldRenderToolbar) {
      setIsOpen(true);
      return;
    }
    setShouldRenderToolbar(true);
    scheduleOpenAfterMount();
  }, [cancelClose, scheduleOpenAfterMount, shouldRenderToolbar]);

  const scheduleClose = React.useCallback(() => {
    if (!isDocked) {
      return;
    }
    cancelClose();
    setIsOpen(false);
    closeTimeoutRef.current = setTimeout(() => {
      setShouldRenderToolbar(false);
      closeTimeoutRef.current = null;
    }, 220);
  }, [cancelClose, isDocked]);

  const handleToggleDocked = React.useCallback(() => {
    cancelClose();
    setIsDocked((prev) => {
      const next = !prev;
      if (next) {
        setIsOpen(false);
        closeTimeoutRef.current = setTimeout(() => {
          setShouldRenderToolbar(false);
          closeTimeoutRef.current = null;
        }, 220);
      } else {
        setShouldRenderToolbar(true);
        scheduleOpenAfterMount();
      }
      return next;
    });
  }, [cancelClose, scheduleOpenAfterMount]);

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      if (openFrameRef.current != null) {
        cancelAnimationFrame(openFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="pointer-events-auto flex justify-center pb-3">
      <div className="relative flex items-end justify-center">
        {shouldRenderToolbar && (
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            aria-hidden={isDocked && !isOpen}
            className={cn(
              "absolute bottom-full left-1/2 z-10 w-max max-w-none -translate-x-1/2",
              isDocked && !isOpen
                ? "pointer-events-none opacity-0 transition-opacity duration-220 ease-in"
                : "pointer-events-auto opacity-100 transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
            )}
          >
            <div className="absolute left-1/2 top-full h-4 w-24 -translate-x-1/2" />
            <DefaultToolbar
              minItems={8}
              minSizePx={470}
              maxItems={13}
              maxSizePx={980}
            >
                  <DefaultToolbarContent />
                  <TldrawUiButton
                    type="tool"
                    aria-label={isDocked ? "Expand bottom toolbar" : "Collapse bottom toolbar"}
                    tooltip={isDocked ? "Expand toolbar" : "Collapse toolbar"}
                    onClick={handleToggleDocked}
                    className="canvas-bottom-toolbar-toggle"
                  >
                    <TldrawUiButtonIcon
                      icon={
                        <span className="relative flex size-[18px] items-center justify-center">
                          {isDocked ? (
                            <PanelBottomOpen
                              className="absolute left-1/2 top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2"
                              strokeWidth={1.8}
                            />
                          ) : (
                            <PanelBottomClose
                              className="absolute left-1/2 top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2"
                              strokeWidth={1.8}
                            />
                          )}
                        </span>
                      }
                    />
                  </TldrawUiButton>
            </DefaultToolbar>
          </div>
        )}

        <div
          onMouseEnter={() => {
            if (isDocked) {
              openToolbar();
            }
          }}
          className={cn(
            "h-1.5 w-40 rounded-full bg-foreground/20 shadow-[0_1px_8px_rgba(0,0,0,0.18)]",
            isDocked && !isOpen
              ? "transition-opacity duration-220 ease-in"
              : "transition-opacity duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]",
            isDocked && !isOpen
              ? "pointer-events-auto opacity-100"
              : isDocked && isOpen
              ? "pointer-events-none opacity-0"
              : "pointer-events-none opacity-0",
          )}
        />
      </div>
      <style jsx global>{`
        .tlui-main-toolbar__tools .canvas-bottom-toolbar-toggle[data-toolbar-visible="false"] {
          display: flex !important;
        }

        .tlui-main-toolbar__overflow-content .canvas-bottom-toolbar-toggle {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

/**
 * Stable null-renderer for the tldraw `StylePanel` slot. Defining it at module
 * scope (rather than inline inside `useMemo`) keeps the component's identity
 * constant across renders, so toggling unrelated state on `CanvasView` doesn't
 * cause tldraw to unmount/remount neighbouring slots like SharePanel.
 */
const NullStylePanelSlot = () => null;

function CanvasAnimatedToolbarGroup({
  isCollapsed,
  children,
}: {
  isCollapsed: boolean;
  children: React.ReactNode;
}) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setContentWidth(element.scrollWidth);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [children]);

  return (
    <div
      aria-hidden={isCollapsed}
      style={{ width: isCollapsed ? 0 : `${contentWidth}px` }}
      className={cn(
        "overflow-hidden",
        isCollapsed
          ? "pointer-events-none transition-[width,opacity] duration-260 ease-in"
          : "pointer-events-auto transition-[width,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
      )}
    >
      <div
        ref={contentRef}
        className={cn(
          "flex items-center gap-2 whitespace-nowrap will-change-transform",
          isCollapsed
            ? "translate-x-2 opacity-0 transition-[opacity,transform] duration-180 ease-in"
            : "translate-x-0 opacity-100 transition-[opacity,transform] duration-420 ease-[cubic-bezier(0.22,1,0.36,1)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export const CanvasView: React.FC = () => {
  const canvasChromePrefs = React.useMemo(() => readCanvasChromePrefs(), []);
  const { board, document, isLoading, isSaving, error, loadBoard } = useCanvasBoard();
  const activeInstanceId = useConnectionStore((state) => state.activeInstanceId);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [isManualSaving, setIsManualSaving] = React.useState(false);
  const setActiveShapeId = useCanvasRuntime((state) => state.setActiveShapeId);
  const activeShapeId = useCanvasRuntime((state) => state.activeShapeId);
  const renderedShapeIds = useCanvasRuntime((state) => state.renderedShapeIds);
  const setRenderedShapeIds = useCanvasRuntime((state) => state.setRenderedShapeIds);
  const resetRuntime = useCanvasRuntime((state) => state.reset);
  const {
    autoSaveInterval,
    maxRenderedTerminals,
    loaded: canvasSettingsLoaded,
    loadSettings: loadCanvasSettings,
  } = useCanvasSettings();
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
  const editorRef = React.useRef<Editor | null>(null);
  const [editorReady, setEditorReady] = React.useState(false);
  // APP-015: Canvas terminal-agent bridge. The hook returns a stable state
  // object whose internal bus/presence references survive every CanvasView
  // re-render, so it is safe to call before `editorReady` and pass the
  // editor in via `setEditor` below.
  const [agentBridgeEditor, setAgentBridgeEditor] = React.useState<Editor | null>(null);
  const canvasAgentBridge = useCanvasAgentBridge(agentBridgeEditor);
  const [agentCustomSettings, setAgentCustomSettings] = React.useState<Record<string, { cmd?: string; flags?: string; enabled?: boolean }>>({});
  const [customAgents, setCustomAgents] = React.useState<CodeAgentCustomEntry[]>([]);
  const [agentSettingsLoading, setAgentSettingsLoading] = React.useState(false);
  /**
   * When `false`, tldraw's built-in StylePanel is force-hidden via
   * `StylePanel: () => null`. When `true`, we omit the override so tldraw owns
   * visibility (it auto-hides on no-selection / certain tools, etc.).
   */
  const [isStylePanelEnabled, setIsStylePanelEnabled] = React.useState(
    () => canvasChromePrefs.isStylePanelEnabled,
  );
  /**
   * Controls the built-in tldraw toolbar cluster in the top-left corner
   * (main menu, page menu, undo / redo / overflow actions). When collapsed we
   * hide the default cluster and leave only an expand button in its place.
   */
  const [isTopLeftToolbarCollapsed, setIsTopLeftToolbarCollapsed] = React.useState(
    () => canvasChromePrefs.isTopLeftToolbarCollapsed,
  );
  /**
   * Master collapse for the entire injected SharePanel toolbar — when true we
   * hide every action (Create Frame / Save / Style toggle) and only keep the
   * lone collapse-toggle button so the canvas surface stays unobstructed.
   */
  const [isToolbarCollapsed, setIsToolbarCollapsed] = React.useState(
    () => canvasChromePrefs.isToolbarCollapsed,
  );

  React.useEffect(() => {
    patchCanvasChromePrefs({
      isStylePanelEnabled,
      isTopLeftToolbarCollapsed,
      isToolbarCollapsed,
    });
  }, [isStylePanelEnabled, isTopLeftToolbarCollapsed, isToolbarCollapsed]);
  const documentSaveInFlightRef = React.useRef(false);
  const sessionSaveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSessionRef = React.useRef<CanvasTldrawSession | null>(null);
  const sessionDirtyRef = React.useRef(false);
  const autoSaveIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const hydratedRenderedBoardKeyRef = React.useRef<string | null>(null);
  const spawnIndexRef = React.useRef(0);
  const sharePanelRef = React.useRef<React.ReactNode>(null);
  const shapeUtils = React.useMemo(() => [CanvasTerminalShapeUtil], []);
  const topLeftToolbarContextValue = React.useMemo(
    () => ({
      isCollapsed: isTopLeftToolbarCollapsed,
      toggle: () => setIsTopLeftToolbarCollapsed((prev) => !prev),
    }),
    [isTopLeftToolbarCollapsed],
  );
  /**
   * Stable component identity for tldraw's SharePanel slot. tldraw re-renders
   * whenever the `components` prop changes; if the slot function were a fresh
   * arrow on every memo recompute, React would treat it as a different
   * component type and unmount/remount the entire share-panel subtree. That
   * remount resets `CanvasAnimatedToolbarGroup`'s measured width back to 0,
   * which produces a one-frame collapse → expand flicker every time an
   * unrelated piece of state (e.g. the style-panel toggle) flips. Reading
   * the current panel JSX from a ref keeps both the slot's identity and the
   * subtree stable across CanvasView re-renders.
   */
  const SharePanelSlot = React.useCallback(() => <>{sharePanelRef.current}</>, []);
  const tldrawComponents = React.useMemo<TLComponents>(
    () => ({
      MenuPanel: CanvasMenuPanel,
      Toolbar: CanvasBottomToolbarPeek,
      SharePanel: SharePanelSlot,
      // Force-hide tldraw's built-in StylePanel until the user toggles it on
      // from our SharePanel. When enabled, we omit the override entirely so
      // tldraw uses its default component (which knows when to auto-hide).
      ...(isStylePanelEnabled ? {} : { StylePanel: NullStylePanelSlot }),
    }),
    [SharePanelSlot, isStylePanelEnabled],
  );

  const initialSnapshot = React.useMemo(
    () => createCanvasSnapshot(document?.tldrawDocument ?? null, readCanvasSession(board?.guid)),
    [activeInstanceId, board?.guid, document?.tldrawDocument],
  );

  const visibleBuiltInAgents = React.useMemo(
    () => AGENT_OPTIONS.filter((agent) => (agentCustomSettings[agent.id]?.enabled ?? true)),
    [agentCustomSettings]
  );
  const visibleCustomAgents = React.useMemo(
    () => customAgents.filter((agent) => agent.enabled !== false),
    [customAgents]
  );
  const configuredAgents = React.useMemo(
    () => [
      ...visibleBuiltInAgents.map((agent) => {
        const custom = agentCustomSettings[agent.id];
        const cmd = custom?.cmd?.trim() || agent.cmd;
        return {
          id: agent.id,
          label: agent.label,
          command: cmd,
          iconType: "built-in",
          pipeCommand: "useEcho" in agent && agent.useEcho ? cmd : undefined,
        } satisfies TerminalPaneAgent;
      }),
      ...visibleCustomAgents.map((agent) => ({
        id: agent.id,
        label: agent.label,
        command: agent.cmd,
        iconType: "custom" as const,
      })),
    ],
    [visibleBuiltInAgents, visibleCustomAgents, agentCustomSettings],
  );

  // Load agent custom settings and custom agents
  React.useEffect(() => {
    setAgentSettingsLoading(true);
    Promise.all([
      useFunctionSettingsStore.getState().load(),
      codeAgentCustomApi.get(),
    ]).then(([settings, customData]) => {
      const saved = (settings as Record<string, unknown>)?.agent_cli as Record<string, unknown> | undefined;
      const allAgents = Array.isArray(customData?.agents) ? customData.agents : [];
      const builtInEntries = allAgents.filter((agent: CodeAgentCustomEntry) =>
        AGENT_OPTIONS.some((option) => option.id === agent.id)
      );
      const builtInSettings = Object.fromEntries(
        builtInEntries.map((agent: CodeAgentCustomEntry) => [agent.id, { cmd: agent.cmd, flags: agent.flags, enabled: agent.enabled !== false }])
      );
      setAgentCustomSettings(builtInSettings);
      setCustomAgents(allAgents.filter((a: CodeAgentCustomEntry) =>
        !AGENT_OPTIONS.some((option) => option.id === a.id) && a.label && a.cmd
      ));
    }).catch(() => {
      // Silently fail - agents will just use defaults
    }).finally(() => {
      setAgentSettingsLoading(false);
    });
  }, []);

  React.useEffect(() => {
    void loadCanvasSettings();
  }, [loadCanvasSettings]);

  React.useEffect(() => {
    pendingSessionRef.current = readCanvasSession(board?.guid);
    if (board?.updated_at && !lastSavedAt) {
      setLastSavedAt(new Date(board.updated_at));
    }
  }, [board?.guid, board?.updated_at, lastSavedAt]);

  // Auto-save with configurable interval
  React.useEffect(() => {
    if (!editorReady) return;

    autoSaveIntervalRef.current = setInterval(() => {
      const editor = editorRef.current;
      if (!editor) return;

      const snapshot = getSnapshot(editor.store) as TLEditorSnapshot;

      // Directly save without debounce for auto-save
      void (async () => {
        if (documentSaveInFlightRef.current) {
          return;
        }

        documentSaveInFlightRef.current = true;
        try {
          const documentJson = JSON.stringify(createCanvasDocument(snapshot.document));
          await canvasWsApi.updateDefaultBoard(documentJson);
          setLastSavedAt(new Date());
        } catch (err) {
          // Auto-save errors are logged silently
        } finally {
          documentSaveInFlightRef.current = false;
        }
      })();
    }, autoSaveInterval * 1000);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    };
  }, [editorReady, autoSaveInterval]);

  // Manual save function
  const handleManualSave = React.useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    if (documentSaveInFlightRef.current) {
      return;
    }

    setIsManualSaving(true);
    documentSaveInFlightRef.current = true;

    try {
      const snapshot = getSnapshot(editor.store) as TLEditorSnapshot;
      const documentJson = JSON.stringify(createCanvasDocument(snapshot.document));
      await canvasWsApi.updateDefaultBoard(documentJson);
      setLastSavedAt(new Date());
      toastManager.add({
        title: "Canvas",
        description: "Saved successfully",
        type: "success",
      });
    } catch (err) {
      toastManager.add({
        title: "Canvas",
        description: "Failed to save canvas",
        type: "error",
      });
    } finally {
      setIsManualSaving(false);
      documentSaveInFlightRef.current = false;
    }
  }, []);

  // Keyboard shortcut for manual save (Cmd+S / Ctrl+S)
  useHotkeys('cmd+s, ctrl+s', (e) => {
    e.preventDefault();
    void handleManualSave();
  }, {
    enableOnFormTags: true,
    enableOnContentEditable: true,
  });

  React.useEffect(() => {
    resetRuntime();
    hydratedRenderedBoardKeyRef.current = null;
  }, [board?.guid, resetRuntime]);

  const scheduleSessionSave = React.useCallback(
    (nextSession: CanvasTldrawSession) => {
      pendingSessionRef.current = nextSession;
      sessionDirtyRef.current = true;
      if (sessionSaveTimeoutRef.current) {
        clearTimeout(sessionSaveTimeoutRef.current);
      }
      sessionSaveTimeoutRef.current = setTimeout(() => {
        sessionSaveTimeoutRef.current = null;
        if (sessionDirtyRef.current && pendingSessionRef.current) {
          writeCanvasSession(pendingSessionRef.current, board?.guid);
          sessionDirtyRef.current = false;
        }
      }, SESSION_SAVE_DEBOUNCE_MS);
    },
    [board?.guid],
  );

  React.useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    if (!editor) return;

    const cleanupSelection = editor.store.listen(() => {
      const runtime = useCanvasRuntime.getState();
      const shapes = getCanvasTerminalShapes(editor);
      const shapeIds = new Set(shapes.map((shape) => shape.id));
      const nextRenderedShapeIds = runtime.renderedShapeIds.filter((shapeId) => shapeIds.has(shapeId));
      if (!areShapeIdListsEqual(nextRenderedShapeIds, runtime.renderedShapeIds)) {
        runtime.setRenderedShapeIds(nextRenderedShapeIds);
      }
      if (runtime.activeShapeId && !shapeIds.has(runtime.activeShapeId)) {
        runtime.setActiveShapeId(null);
      }

      const nextSelectedShapeIds = editor.getSelectedShapeIds() as TLShapeId[];
      if (
        nextSelectedShapeIds.length === 1 &&
        nextSelectedShapeIds[0] !== runtime.activeShapeId
      ) {
        setActiveShapeId(nextSelectedShapeIds[0]);
      }
    });

    // Keep session listener for local storage
    const cleanupSession = editor.store.listen(
      () => {
        const snapshot = getSnapshot(editor.store) as TLEditorSnapshot;
        scheduleSessionSave(snapshot.session);
      },
      { scope: "session" },
    );

    return () => {
      cleanupSelection();
      cleanupSession();
    };
  }, [editorReady, scheduleSessionSave, setActiveShapeId]);

  React.useEffect(() => {
    if (!editorReady || !canvasSettingsLoaded) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const boardKey = board?.guid ?? "default";
    const hydrationKey = `${boardKey}:${maxRenderedTerminals}`;
    if (hydratedRenderedBoardKeyRef.current === hydrationKey) {
      return;
    }

    const restoredShapeIds = getRestoredRenderedShapeIds(
      getCanvasTerminalShapes(editor),
      maxRenderedTerminals,
    );
    hydratedRenderedBoardKeyRef.current = hydrationKey;
    setRenderedShapeIds(restoredShapeIds);
  }, [board?.guid, canvasSettingsLoaded, editorReady, maxRenderedTerminals, setRenderedShapeIds]);

  React.useEffect(() => {
    if (!editorReady) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const nextRenderedShapeIds = trimRenderedShapeIds(
      getCanvasTerminalShapes(editor),
      renderedShapeIds,
      maxRenderedTerminals,
    );
    if (areShapeIdListsEqual(nextRenderedShapeIds, renderedShapeIds)) {
      return;
    }
    setRenderedShapeIds(nextRenderedShapeIds);
    if (activeShapeId && !nextRenderedShapeIds.includes(activeShapeId)) {
      setActiveShapeId(null);
    }
  }, [
    activeShapeId,
    editorReady,
    maxRenderedTerminals,
    renderedShapeIds,
    setActiveShapeId,
    setRenderedShapeIds,
  ]);

  // Note: a previous `placeTerminalShape` callback was removed together with
  // the Import Terminal modal. Pinning a terminal onto the canvas now flows
  // through `canvasApi.updateDefaultBoard` in `TerminalGrid.tsx`, which builds
  // the snapshot on the API side and reloads the canvas.

  const handleCreateFrame = React.useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const viewportCenter = editor.getViewportPageBounds().center;
    const frameId = createShapeId();
    const spawnOffset = (spawnIndexRef.current % 6) * 28;
    spawnIndexRef.current += 1;

    editor.createShape({
      id: frameId,
      type: "frame",
      x: viewportCenter.x - 320 + spawnOffset,
      y: viewportCenter.y - 220 + spawnOffset,
      props: {
        w: 640,
        h: 440,
        name: "Frame",
      },
    });
    editor.select(frameId);
    requestAnimationFrame(() => {
      editor.setEditingShape(frameId);
    });
    setActiveShapeId(null);
  }, [setActiveShapeId]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <AlertTriangle className="size-12 text-warning" />
        <div>
          <div className="text-base font-semibold text-foreground">Failed to load Canvas</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
        <Button variant="outline" onClick={() => void loadBoard()} className="cursor-pointer">
          Retry
        </Button>
      </div>
    );
  }

  /**
   * SharePanel is tldraw's official slot for app-level controls in the top-right
   * area next to the style panel. Putting our buttons there avoids fighting
   * with tldraw's default top-left main-menu / page-menu UI and keeps the
   * canvas's own UI (toolbar, style panel, minimap, etc.) fully intact.
   *
   * tldraw's `components` prop must be stable across renders, but our share
   * panel needs to reflect ever-changing state (selected pane, modal open,
   * save status, …). We solve this by storing the *current* render output
   * in a ref and exposing a stable wrapper component to tldraw — the wrapper
   * simply re-evaluates the ref's value when rendered.
   */
  /**
   * Mirror of tldraw's `.tlui-menu-zone` (top-left dock) for the top-right:
   * flush against the top + right viewport edges, darker `--tl-color-low`
   * surface, only the inward (bottom-left) corner rounded, with a 2px gap
   * along the inward edges drawn in `--tl-color-background` so the dock
   * reads as cleanly carved out of the corner — same recipe as the menu
   * zone, just mirrored.
   */
  const sharePanelSurfaceClass = cn(
    "bg-[var(--tl-color-low)]",
    "rounded-bl-[var(--tl-radius-4)]",
    "border-l-2 border-b-2 border-[var(--tl-color-background)]",
  );

  /**
   * Common style for icon buttons inside the share panel — flat, tldraw-like.
   * Transparent base, subtle hover background, neutral text token. Sized to
   * sit one notch smaller than tldraw's native main-toolbar buttons so the
   * dock reads as a secondary, app-level chrome rather than a primary tool.
   */
  const sharePanelIconButtonClass = cn(
    "size-8 rounded-md border-0 bg-transparent text-muted-foreground shadow-none",
    "hover:bg-foreground/10 hover:text-foreground",
    "data-[state=open]:bg-foreground/10",
  );

  const sharePanelContent = (
    <div className="pointer-events-auto">
      <div className={cn("flex items-center px-0.5 py-1", sharePanelSurfaceClass)}>
        {/*
          Master collapse — hides every other action button (Create Frame /
          Import / Refresh / Save / Style) so users can reclaim the canvas.
          Lives inside the panel so it shares the same surface as the rest
          of the controls; when collapsed the panel naturally shrinks to
          just this button.
        */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsToolbarCollapsed((prev) => !prev)}
          aria-pressed={isToolbarCollapsed}
          aria-label={isToolbarCollapsed ? "Expand canvas toolbar" : "Collapse canvas toolbar"}
          title={isToolbarCollapsed ? "Expand toolbar" : "Collapse toolbar"}
          className={sharePanelIconButtonClass}
        >
          <ChevronsRight
            className={cn(
              "size-3.5 transition-transform duration-300 ease-out",
              isToolbarCollapsed && "rotate-180",
            )}
          />
        </Button>
        <CanvasAnimatedToolbarGroup isCollapsed={isToolbarCollapsed}>
          <div className="ml-0.5 flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreateFrame}
              className={cn(
                "h-8 gap-1 rounded-md border-0 bg-transparent px-2 text-muted-foreground shadow-none",
                "hover:bg-foreground/10 hover:text-foreground",
              )}
              title="Create an empty frame"
            >
              <Frame className="size-3.5" />
              <span className="text-xs font-medium">Frame</span>
            </Button>
            {/*
              Import-terminal modal & "Refresh active sessions" button were
              removed: picking a terminal from a context-less list was hard
              to reason about (you can't tell what each terminal is doing
              from its name alone). The pin-to-canvas flow on the Terminal
              tab itself remains the supported way to bring a pane onto the
              canvas, since at pin time the user can see the live pane.
            */}
            <CanvasAgentBridgeControls
              bridge={canvasAgentBridge}
              iconButtonClass={sharePanelIconButtonClass}
              onJump={() => {
                const editor = editorRef.current;
                if (!editor) return;
                canvasAgentBridge.activity.jumpToLast(editor);
              }}
            />
            <Button
              variant="ghost"
              onClick={() => void handleManualSave()}
              disabled={isManualSaving || documentSaveInFlightRef.current}
              className={cn(
                "group h-8 w-[132px] rounded-md border-0 bg-transparent px-2 text-xs text-muted-foreground shadow-none",
                "hover:bg-foreground/10 hover:text-foreground",
              )}
            >
        {isManualSaving || isSaving ? (
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-3 animate-spin" />
            Saving…
          </span>
        ) : error ? (
          "Save failed"
        ) : (
          /*
            Two stacked labels — "Saved · HH:MM:SS" and "Save" — cross-fade
            with a vertical slide on hover. Both share an absolute layer so
            the wrapper holds a stable height while they animate.
          */
          <span className="relative flex h-4 w-full items-center justify-center overflow-hidden">
            <span className="absolute inset-0 flex items-center justify-center gap-1 transition-all duration-200 ease-out group-hover:-translate-y-2 group-hover:opacity-0">
              <span>Saved</span>
              {(() => {
                const savedDate =
                  lastSavedAt ??
                  (board?.updated_at ? new Date(board.updated_at) : null);
                if (!savedDate) return null;
                return (
                  <>
                    <span>·</span>
                    {/*
                      Animated time using SlidingNumber — each digit slides
                      between values when the timestamp updates after a save.
                    */}
                    <span className="flex items-center tabular-nums">
                      <SlidingNumber value={savedDate.getHours()} padStart />
                      <span>:</span>
                      <SlidingNumber value={savedDate.getMinutes()} padStart />
                      <span>:</span>
                      <SlidingNumber value={savedDate.getSeconds()} padStart />
                    </span>
                  </>
                );
              })()}
            </span>
            <span className="absolute inset-0 flex translate-y-2 items-center justify-center opacity-0 transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100">
              Save
            </span>
          </span>
        )}
      </Button>
            {/*
              StylePanel toggle (sits where the old "collapse" minimize button was).
              OFF: tldraw's StylePanel is fully suppressed via `StylePanel: () => null`.
              ON:  we hand control back to tldraw, which still hides the panel for
                   tools/selections that don't expose styles — that's intentional.
            */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsStylePanelEnabled((prev) => !prev)}
              aria-pressed={isStylePanelEnabled}
              className={cn(
                sharePanelIconButtonClass,
                isStylePanelEnabled && "bg-foreground/10 text-foreground hover:bg-foreground/15",
              )}
              title={isStylePanelEnabled ? "Hide style panel" : "Show style panel"}
              aria-label={isStylePanelEnabled ? "Hide style panel" : "Show style panel"}
            >
              <Palette
                className={cn(
                  "size-3.5 transition-colors",
                  isStylePanelEnabled &&
                    "text-blue-400 [&>circle:nth-of-type(1)]:fill-rose-500 [&>circle:nth-of-type(1)]:stroke-rose-500 [&>circle:nth-of-type(2)]:fill-amber-400 [&>circle:nth-of-type(2)]:stroke-amber-400 [&>circle:nth-of-type(3)]:fill-emerald-500 [&>circle:nth-of-type(3)]:stroke-emerald-500 [&>circle:nth-of-type(4)]:fill-sky-500 [&>circle:nth-of-type(4)]:stroke-sky-500",
                )}
              />
            </Button>
          </div>
        </CanvasAnimatedToolbarGroup>
      </div>
    </div>
  );

  sharePanelRef.current = sharePanelContent;

  return (
    <div className={cn(
      "tldraw-wrapper relative h-full w-full overflow-hidden bg-background",
      needsTrafficLightsPadding && "pt-[28px]"
    )}>
      <CanvasAgentContext.Provider value={configuredAgents}>
        <CanvasTopLeftToolbarContext.Provider value={topLeftToolbarContextValue}>
          <Tldraw
            key={`${board?.guid || "canvas"}:${activeInstanceId}`}
            licenseKey={TLDRAW_LICENSE_KEY}
            snapshot={initialSnapshot ?? undefined}
            shapeUtils={shapeUtils}
            components={tldrawComponents}
            onMount={(nextEditor) => {
              editorRef.current = nextEditor;
              setEditorReady(true);
              setAgentBridgeEditor(nextEditor);
            }}
          >
            <CanvasThemeBridge />
            <CanvasAgentOverlay bridge={canvasAgentBridge} />
          </Tldraw>
        </CanvasTopLeftToolbarContext.Provider>
      </CanvasAgentContext.Provider>
    </div>
  );
};

"use client";

import React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  Tldraw,
  createShapeId,
  getSnapshot,
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
  Palette,
} from "lucide-react";
import { useCanvasSettings } from "@/hooks/use-canvas-settings";
import { useDesktopTrafficLightsPadding } from "@/hooks/use-desktop-traffic-lights-padding";
import { canvasWsApi, codeAgentCustomApi, type CodeAgentCustomEntry } from "@/api/ws-api";
import { useFunctionSettingsStore } from "@/hooks/use-function-settings-store";
import type { TerminalPaneAgent } from "@/components/terminal/types";
import { AGENT_OPTIONS } from "@/components/wiki/AgentSelect";
import { useCanvasRuntime } from "./use-canvas-runtime";
import {
  createCanvasSnapshot,
  resolveCanvasSessionForLoad,
  useCanvasBoard,
  type CanvasBoardDocument,
  type CanvasTldrawDocument,
  type CanvasTldrawSession,
} from "./use-canvas-board";
import {
  readCanvasSession,
  consumeLastPinnedTerminal,
  writeCanvasSession,
} from "@/hooks/use-ui-pref-hooks";
import { useAtmosComputerStore } from "@/lib/atmos-computer-store";
import { instanceIdFromRelaySelection } from "@/lib/connection-instance";
import { useCanvasChromePrefs } from "@/hooks/use-canvas-chrome-prefs";
import {
  getCanvasTerminalShapes,
} from "./canvas-terminal-shape";
import {
  getRestoredRenderedShapeIds,
  trimRenderedShapeIds,
} from "./canvas-terminal-rendering";
import { useCanvasAgentBridge } from "./use-canvas-agent-bridge";
import { CanvasAgentBridgeControls, CanvasAgentOverlay } from "./CanvasAgentOverlay";
import { CanvasAgentOnCanvas } from "./CanvasAgentOnCanvas";
import { CanvasAgentIsland } from "./CanvasAgentIsland";
import { CanvasTerminalFocusPulse } from "./CanvasTerminalFocusPulse";
import { CanvasShapeCopyOverlay } from "./CanvasShapeCopyOverlay";
import {
  CanvasTerminalRefProvider,
} from "./canvas-terminal-ref-context";
import {
  findPinnedTerminalShape,
  focusCanvasTerminalShape,
} from "./canvas-terminal-focus";
import { CanvasAgentCrashBoundary } from "./CanvasAgentCrashBoundary";
import { CanvasAgentCrashProvider } from "./canvas-agent-crash-context";
import { ensureLocalAppConnectionBootstrap } from "@/lib/app-connection-bootstrap";
import { isHostedAtmosOrigin } from "@/lib/desktop-runtime";
import {
  fitCanvasEditorToPageContent,
  hasTrustedSessionViewport,
  loadCanvasSessionIntoEditor,
  recoverCanvasViewportIfNeeded,
  sanitizeCanvasSessionForPersist,
} from "./canvas-viewport";
import {
  areShapeIdListsEqual,
  CanvasAgentContext,
  CanvasTerminalShapeUtil,
} from "./CanvasTerminalCard";
import {
  CanvasAnimatedToolbarGroup,
  CanvasBottomToolbarPeek,
  CanvasMenuPanel,
  CanvasThemeBridge,
  CanvasTopChromePaddingContext,
  CanvasTopLeftToolbarContext,
  NullStylePanelSlot,
} from "./CanvasToolbarChrome";

const SESSION_SAVE_DEBOUNCE_MS = 400;
const TLDRAW_LICENSE_KEY = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

function createCanvasDocument(document: CanvasTldrawDocument | null): CanvasBoardDocument {
  return {
    schema: "canvas.v1",
    boardSlug: "default",
    tldrawDocument: document,
  };
}

export const CanvasView: React.FC = () => {
  const {
    isStylePanelEnabled,
    isTopLeftToolbarCollapsed,
    isToolbarCollapsed,
    toggleIsStylePanelEnabled,
    toggleIsTopLeftToolbarCollapsed,
    toggleIsToolbarCollapsed,
  } = useCanvasChromePrefs();
  const { board, document, isLoading, isSaving, error, loadBoard } = useCanvasBoard();
  const canvasPrefsInstanceId = useAtmosComputerStore((state) =>
    instanceIdFromRelaySelection(state.connectionMode, state.selectedServerId),
  );
  const [connectionBootstrapReady, setConnectionBootstrapReady] = React.useState(
    () => typeof window === "undefined" || isHostedAtmosOrigin(),
  );
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [isManualSaving, setIsManualSaving] = React.useState(false);
  const setActiveShapeId = useCanvasRuntime((state) => state.setActiveShapeId);
  const activeShapeId = useCanvasRuntime((state) => state.activeShapeId);
  const renderedShapeIds = useCanvasRuntime((state) => state.renderedShapeIds);
  const setRenderedShapeIds = useCanvasRuntime((state) => state.setRenderedShapeIds);
  const setFocusPulseShapeId = useCanvasRuntime((state) => state.setFocusPulseShapeId);
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
  const [tldrawRemountKey, setTldrawRemountKey] = React.useState(0);
  const canvasCrashRecovery = React.useMemo(
    () => ({
      bumpRemount: () => setTldrawRemountKey(k => k + 1),
      failInflight: (message: string) => canvasAgentBridge.failInflight(message),
      reloadBoard: async () => {
        await loadBoard();
      },
    }),
    [canvasAgentBridge, loadBoard],
  );
  const [agentCustomSettings, setAgentCustomSettings] = React.useState<Record<string, { cmd?: string; flags?: string; enabled?: boolean }>>({});
  const [customAgents, setCustomAgents] = React.useState<CodeAgentCustomEntry[]>([]);
  /**
   * When `false`, tldraw's built-in StylePanel is force-hidden via
   * `StylePanel: () => null`. When `true`, we omit the override so tldraw owns
   * visibility (it auto-hides on no-selection / certain tools, etc.).
   */
  const documentSaveInFlightRef = React.useRef(false);
  const sessionSaveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSessionRef = React.useRef<CanvasTldrawSession | null>(null);
  const sessionDirtyRef = React.useRef(false);
  const autoSaveIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const hydratedRenderedBoardKeyRef = React.useRef<string | null>(null);
  const initialViewportFitDoneRef = React.useRef(false);
  const prevCanvasPrefsInstanceRef = React.useRef(canvasPrefsInstanceId);
  const spawnIndexRef = React.useRef(0);
  const sharePanelRef = React.useRef<React.ReactNode>(null);
  const canvasAgentBridgeRef = React.useRef(canvasAgentBridge);
  canvasAgentBridgeRef.current = canvasAgentBridge;
  const shapeUtils = React.useMemo(() => [CanvasTerminalShapeUtil], []);
  const topLeftToolbarContextValue = React.useMemo(
    () => ({
      isCollapsed: isTopLeftToolbarCollapsed,
      toggle: toggleIsTopLeftToolbarCollapsed,
    }),
    [isTopLeftToolbarCollapsed, toggleIsTopLeftToolbarCollapsed],
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
  const AgentOnCanvasSlot = React.useCallback(
    () => <CanvasAgentOnCanvas bridge={canvasAgentBridgeRef.current} />,
    [],
  );
  const ShapeCopySlot = React.useCallback(() => <CanvasShapeCopyOverlay />, []);
  const tldrawComponents = React.useMemo<TLComponents>(
    () => ({
      MenuPanel: CanvasMenuPanel,
      Toolbar: CanvasBottomToolbarPeek,
      SharePanel: SharePanelSlot,
      OnTheCanvas: AgentOnCanvasSlot,
      InFrontOfTheCanvas: ShapeCopySlot,
      // Force-hide tldraw's built-in StylePanel until the user toggles it on
      // from our SharePanel. When enabled, we omit the override entirely so
      // tldraw uses its default component (which knows when to auto-hide).
      ...(isStylePanelEnabled ? {} : { StylePanel: NullStylePanelSlot }),
    }),
    [AgentOnCanvasSlot, ShapeCopySlot, SharePanelSlot, isStylePanelEnabled],
  );

  const initialSnapshot = React.useMemo(() => {
    if (!connectionBootstrapReady || !document?.tldrawDocument) {
      return null;
    }
    return createCanvasSnapshot(
      document.tldrawDocument,
      resolveCanvasSessionForLoad(readCanvasSession(board?.guid)),
    );
  }, [board?.guid, connectionBootstrapReady, document?.tldrawDocument]);

  React.useEffect(() => {
    if (isHostedAtmosOrigin()) {
      setConnectionBootstrapReady(true);
      return;
    }
    void ensureLocalAppConnectionBootstrap().then(() => {
      setConnectionBootstrapReady(true);
    });
  }, []);

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
    Promise.all([
      useFunctionSettingsStore.getState().load(),
      codeAgentCustomApi.get(),
    ]).then(([, customData]) => {
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
        } catch {
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
    } catch {
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
    initialViewportFitDoneRef.current = false;
  }, [board?.guid, resetRuntime]);

  React.useEffect(() => {
    initialViewportFitDoneRef.current = false;
    setEditorReady(false);
  }, [tldrawRemountKey]);

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
          writeCanvasSession(
            sanitizeCanvasSessionForPersist(pendingSessionRef.current),
            board?.guid,
          );
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

    const cleanupDocument = editor.store.listen(
      () => {
        const runtime = useCanvasRuntime.getState();
        const shapes = getCanvasTerminalShapes(editor);
        const shapeIds = new Set(shapes.map((shape) => shape.id));
        const nextRenderedShapeIds = runtime.renderedShapeIds.filter((shapeId) =>
          shapeIds.has(shapeId),
        );
        if (!areShapeIdListsEqual(nextRenderedShapeIds, runtime.renderedShapeIds)) {
          runtime.setRenderedShapeIds(nextRenderedShapeIds);
        }
        if (runtime.activeShapeId && !shapeIds.has(runtime.activeShapeId)) {
          runtime.setActiveShapeId(null);
        }
      },
      { scope: "document" },
    );

    const cleanupSession = editor.store.listen(
      () => {
        const snapshot = getSnapshot(editor.store) as TLEditorSnapshot;
        scheduleSessionSave(snapshot.session);

        const runtime = useCanvasRuntime.getState();
        const nextSelectedShapeIds = editor.getSelectedShapeIds() as TLShapeId[];
        if (nextSelectedShapeIds.length === 0) {
          if (runtime.activeShapeId !== null) {
            runtime.setActiveShapeId(null);
          }
        } else if (
          nextSelectedShapeIds.length === 1 &&
          nextSelectedShapeIds[0] !== runtime.activeShapeId
        ) {
          setActiveShapeId(nextSelectedShapeIds[0]);
        }

        recoverCanvasViewportIfNeeded(editor);
      },
      { scope: "session" },
    );

    return () => {
      cleanupDocument();
      cleanupSession();
    };
  }, [editorReady, scheduleSessionSave, setActiveShapeId]);

  React.useEffect(() => {
    if (!editorReady || !connectionBootstrapReady) {
      return;
    }
    if (prevCanvasPrefsInstanceRef.current === canvasPrefsInstanceId) {
      return;
    }
    prevCanvasPrefsInstanceRef.current = canvasPrefsInstanceId;

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    loadCanvasSessionIntoEditor(
      editor,
      resolveCanvasSessionForLoad(readCanvasSession(board?.guid)),
    );
    const pageId = editor.getCurrentPageId();
    if (!hasTrustedSessionViewport(readCanvasSession(board?.guid), pageId)) {
      void fitCanvasEditorToPageContent(editor);
    }
  }, [board?.guid, canvasPrefsInstanceId, connectionBootstrapReady, editorReady]);

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
    if (!editorReady || !canvasSettingsLoaded) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const lastPinned = consumeLastPinnedTerminal(board?.guid);
    if (!lastPinned) {
      return;
    }

    const shape = findPinnedTerminalShape(editor, lastPinned);
    if (!shape) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      focusCanvasTerminalShape(editor, shape, {
        maxRenderedTerminals,
        setActiveShapeId,
        setRenderedShapeIds,
        renderedShapeIds: useCanvasRuntime.getState().renderedShapeIds,
        setFocusPulseShapeId,
      });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    board?.guid,
    canvasSettingsLoaded,
    editorReady,
    maxRenderedTerminals,
    setActiveShapeId,
    setFocusPulseShapeId,
    setRenderedShapeIds,
  ]);

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

  if (isLoading || !connectionBootstrapReady) {
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
    <div
      className="pointer-events-auto"
      style={needsTrafficLightsPadding ? { marginTop: 32 } : undefined}
    >
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
          onClick={toggleIsToolbarCollapsed}
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
              onClick={toggleIsStylePanelEnabled}
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
    <div className="tldraw-wrapper relative h-full w-full overflow-hidden bg-background">
      <CanvasAgentContext.Provider value={configuredAgents}>
        <CanvasAgentCrashProvider value={canvasCrashRecovery}>
          <CanvasTerminalRefProvider>
          <CanvasTopChromePaddingContext.Provider value={needsTrafficLightsPadding ? 32 : 0}>
          <CanvasTopLeftToolbarContext.Provider value={topLeftToolbarContextValue}>
            <CanvasAgentCrashBoundary className="h-full w-full">
              <Tldraw
                key={`${board?.guid || "canvas"}:${tldrawRemountKey}`}
                licenseKey={TLDRAW_LICENSE_KEY}
                snapshot={initialSnapshot ?? undefined}
                shapeUtils={shapeUtils}
                components={tldrawComponents}
                onMount={(nextEditor) => {
                  editorRef.current = nextEditor;
                  setEditorReady(true);
                  setAgentBridgeEditor(nextEditor);

                  // IndexedDB session can override snapshot; re-apply unless user saved grid off.
                  if (readCanvasSession(board?.guid)?.isGridMode !== false) {
                    nextEditor.updateInstanceState({ isGridMode: true });
                  }

                  const pageId = nextEditor.getCurrentPageId();
                  const session = readCanvasSession(board?.guid);
                  if (!hasTrustedSessionViewport(session, pageId)) {
                    requestAnimationFrame(() => {
                      if (initialViewportFitDoneRef.current) {
                        return;
                      }
                      if (fitCanvasEditorToPageContent(nextEditor)) {
                        initialViewportFitDoneRef.current = true;
                      }
                    });
                  } else {
                    initialViewportFitDoneRef.current = true;
                  }
                }}
              >
                <CanvasThemeBridge />
                <CanvasAgentOverlay bridge={canvasAgentBridge} />
                <CanvasTerminalFocusPulse />
              </Tldraw>
            </CanvasAgentCrashBoundary>
          </CanvasTopLeftToolbarContext.Provider>
          </CanvasTopChromePaddingContext.Provider>
          <CanvasAgentIsland bridge={canvasAgentBridge} />
          </CanvasTerminalRefProvider>
        </CanvasAgentCrashProvider>
      </CanvasAgentContext.Provider>
    </div>
  );
};

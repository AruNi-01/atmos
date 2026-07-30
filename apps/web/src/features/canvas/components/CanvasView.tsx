"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useHotkeys } from "react-hotkeys-hook";
import {
  Tldraw,
  createShapeId,
  getSnapshot,
  type Editor,
  type TLComponents,
  type TLEditorSnapshot,
  type TLUiOverrides,
  type TLShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import {
  Button,
  toastManager,
  cn,
} from "@workspace/ui";
import {
  AlertTriangle,
  Frame,
  Loader2,
  Palette,
} from "lucide-react";
import { useCanvasSettingsStore } from "@/features/canvas/store/canvas-settings-store";
import { useDesktopTrafficLightsPadding } from "@/shared/hooks/use-desktop-traffic-lights-padding";
import { codeAgentCustomApi, type CodeAgentCustomEntry } from "@/api/ws-api";
import { useFunctionSettingsStore } from "@/features/settings/store/function-settings-store";
import type { TerminalPaneAgent } from "@/features/terminal/types/index";

const TL_DRAW_TRANSLATION_OVERRIDES: TLUiOverrides = {
  translations: {
    "zh-cn": {
      "action.copy-hovered-styles": "复制悬停样式",
      "action.frame-selection": "为选区创建框架",
      "page-menu.max-pages-reached": "已达到页面数量上限",
      "page-menu.resize": "调整页面列表大小",
    },
  },
};
import {
  getTerminalWorkspaceScopeKey,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import { AGENT_OPTIONS, getInteractiveAgentParams } from "@/features/wiki/components/AgentSelect";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useCanvasRuntimeStore } from "../store/canvas-runtime-store";
import {
  ATMOS_CANVAS_FILE_SCHEMA,
  createCanvasSnapshot,
  resolveCanvasSessionForLoad,
  useCanvasBoard,
  type CanvasBoardDocument,
} from "../hooks/use-canvas-board";
import { getDocumentScriptHost } from "../lib/document-script-host";
import {
  applyDocumentScriptBundle,
  registerDocumentScriptSession,
} from "../lib/document-script-session";
import { CanvasDocumentsControl } from "./CanvasDocumentsControl";
import { CanvasDocumentScriptStatus } from "./CanvasDocumentScriptStatus";
import type { CanvasTldrawDocument, CanvasTldrawSession } from "@/shared/types/canvas";
import {
  clearLastPinnedTerminal,
  readCanvasSession,
  consumeLastPinnedTerminal,
  writeCanvasSession,
} from "@/shared/stores/use-ui-pref-hooks";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { instanceIdFromRelaySelection } from "@/features/connection/lib/connection-instance";
import { useCanvasChromePrefs } from "@/features/canvas/hooks/use-canvas-chrome-prefs";
import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  CANVAS_TERMINAL_SHAPES_REMOVED_EVENT,
  dispatchCanvasTerminalPinStateChange,
  getCanvasTerminalShapes,
  isCanvasTerminalShapeRecord,
} from "../lib/canvas-terminal-shape";
import {
  areShapeIdListsEqual,
  getRestoredRenderedShapeIds,
  promoteRenderedShapeId,
  trimRenderedShapeIds,
} from "../lib/canvas-terminal-rendering";
import { useCanvasAgentBridge } from "../hooks/use-canvas-agent-bridge";
import { CanvasAgentBridgeControls, CanvasAgentOverlay } from "./CanvasAgentOverlay";
import { CanvasAgentOnCanvas } from "./CanvasAgentOnCanvas";
import { CanvasAgentIsland } from "./CanvasAgentIsland";
import { CanvasFocusPulse } from "./CanvasFocusPulse";
import { CanvasShapeCopyOverlay } from "./CanvasShapeCopyOverlay";
import { CanvasEmptyBrushAddWidget } from "./CanvasEmptyBrushAddWidget";
import { CanvasUnsupportedInteractionDialog } from "./CanvasUnsupportedInteractionDialog";
import {
  CanvasTerminalRefProvider,
} from "../lib/canvas-terminal-ref-context";
import {
  findPinnedTerminalShape,
  focusCanvasTerminalShape,
} from "../lib/canvas-terminal-focus";
import { CanvasAgentCrashBoundary } from "./CanvasAgentCrashBoundary";
import { CanvasAgentCrashProvider } from "../lib/canvas-agent-crash-context";
import { ensureLocalAppConnectionBootstrap } from "@/features/connection/lib/app-connection-bootstrap";
import { isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";
import {
  fitCanvasEditorToPageContent,
  hasTrustedSessionViewport,
  loadCanvasSessionIntoEditor,
  recoverCanvasViewportIfNeeded,
  sanitizeCanvasSessionForPersist,
} from "../lib/canvas-viewport";
import {
  CanvasAgentContext,
  CanvasTerminalShapeUtil,
} from "./CanvasTerminalCard";
import { CanvasWidgetShapeUtil } from "./CanvasWidgetCard";
import { useProjects } from "@/features/project/hooks/use-project-bootstrap-query";
import { useAgentFixLauncherStore } from "@/features/agent-fix/store/agent-fix-launcher-store";
import type { ResolvedAgentFixLaunchRequest } from "@/features/agent-fix/types";
import { useReviewTerminalRunnerStore } from "@/features/code-review/store/review-terminal-runner-store";
import { buildInteractiveAgentRunPlan } from "@/features/agent/lib/terminal-agent-run-config";
import { resolveAgentFixLaunchPrompt } from "@/features/agent-fix/lib/agent-fix-prompt-file";
import { toPendingTerminalRun } from "@/features/terminal/lib/terminal-agent-run-delivery";
import {
  createRelatedCanvasTerminalShape,
  resolveRelatedCanvasTerminalFrameName,
  type RelatedCanvasTerminalSourceContext,
} from "../lib/create-related-canvas-terminal";
import {
  getCanvasContextId,
  isCanvasWidgetShapeRecord,
} from "../lib/canvas-widget-shape";
import { CanvasAddAtmosWidgetPopover } from "./CanvasAddAtmosWidgetDialog";
import {
  CanvasAnimatedToolbarGroup,
  CanvasBottomToolbarPeek,
  CanvasMenuPanel,
  CanvasThemeBridge,
  CanvasTopChromePaddingContext,
  CanvasTopLeftToolbarContext,
  CanvasToolbarCollapseIcon,
  NullStylePanelSlot,
} from "./CanvasToolbarChrome";

const SESSION_SAVE_DEBOUNCE_MS = 400;
const CANVAS_READY_MIN_LOADING_MS = 180;
const TLDRAW_LICENSE_KEY = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;

function nowMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function CanvasLoadingScreen({
  overlay = false,
}: {
  overlay?: boolean;
}) {
  const loadingT = useTranslations("app.loading");

  return (
    <div
      className={cn(
        "desktop-loading-clean flex h-full items-center justify-center bg-background",
        overlay && "absolute inset-0 z-[1500]",
      )}
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{loadingT("label")}</p>
      </div>
    </div>
  );
}

function createCanvasDocument(
  document: CanvasTldrawDocument | null,
  title: string,
  session?: CanvasTldrawSession | null,
  script?: CanvasBoardDocument["script"],
): CanvasBoardDocument {
  return {
    schema: ATMOS_CANVAS_FILE_SCHEMA,
    title,
    tldrawDocument: document,
    session: session ?? null,
    script: script ?? null,
  };
}

export const CanvasView: React.FC = () => {
  const t = useTranslations("canvas.view");
  const loadErrorDescription = t("loadError.description");
  const { currentView, effectiveContextId } = useContextParams();
  const router = useAppRouter();
  const {
    isStylePanelEnabled,
    isTopLeftToolbarCollapsed,
    isToolbarCollapsed,
    toggleIsStylePanelEnabled,
    toggleIsTopLeftToolbarCollapsed,
    toggleIsToolbarCollapsed,
  } = useCanvasChromePrefs();
  const {
    board,
    boardIdentity,
    fileName,
    title: documentTitle,
    document,
    dirty,
    isLoading,
    isSaving,
    error,
    documentList,
    loadBoard,
    saveDocument,
    saveAs,
    openDocument,
    newDocument,
    renameDocument,
    deleteDocumentFile,
    duplicateDocumentFile,
    markDirty,
    refreshDocumentList,
    setDocument,
  } = useCanvasBoard();
  const canvasPrefsInstanceId = useAtmosComputerStore((state) =>
    instanceIdFromRelaySelection(state.connectionMode, state.selectedServerId),
  );
  const [connectionBootstrapReady, setConnectionBootstrapReady] = React.useState(
    () => typeof window === "undefined" || isHostedAtmosOrigin(),
  );
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const setActiveShapeId = useCanvasRuntimeStore((state) => state.setActiveShapeId);
  const queuePendingTerminalRun = useCanvasRuntimeStore((state) => state.queuePendingTerminalRun);
  const activeShapeId = useCanvasRuntimeStore((state) => state.activeShapeId);
  const renderedShapeIds = useCanvasRuntimeStore((state) => state.renderedShapeIds);
  const setRenderedShapeIds = useCanvasRuntimeStore((state) => state.setRenderedShapeIds);
  const setFocusPulseShapeIds = useCanvasRuntimeStore((state) => state.setFocusPulseShapeIds);
  const resetRuntime = useCanvasRuntimeStore((state) => state.reset);
  const {
    autoSaveInterval,
    maxRenderedTerminals,
    loaded: canvasSettingsLoaded,
    loadSettings: loadCanvasSettings,
  } = useCanvasSettingsStore();
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
  const editorRef = React.useRef<Editor | null>(null);
  const [editorReady, setEditorReady] = React.useState(false);
  const [readyCanvasRenderKey, setReadyCanvasRenderKey] = React.useState<string | null>(null);
  const canvasLoadingStartedAtRef = React.useRef(nowMs());
  const previousCanvasRenderKeyRef = React.useRef<string | null>(null);
  const canvasRevealRafIdsRef = React.useRef<number[]>([]);
  const canvasRevealTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // APP-015: Canvas terminal-agent bridge. The hook returns a stable state
  // object whose internal bus/presence references survive every CanvasView
  // re-render, so it is safe to call before `editorReady` and pass the
  // editor in via `setEditor` below.
  const [agentBridgeEditor, setAgentBridgeEditor] = React.useState<Editor | null>(null);
  const canvasAgentBridge = useCanvasAgentBridge(agentBridgeEditor, {
    activeDocumentFileName: fileName,
  });
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
  const projects = useProjects();
  const createTerminalTabWithInitialPane = useTerminalStore((state) => state.createTerminalTabWithInitialPane);
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
  const [addAtmosWidgetOpen, setAddAtmosWidgetOpen] = React.useState(false);
  const shapeUtils = React.useMemo(() => [CanvasTerminalShapeUtil, CanvasWidgetShapeUtil], []);
  const canvasTerminalTabs = useTerminalStore((state) =>
    effectiveContextId ? state.workspaceTerminalTabs[effectiveContextId] : undefined,
  );
  const canvasTerminalWorkspaceLoaded = useTerminalStore((state) =>
    effectiveContextId
      ? state.loadedWorkspaces.has(
          getTerminalWorkspaceScopeKey(
            effectiveContextId,
            state.workspaceContexts[effectiveContextId] ?? currentView === "project",
          ),
        )
      : false,
  );
  const canvasWorkspaceIsProject = useTerminalStore((state) =>
    effectiveContextId ? state.workspaceContexts[effectiveContextId] : undefined,
  );
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
  const ShapeCopySlot = React.useCallback(
    () => (
      <>
        <CanvasShapeCopyOverlay />
        <CanvasEmptyBrushAddWidget />
      </>
    ),
    [],
  );
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

  const cancelPendingCanvasReveal = React.useCallback(() => {
    for (const rafId of canvasRevealRafIdsRef.current) {
      cancelAnimationFrame(rafId);
    }
    canvasRevealRafIdsRef.current = [];

    if (canvasRevealTimeoutRef.current) {
      clearTimeout(canvasRevealTimeoutRef.current);
      canvasRevealTimeoutRef.current = null;
    }
  }, []);

  const scheduleCanvasRevealAfterPaint = React.useCallback((renderKey: string) => {
    cancelPendingCanvasReveal();

    const rafId = requestAnimationFrame(() => {
      const nestedRafId = requestAnimationFrame(() => {
        canvasRevealRafIdsRef.current = [];
        const elapsed = nowMs() - canvasLoadingStartedAtRef.current;
        const remaining = Math.max(0, CANVAS_READY_MIN_LOADING_MS - elapsed);

        canvasRevealTimeoutRef.current = setTimeout(() => {
          canvasRevealTimeoutRef.current = null;
          setReadyCanvasRenderKey(renderKey);
        }, remaining);
      });
      canvasRevealRafIdsRef.current = [nestedRafId];
    });

    canvasRevealRafIdsRef.current = [rafId];
  }, [cancelPendingCanvasReveal]);

  // Snapshot is only used as the *initial* store for a given canvasRenderKey.
  // After mount, the live editor is source of truth — do not recompute snapshot
  // on every autosave (that remounts/reloads Tldraw).
  const initialSnapshot = React.useMemo(() => {
    if (!connectionBootstrapReady || !document?.tldrawDocument) {
      return null;
    }
    return createCanvasSnapshot(
      document.tldrawDocument,
      resolveCanvasSessionForLoad(
        document.session ?? readCanvasSession(boardIdentity),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: identity-only
  }, [boardIdentity, connectionBootstrapReady, fileName, tldrawRemountKey]);

  // Only remount when the open document *identity* changes (or crash remount).
  // Do not key off `document` content — autosave would flash/reload the editor.
  const hasDocument = document != null;
  const canvasRenderKey = React.useMemo(() => {
    if (!connectionBootstrapReady || !hasDocument) {
      return null;
    }

    return [boardIdentity, fileName ?? "untitled", tldrawRemountKey].join(":");
  }, [boardIdentity, connectionBootstrapReady, hasDocument, fileName, tldrawRemountKey]);

  if (previousCanvasRenderKeyRef.current !== canvasRenderKey) {
    previousCanvasRenderKeyRef.current = canvasRenderKey;
    canvasLoadingStartedAtRef.current = nowMs();
  }

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
        const flags = getInteractiveAgentParams(agent, custom?.flags);
        return {
          id: agent.id,
          label: agent.label,
          command: flags ? `${cmd} ${flags}` : cmd,
          iconType: "built-in",
          pipeCommand: "useEcho" in agent && agent.useEcho ? cmd : undefined,
        } satisfies TerminalPaneAgent;
      }),
      ...visibleCustomAgents.map((agent) => {
        const cmd = agent.cmd.trim();
        const flags = agent.flags?.trim() || "";
        return {
          id: agent.id,
          label: agent.label,
          command: flags ? `${cmd} ${flags}` : cmd,
          iconType: "custom" as const,
        };
      }),
    ],
    [visibleBuiltInAgents, visibleCustomAgents, agentCustomSettings],
  );

  const resolveCanvasTerminalSource = React.useCallback(
    (requestedContext?: { contextId: string; scope: "project" | "workspace" }) => {
      const editor = editorRef.current;
      if (!editor) {
        return null;
      }

      const toSource = (shape: ReturnType<Editor["getShape"]> | null | undefined) => {
        if (!shape) {
          return null;
        }

        if (isCanvasTerminalShapeRecord(shape)) {
          const sourceContext: RelatedCanvasTerminalSourceContext = {
            contextScope: shape.props.contextScope,
            workspaceId: shape.props.workspaceId,
            projectName: shape.props.projectName,
            workspaceName: shape.props.workspaceName,
            localPath: shape.props.localPath,
          };
          return { shape, sourceContext };
        }

        if (isCanvasWidgetShapeRecord(shape)) {
          const context = shape.props.source.context;
          const contextId = getCanvasContextId(context);
          if (!contextId) {
            return null;
          }
          const sourceContext: RelatedCanvasTerminalSourceContext = {
            contextScope: context.contextScope,
            workspaceId: contextId,
            projectName: context.projectName,
            workspaceName: context.workspaceName ?? "",
            localPath: context.localPath,
          };
          return { shape, sourceContext };
        }

        return null;
      };

      const matchesRequestedContext = (
        source: { sourceContext: RelatedCanvasTerminalSourceContext } | null,
      ) => {
        if (!source || !requestedContext) {
          return !!source;
        }
        return (
          source.sourceContext.contextScope === requestedContext.scope &&
          source.sourceContext.workspaceId === requestedContext.contextId
        );
      };

      const activeSource = toSource(activeShapeId ? editor.getShape(activeShapeId) : null);
      if (matchesRequestedContext(activeSource)) {
        return activeSource;
      }

      for (const selectedShapeId of editor.getSelectedShapeIds()) {
        const selectedSource = toSource(editor.getShape(selectedShapeId));
        if (matchesRequestedContext(selectedSource)) {
          return selectedSource;
        }
      }

      if (requestedContext) {
        for (const pageShape of editor.getCurrentPageShapes()) {
          const pageSource = toSource(pageShape);
          if (matchesRequestedContext(pageSource)) {
            return pageSource;
          }
        }
      }

      return activeSource;
    },
    [activeShapeId],
  );

  const createAndRunCanvasTerminal = React.useCallback(
    async ({
      agent,
      command,
      label,
      requestedContext,
      tuiFollowUpPrompt,
    }: {
      agent?: TerminalPaneAgent;
      command: string;
      label: string;
      requestedContext?: { contextId: string; scope: "project" | "workspace" };
      tuiFollowUpPrompt?: string;
    }) => {
      const editor = editorRef.current;
      if (!editor) {
        throw new Error(t("errors.canvasNotReady"));
      }

      const source = resolveCanvasTerminalSource(requestedContext);
      if (!source) {
        throw new Error(t("errors.selectWidgetBeforeAgentFix"));
      }

      const created = await createTerminalTabWithInitialPane(
        source.sourceContext.workspaceId,
        source.sourceContext.contextScope,
        {
          title: label,
          paneLabel: label,
          paneAgent: agent,
        },
      );
      if (!created) {
        throw new Error(t("errors.terminalCreateFailed"));
      }

      const result = createRelatedCanvasTerminalShape({
        editor,
        shape: source.shape,
        created,
        frameName: resolveRelatedCanvasTerminalFrameName(projects, source.sourceContext),
        sourceContext: source.sourceContext,
      });
      if (!result) {
        throw new Error(t("errors.terminalPlacementFailed"));
      }

      queuePendingTerminalRun(
        result.newShapeId,
        toPendingTerminalRun(command, {
          agentId: agent?.id,
          tuiFollowUpPrompt,
        }),
      );
      dispatchCanvasTerminalPinStateChange(result.pinKey, true);
      setActiveShapeId(result.newShapeId);
      editor.select(result.newShapeId);

      const attachedAt = Date.now();
      const currentRenderedShapeIds = useCanvasRuntimeStore.getState().renderedShapeIds;
      const nextRenderedShapeIds = promoteRenderedShapeId(
        getCanvasTerminalShapes(editor),
        currentRenderedShapeIds,
        result.newShapeId,
        attachedAt,
        maxRenderedTerminals,
      );
      if (!areShapeIdListsEqual(nextRenderedShapeIds, currentRenderedShapeIds)) {
        setRenderedShapeIds(nextRenderedShapeIds);
      }
      editor.updateShape({
        id: result.newShapeId,
        type: CANVAS_TERMINAL_SHAPE_TYPE,
        props: {
          lastAttachedAt: attachedAt,
        },
      });

      const params = new URLSearchParams();
      params.set("id", source.sourceContext.workspaceId);
      params.set("tab", result.terminalTabId);
      params.set("terminalTmux", result.tmuxWindowName);
      params.set("canvas", "true");
      const base = source.sourceContext.contextScope === "project" ? "/project" : "/workspace";
      router.replace(`${base}?${params.toString()}`);
    },
    [
      createTerminalTabWithInitialPane,
      maxRenderedTerminals,
      projects,
      queuePendingTerminalRun,
      resolveCanvasTerminalSource,
      router,
      setActiveShapeId,
      setRenderedShapeIds,
      t,
    ],
  );

  const handleRunAgentFixInCanvasTerminal = React.useCallback(
    async (request: ResolvedAgentFixLaunchRequest) => {
      const source = resolveCanvasTerminalSource({
        contextId: request.context.contextId,
        scope: request.context.scope,
      });
      const launchPrompt = await resolveAgentFixLaunchPrompt(
        request.prompt,
        source?.sourceContext.localPath,
      );

      const plan = buildInteractiveAgentRunPlan({
        agentId: request.agent.id,
        launchCommand: request.agent.launchCommand.trim(),
        prompt: launchPrompt,
        runConfig: request.runConfig,
      });

      await createAndRunCanvasTerminal({
        agent: {
          id: request.agent.id,
          label: request.agent.label,
          command: request.agent.command,
          iconType: request.agent.iconType,
        },
        command: plan.launchCommand,
        tuiFollowUpPrompt: plan.tuiFollowUpPrompt,
        label: request.terminalTabTitle,
        requestedContext: request.context,
      });
    },
    [createAndRunCanvasTerminal, resolveCanvasTerminalSource],
  );

  const handleRunReviewFixInCanvasTerminal = React.useCallback(
    async (command: string, label: string) => {
      await createAndRunCanvasTerminal({ command, label });
    },
    [createAndRunCanvasTerminal],
  );

  React.useEffect(() => {
    useAgentFixLauncherStore.getState().setRunner(handleRunAgentFixInCanvasTerminal);
    return () => {
      if (useAgentFixLauncherStore.getState().runner === handleRunAgentFixInCanvasTerminal) {
        useAgentFixLauncherStore.getState().setRunner(null);
      }
    };
  }, [handleRunAgentFixInCanvasTerminal]);

  React.useEffect(() => {
    useReviewTerminalRunnerStore.getState().setRunner(handleRunReviewFixInCanvasTerminal);
    return () => {
      if (useReviewTerminalRunnerStore.getState().runner === handleRunReviewFixInCanvasTerminal) {
        useReviewTerminalRunnerStore.getState().setRunner(null);
      }
    };
  }, [handleRunReviewFixInCanvasTerminal]);

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

  // Document script session for agent bus / CLI (script-get/put/status).
  React.useEffect(() => {
    registerDocumentScriptSession({
      getScript: () => document?.script ?? null,
      setScript: async (script) => {
        setDocument((prev) => {
          if (!prev) {
            return {
              schema: ATMOS_CANVAS_FILE_SCHEMA,
              title: documentTitle,
              tldrawDocument: null,
              session: null,
              script,
            };
          }
          return { ...prev, script };
        });
        markDirty();
        await applyDocumentScriptBundle(script);
      },
    });
    return () => {
      registerDocumentScriptSession(null);
    };
  }, [document, documentTitle, markDirty, setDocument]);

  // Start / stop document script when editor + document script change.
  React.useEffect(() => {
    if (!editorReady || !editorRef.current) return;
    const host = getDocumentScriptHost();
    host.setEditor(editorRef.current);
    void applyDocumentScriptBundle(document?.script ?? null);
    return () => {
      void host.stop();
    };
  }, [boardIdentity, document?.script, editorReady]);

  React.useEffect(() => {
    pendingSessionRef.current = readCanvasSession(boardIdentity);
  }, [boardIdentity]);

  // Reflect list mtime for the open document as last-saved time.
  React.useEffect(() => {
    if (!fileName) return;
    const item = documentList.find((d) => d.file_name === fileName);
    if (!item?.modified_at) return;
    const d = new Date(item.modified_at);
    if (!Number.isNaN(d.getTime())) {
      setLastSavedAt(d);
    }
  }, [documentList, fileName]);

  const persistEditorSnapshot = React.useCallback(
    async (options?: { targetFileName?: string; displayName?: string }) => {
      const editor = editorRef.current;
      if (!editor) return;
      if (documentSaveInFlightRef.current) return;

      const snapshot = getSnapshot(editor.store) as TLEditorSnapshot;
      const nextDocument = createCanvasDocument(
        snapshot.document as CanvasTldrawDocument,
        options?.displayName ?? documentTitle,
        snapshot.session as CanvasTldrawSession,
        document?.script,
      );

      documentSaveInFlightRef.current = true;
      try {
        if (options?.displayName) {
          await saveAs(options.displayName, nextDocument);
        } else if (options?.targetFileName || fileName) {
          await saveDocument(nextDocument, options?.targetFileName ?? fileName ?? undefined);
        } else {
          throw new Error("UNTITLED_NEEDS_SAVE_AS");
        }
        setLastSavedAt(new Date());
      } finally {
        documentSaveInFlightRef.current = false;
      }
    },
    [document?.script, documentTitle, fileName, saveAs, saveDocument],
  );

  // Auto-save only when a file path is set (never invent untitled names).
  React.useEffect(() => {
    if (!editorReady || !fileName) return;

    autoSaveIntervalRef.current = setInterval(() => {
      void (async () => {
        try {
          await persistEditorSnapshot();
        } catch {
          // Auto-save errors are logged silently
        }
      })();
    }, autoSaveInterval * 1000);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    };
  }, [autoSaveInterval, editorReady, fileName, persistEditorSnapshot]);

  // Manual save function
  // Cmd/Ctrl+S still flushes autosave (no UI Save control).
  useHotkeys(
    "cmd+s, ctrl+s",
    (e) => {
      e.preventDefault();
      if (!fileName) return;
      void (async () => {
        try {
          await persistEditorSnapshot();
          setLastSavedAt(new Date());
        } catch {
          toastManager.add({
            title: t("toast.title"),
            description: t("toast.saveFailed"),
            type: "error",
          });
        }
      })();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  React.useEffect(() => {
    resetRuntime();
    hydratedRenderedBoardKeyRef.current = null;
    initialViewportFitDoneRef.current = false;
  }, [boardIdentity, resetRuntime]);

  React.useEffect(() => {
    initialViewportFitDoneRef.current = false;
    setEditorReady(false);
  }, [tldrawRemountKey]);

  React.useEffect(() => {
    if (!isLoading && connectionBootstrapReady) {
      return;
    }

    cancelPendingCanvasReveal();
    canvasLoadingStartedAtRef.current = nowMs();
    setReadyCanvasRenderKey(null);
  }, [cancelPendingCanvasReveal, connectionBootstrapReady, isLoading]);

  React.useEffect(() => cancelPendingCanvasReveal, [cancelPendingCanvasReveal]);

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
            boardIdentity,
          );
          sessionDirtyRef.current = false;
        }
      }, SESSION_SAVE_DEBOUNCE_MS);
    },
    [boardIdentity],
  );

  React.useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    if (!editor) return;

    const cleanupDocument = editor.store.listen(
      () => {
        markDirty();
        const runtime = useCanvasRuntimeStore.getState();
        const shapes = getCanvasTerminalShapes(editor);
        const shapeIds = new Set(shapes.map((shape) => shape.id));
        const nextRenderedShapeIds = runtime.renderedShapeIds.filter((shapeId) =>
          shapeIds.has(shapeId),
        );
        if (!areShapeIdListsEqual(nextRenderedShapeIds, runtime.renderedShapeIds)) {
          runtime.setRenderedShapeIds(nextRenderedShapeIds);
        }
        if (runtime.activeShapeId && !shapeIds.has(runtime.activeShapeId)) {
          if (!editor.getShape(runtime.activeShapeId)) {
            runtime.setActiveShapeId(null);
          }
        }
      },
      { scope: "document" },
    );

    const cleanupSession = editor.store.listen(
      () => {
        const snapshot = getSnapshot(editor.store) as TLEditorSnapshot;
        scheduleSessionSave(snapshot.session);

        const runtime = useCanvasRuntimeStore.getState();
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
  }, [editorReady, markDirty, scheduleSessionSave, setActiveShapeId]);

  React.useEffect(() => {
    if (!editorReady) return;

    const handleTerminalShapesRemoved = (event: Event) => {
      const shapeIds = (event as CustomEvent<{ shapeIds?: unknown }>).detail?.shapeIds;
      if (!Array.isArray(shapeIds)) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const existingShapeIds = shapeIds
        .filter((shapeId): shapeId is string => typeof shapeId === "string")
        .map((shapeId) => shapeId as TLShapeId)
        .filter((shapeId) => Boolean(editor.getShape(shapeId)));
      if (existingShapeIds.length === 0) {
        return;
      }

      editor.deleteShapes(existingShapeIds);
    };

    window.addEventListener(CANVAS_TERMINAL_SHAPES_REMOVED_EVENT, handleTerminalShapesRemoved);
    return () => {
      window.removeEventListener(CANVAS_TERMINAL_SHAPES_REMOVED_EVENT, handleTerminalShapesRemoved);
    };
  }, [editorReady]);

  React.useEffect(() => {
    if (!editorReady || !effectiveContextId || !canvasTerminalWorkspaceLoaded) {
      return;
    }
    if (currentView !== "workspace" && currentView !== "project") {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const validTabIds = new Set((canvasTerminalTabs ?? []).map((tab) => tab.id));
    const contextScope = (canvasWorkspaceIsProject ?? currentView === "project")
      ? "project"
      : "workspace";
    const staleShapes = getCanvasTerminalShapes(editor).filter((shape) => (
      shape.props.contextScope === contextScope &&
      shape.props.workspaceId === effectiveContextId &&
      !validTabIds.has(shape.props.sourceTerminalTabId)
    ));

    if (staleShapes.length === 0) {
      return;
    }

    const staleShapeIds = staleShapes.map((shape) => shape.id as TLShapeId);
    const stalePinKeys = staleShapes
      .map((shape) => shape.props.pinKey)
      .filter((pinKey): pinKey is string => Boolean(pinKey));
    editor.deleteShapes(staleShapeIds);
    for (const pinKey of stalePinKeys) {
      clearLastPinnedTerminal(boardIdentity, pinKey);
      dispatchCanvasTerminalPinStateChange(pinKey, false);
    }

    if (documentSaveInFlightRef.current || !fileName) {
      return;
    }

    void (async () => {
      try {
        await persistEditorSnapshot();
      } catch (error) {
        console.warn("Failed to save pruned Canvas terminals", error);
      }
    })();
  }, [
    boardIdentity,
    fileName,
    persistEditorSnapshot,
    canvasTerminalTabs,
    canvasTerminalWorkspaceLoaded,
    canvasWorkspaceIsProject,
    currentView,
    effectiveContextId,
    editorReady,
  ]);

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
      resolveCanvasSessionForLoad(readCanvasSession(boardIdentity)),
    );
    const pageId = editor.getCurrentPageId();
    if (!hasTrustedSessionViewport(readCanvasSession(boardIdentity), pageId)) {
      void fitCanvasEditorToPageContent(editor);
    }
  }, [boardIdentity, canvasPrefsInstanceId, connectionBootstrapReady, editorReady]);

  React.useEffect(() => {
    if (!editorReady || !canvasSettingsLoaded) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const boardKey = boardIdentity ?? "default";
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
  }, [boardIdentity, canvasSettingsLoaded, editorReady, maxRenderedTerminals, setRenderedShapeIds]);

  React.useEffect(() => {
    if (!editorReady || !canvasSettingsLoaded) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const lastPinned = consumeLastPinnedTerminal(boardIdentity);
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
        renderedShapeIds: useCanvasRuntimeStore.getState().renderedShapeIds,
        getFocusPulseShapeIds: () => useCanvasRuntimeStore.getState().focusPulseShapeIds,
        setFocusPulseShapeIds,
      });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    boardIdentity,
    canvasSettingsLoaded,
    editorReady,
    maxRenderedTerminals,
    setActiveShapeId,
    setFocusPulseShapeIds,
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
  // the Import Terminal modal. Pinning uses `loadPinTargetDocument` /
  // `savePinTargetDocument` (file-backed Default or active .atmos.tldr).

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
        name: t("frame.defaultName"),
      },
    });
    editor.select(frameId);
    requestAnimationFrame(() => {
      editor.setEditingShape(frameId);
    });
    setActiveShapeId(null);
  }, [setActiveShapeId, t]);

  if (isLoading || !connectionBootstrapReady) {
    return <CanvasLoadingScreen />;
  }

  if (error || !document) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <AlertTriangle className="size-12 text-warning" />
        <div>
          <div className="text-base font-semibold text-foreground">{t("loadError.title")}</div>
          <div className="text-sm text-muted-foreground">{loadErrorDescription}</div>
        </div>
        <Button variant="outline" onClick={() => void loadBoard()} className="cursor-pointer">
          {t("loadError.retry")}
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
          aria-label={isToolbarCollapsed ? t("toolbar.expandAria") : t("toolbar.collapseAria")}
          title={isToolbarCollapsed ? t("toolbar.expandTitle") : t("toolbar.collapseTitle")}
          className={sharePanelIconButtonClass}
        >
          <CanvasToolbarCollapseIcon isCollapsed={isToolbarCollapsed} side="right" />
        </Button>
        <CanvasAnimatedToolbarGroup isCollapsed={isToolbarCollapsed}>
          <div className="ml-0.5 flex items-center gap-0.5">
            {/* Agent canvas first — immediately right of the collapse control. */}
            <CanvasAgentBridgeControls
              bridge={canvasAgentBridge}
              iconButtonClass={sharePanelIconButtonClass}
              onJump={() => {
                const editor = editorRef.current;
                if (!editor) return;
                canvasAgentBridge.activity.jumpToLast(editor);
              }}
            />
            <CanvasDocumentsControl
              title={documentTitle}
              fileName={fileName}
              dirty={dirty}
              documentList={documentList}
              isBusy={isSaving}
              onRefreshList={refreshDocumentList}
              onOpen={async (next) => {
                await openDocument(next);
              }}
              onNew={async () => {
                await newDocument();
              }}
              onFlushSave={async () => {
                await persistEditorSnapshot();
                setLastSavedAt(new Date());
              }}
              onRename={async (target, name) => {
                // Flush live editor to disk before rename so remount reloads
                // the correct snapshot (React state alone can lag the editor).
                if (target === fileName && dirty) {
                  await persistEditorSnapshot();
                }
                await renameDocument(target, name);
              }}
              onDelete={async (target) => {
                await deleteDocumentFile(target);
                if (target === fileName) {
                  setTldrawRemountKey((key) => key + 1);
                }
              }}
              onDuplicate={async (target) => {
                await duplicateDocumentFile(target);
              }}
            />
            <CanvasAddAtmosWidgetPopover
              editor={editorReady ? editorRef.current : null}
              open={addAtmosWidgetOpen}
              onOpenChange={setAddAtmosWidgetOpen}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreateFrame}
              className={cn(
                "h-8 gap-1 rounded-md border-0 bg-transparent px-2 text-muted-foreground shadow-none",
                "hover:bg-foreground/10 hover:text-foreground",
              )}
              title={t("frameButton.title")}
            >
              <Frame className="size-3.5" />
              <span className="text-xs font-medium">{t("frameButton.label")}</span>
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
              title={isStylePanelEnabled ? t("stylePanel.hideTitle") : t("stylePanel.showTitle")}
              aria-label={isStylePanelEnabled ? t("stylePanel.hideAria") : t("stylePanel.showAria")}
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
  const showCanvasLoading = readyCanvasRenderKey !== canvasRenderKey;

  return (
    <div className="tldraw-wrapper relative isolate h-full w-full overflow-hidden bg-background">
      <style jsx global>{`
        .tldraw-wrapper .tl-container {
          --tl-layer-menu-click-capture: 1190;
          --tl-layer-panels: 1200;
          --tl-layer-menus: 1300;
          --tl-layer-toasts: 1350;
          --tl-layer-header-footer: 1400;
          --tl-layer-following-indicator: 1450;
        }
      `}</style>
      <CanvasDocumentScriptStatus />
      <div
        className={cn(
          "h-full w-full transition-opacity duration-150",
          showCanvasLoading ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        aria-hidden={showCanvasLoading}
      >
        <CanvasAgentContext.Provider value={configuredAgents}>
          <CanvasAgentCrashProvider value={canvasCrashRecovery}>
            <CanvasTerminalRefProvider>
            <CanvasTopChromePaddingContext.Provider value={needsTrafficLightsPadding ? 32 : 0}>
            <CanvasTopLeftToolbarContext.Provider value={topLeftToolbarContextValue}>
              <CanvasAgentCrashBoundary className="h-full w-full">
                <Tldraw
                  key={`${boardIdentity || "canvas"}:${tldrawRemountKey}`}
                  licenseKey={TLDRAW_LICENSE_KEY}
                  snapshot={initialSnapshot ?? undefined}
                  shapeUtils={shapeUtils}
                  components={tldrawComponents}
                  overrides={TL_DRAW_TRANSLATION_OVERRIDES}
                  onMount={(nextEditor) => {
                    editorRef.current = nextEditor;
                    setEditorReady(true);
                    setAgentBridgeEditor(nextEditor);
                    const nextCanvasRenderKey = canvasRenderKey;
                    if (!nextCanvasRenderKey) {
                      return;
                    }

                    // IndexedDB session can override snapshot; re-apply unless user saved grid off.
                    if (readCanvasSession(boardIdentity)?.isGridMode !== false) {
                      nextEditor.updateInstanceState({ isGridMode: true });
                    }

                    const pageId = nextEditor.getCurrentPageId();
                    const session = readCanvasSession(boardIdentity);
                    if (!hasTrustedSessionViewport(session, pageId)) {
                      const viewportFitRafId = requestAnimationFrame(() => {
                        if (!initialViewportFitDoneRef.current && fitCanvasEditorToPageContent(nextEditor)) {
                          initialViewportFitDoneRef.current = true;
                        }
                        scheduleCanvasRevealAfterPaint(nextCanvasRenderKey);
                      });
                      canvasRevealRafIdsRef.current.push(viewportFitRafId);
                    } else {
                      initialViewportFitDoneRef.current = true;
                      scheduleCanvasRevealAfterPaint(nextCanvasRenderKey);
                    }
                  }}
                >
                  <CanvasThemeBridge />
                  <CanvasAgentOverlay bridge={canvasAgentBridge} />
                  <CanvasFocusPulse />
                </Tldraw>
              </CanvasAgentCrashBoundary>
            </CanvasTopLeftToolbarContext.Provider>
            </CanvasTopChromePaddingContext.Provider>
            <CanvasAgentIsland bridge={canvasAgentBridge} />
            </CanvasTerminalRefProvider>
          </CanvasAgentCrashProvider>
        </CanvasAgentContext.Provider>
      </div>
      {showCanvasLoading ? <CanvasLoadingScreen overlay /> : null}
      <CanvasUnsupportedInteractionDialog />
    </div>
  );
};

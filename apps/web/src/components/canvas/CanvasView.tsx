"use client";

import React from "react";
import { useTheme } from "next-themes";
import { useHotkeys } from "react-hotkeys-hook";
import {
  DefaultSpinner,
  HTMLContainer,
  Tldraw,
  createShapeId,
  getSnapshot,
  useEditor,
  useValue,
  type Editor,
  type TLComponents,
  type TLEditorSnapshot,
  type TLShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import {
  Button,
  ScrollArea,
  toastManager,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  cn,
} from "@workspace/ui";
import {
  AlertTriangle,
  Frame,
  Loader2,
  LoaderCircle,
  RotateCw,
  SquareTerminal,
  ArrowUpRight,
  Plus,
  PinOff,
} from "lucide-react";
import {
  projectLayoutApi,
  systemApi,
  workspaceLayoutApi,
  type ActiveSessionInfo,
  type TerminalOverviewResponse,
  type TmuxWindow,
} from "@/api/rest-api";
import { useCanvasSettings } from "@/hooks/use-canvas-settings";
import { useDesktopTrafficLightsPadding } from "@/hooks/use-desktop-traffic-lights-padding";
import { canvasWsApi, codeAgentCustomApi, type CodeAgentCustomEntry } from "@/api/ws-api";
import { useAppRouter } from "@/hooks/use-app-router";
import { useProjectStore } from "@/hooks/use-project-store";
import { useFunctionSettingsStore } from "@/hooks/use-function-settings-store";
import type { Project } from "@/types/types";
import { parseTerminalLayoutDocument } from "@/lib/terminal-layout-document";
import { Terminal } from "@/components/terminal/Terminal";
import { getTerminalDisplayMeta, TerminalTitleWithAgent } from "@/components/terminal/terminal-title";
import type { TerminalPaneAgent } from "@/components/terminal/types";
import { AGENT_OPTIONS } from "@/components/wiki/AgentSelect";
import { useCanvasRuntime } from "./use-canvas-runtime";
import {
  createCanvasSnapshot,
  useCanvasBoard,
  type CanvasBoardDocument,
  type CanvasTldrawDocument,
  type CanvasTldrawSession,
} from "./use-canvas-board";
import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  CanvasTerminalShapeSchemaUtil,
  createCanvasTerminalShapeProps,
  dispatchCanvasTerminalPinStateChange,
  isCanvasTerminalShapeRecord,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";
import {
  getRestoredRenderedShapeIds,
  promoteRenderedShapeId,
  trimRenderedShapeIds,
} from "./canvas-terminal-rendering";
import { createAtmosTldrawThemes } from "./tldraw-theme";

const SESSION_SAVE_DEBOUNCE_MS = 400;
const TLDRAW_LICENSE_KEY = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
const CANVAS_SESSION_STORAGE_KEY_PREFIX = "atmos.canvas.session";

type WorkspaceImportItem = {
  scope: "project" | "workspace";
  contextId: string;
  projectName: string;
  workspaceName: string;
  localPath: string;
  key: string;
};

type ImportablePaneItem = {
  key: string;
  contextKey: string;
  scope: "project" | "workspace";
  contextId: string;
  projectName: string;
  workspaceName: string;
  localPath: string;
  terminalTabId: string;
  terminalTabTitle: string;
  paneId: string;
  terminalName: string;
  tmuxWindowName: string;
};

type ContextPaneState = {
  status: "idle" | "loading" | "loaded" | "error";
  panes: ImportablePaneItem[];
  error: string | null;
};

interface CanvasViewProps {
  /**
   * Optional render slot for trailing buttons inside tldraw's `SharePanel` —
   * used by `CanvasOverlay` to inject the "collapse overlay" control next to
   * the canvas-level Import / Refresh / Saved-status controls.
   */
  trailingActions?: React.ReactNode;
}

const CanvasAgentContext = React.createContext<TerminalPaneAgent[]>([]);

class CanvasTerminalShapeUtil extends CanvasTerminalShapeSchemaUtil {
  component(shape: CanvasTerminalShape) {
    return <CanvasTerminalCard shape={shape} />;
  }
}

function getWorkspaceImportItems(projects: Project[]): WorkspaceImportItem[] {
  return projects.flatMap((project) => {
    const items: WorkspaceImportItem[] = [
      {
        key: `${project.id}:main`,
        scope: "project",
        contextId: project.id,
        projectName: project.name,
        workspaceName: "Main",
        localPath: project.mainFilePath,
      },
    ];

    for (const workspace of project.workspaces) {
      if (workspace.isArchived) continue;
      items.push({
        key: workspace.id,
        scope: "workspace",
        contextId: workspace.id,
        projectName: project.name,
        workspaceName: workspace.displayName || workspace.name,
        localPath: workspace.localPath,
      });
    }

    return items;
  });
}

function createCanvasDocument(document: CanvasTldrawDocument | null): CanvasBoardDocument {
  return {
    schema: "canvas.v1",
    boardSlug: "default",
    tldrawDocument: document,
  };
}

function getCanvasSessionStorageKey(boardGuid?: string | null) {
  return `${CANVAS_SESSION_STORAGE_KEY_PREFIX}:${boardGuid ?? "default"}`;
}

function readStoredCanvasSession(boardGuid?: string | null): CanvasTldrawSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(getCanvasSessionStorageKey(boardGuid));
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as CanvasTldrawSession;
  } catch {
    return null;
  }
}

function writeStoredCanvasSession(session: CanvasTldrawSession, boardGuid?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getCanvasSessionStorageKey(boardGuid), JSON.stringify(session));
  } catch {
    // localStorage may be unavailable in restricted browser modes.
  }
}

function getImportablePaneItems(
  context: WorkspaceImportItem,
  layout: string | null,
  windows: TmuxWindow[],
): ImportablePaneItem[] {
  const parsed = parseTerminalLayoutDocument(layout);
  if (!parsed) {
    return [];
  }

  const existingWindowNames = new Set(windows.map((window) => window.name));
  const panes: ImportablePaneItem[] = [];

  for (const tab of parsed.layout.tabs) {
    for (const [paneId, pane] of Object.entries(tab.panes)) {
      const legacyTitle = (pane as { title?: string }).title;
      const tmuxWindowName = pane.tmuxWindowName || pane.label || legacyTitle || "";
      if (!tmuxWindowName || !existingWindowNames.has(tmuxWindowName)) {
        continue;
      }

      panes.push({
        key: `${context.key}:${tab.id}:${paneId}`,
        contextKey: context.key,
        scope: context.scope,
        contextId: context.contextId,
        projectName: pane.projectName || context.projectName,
        workspaceName: pane.workspaceName || context.workspaceName,
        localPath: context.localPath,
        terminalTabId: tab.id,
        terminalTabTitle: tab.title,
        paneId,
        terminalName: pane.label || legacyTitle || tmuxWindowName,
        tmuxWindowName,
      });
    }
  }

  return panes;
}

function createImportedPaneProps(item: ImportablePaneItem): CanvasTerminalShape["props"] {
  return createCanvasTerminalShapeProps({
    contextScope: item.scope,
    workspaceId: item.contextId,
    projectName: item.projectName,
    workspaceName: item.workspaceName,
    localPath: item.localPath,
    terminalName: item.terminalName,
    tmuxWindowName: item.tmuxWindowName,
    isNewTerminal: false,
  });
}

function createSessionTerminalProps(session: ActiveSessionInfo): CanvasTerminalShape["props"] | null {
  const tmuxWindowName = session.tmux_window_name || session.terminal_name || "";
  if (!tmuxWindowName) {
    return null;
  }

  return createCanvasTerminalShapeProps({
    contextScope: session.context_scope,
    workspaceId: session.workspace_id,
    projectName: session.project_name || "Workspace",
    workspaceName: session.workspace_name || "Main",
    localPath: session.cwd || "",
    terminalName: tmuxWindowName,
    tmuxWindowName,
    isNewTerminal: false,
  });
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

type CanvasCardThemeStyle = React.CSSProperties & {
  "--canvas-card-bg": string;
  "--canvas-card-panel-bg": string;
  "--canvas-card-border": string;
  "--canvas-card-text": string;
  "--canvas-card-muted": string;
  "--canvas-card-hover-bg": string;
  "--canvas-card-shadow": string;
};

function CanvasTerminalCardInner({ shape }: { shape: CanvasTerminalShape }) {
  const [sessionId] = React.useState(() => crypto.randomUUID());
  const [dynamicTitle, setDynamicTitle] = React.useState<string | undefined>(undefined);
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
  const isSelected = useValue(
    "canvas-card-selected",
    () => editor.getSelectedShapeIds().includes(shape.id as TLShapeId),
    [editor, shape.id],
  );
  const colorMode = useValue("canvas-card-color-mode", () => editor.getColorMode(), [editor]);
  const themeColors = useValue(
    "canvas-card-theme-colors",
    () => editor.getCurrentTheme().colors[editor.getColorMode()],
    [editor],
  );
  const isActive = activeShapeId === shape.id;
  const isRendered = renderedShapeIds.includes(shape.id);
  const { displayTitle, toolbarAgent } = React.useMemo(
    () => {
      const shapeAgent = configuredAgents.find(
        (agent) => agent.label.trim().toLowerCase() === shape.props.terminalName.trim().toLowerCase(),
      );

      return getTerminalDisplayMeta({
        baseTitle: shape.props.terminalName,
        dynamicTitle,
        configuredAgents,
        agent: shapeAgent,
      });
    },
    [dynamicTitle, shape.props.terminalName, configuredAgents],
  );
  const cardThemeStyle = React.useMemo<CanvasCardThemeStyle>(() => {
    const isFocused = isActive || isSelected;

    return {
      "--canvas-card-bg": themeColors.solid,
      "--canvas-card-panel-bg": themeColors.background,
      "--canvas-card-border": isFocused ? themeColors.selectionStroke : themeColors.noteBorder,
      "--canvas-card-text": themeColors.text,
      "--canvas-card-muted": `var(--muted-foreground, ${themeColors.text})`,
      "--canvas-card-hover-bg": `var(--accent, ${themeColors.background})`,
      "--canvas-card-shadow": isFocused
        ? `0 0 0 1px ${themeColors.selectionStroke}, 0 0 0 6px ${themeColors.selectionFill}, 0 18px 40px rgba(0, 0, 0, 0.24)`
        : colorMode === "dark"
          ? "0 14px 36px rgba(0, 0, 0, 0.42)"
          : "0 12px 30px rgba(15, 23, 42, 0.14)",
    };
  }, [colorMode, isActive, isSelected, themeColors]);

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
      editor.markEventAsHandled(event);
      event.stopPropagation();
    };

    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      host.removeEventListener("wheel", handleWheel);
    };
  }, [editor]);

  const handleRevealSource = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      router.push(
        shape.props.contextScope === "project"
          ? `/project?id=${shape.props.workspaceId}`
          : `/workspace?id=${shape.props.workspaceId}`,
      );
    },
    [router, shape.props.contextScope, shape.props.workspaceId],
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
      className="flex h-full flex-col overflow-hidden rounded-[20px] border bg-[var(--canvas-card-bg)] text-[var(--canvas-card-text)]"
      style={{ ...cardThemeStyle, boxShadow: "var(--canvas-card-shadow)" }}
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-[var(--canvas-card-border)] bg-[var(--canvas-card-panel-bg)] px-4 py-3"
        onPointerDown={() => {
          activateTerminal();
        }}
      >
        <div className="min-w-0 flex items-center gap-2">
          <TerminalTitleWithAgent
            displayTitle={displayTitle}
            toolbarAgent={toolbarAgent}
            className="text-sm font-semibold text-[var(--canvas-card-text)]"
          />
          <span className="text-xs whitespace-nowrap text-[var(--canvas-card-muted)]">
            ({shape.props.projectName} · {shape.props.workspaceName})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {shape.props.isPinned && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleUnpin}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--canvas-card-border)] px-2 text-[11px] text-[var(--canvas-card-muted)] transition-colors hover:bg-[var(--canvas-card-hover-bg)] hover:text-[var(--canvas-card-text)]"
            >
              Unpin
              <PinOff className="size-3" />
            </button>
          )}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleRevealSource}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--canvas-card-border)] px-2 text-[11px] text-[var(--canvas-card-muted)] transition-colors hover:bg-[var(--canvas-card-hover-bg)] hover:text-[var(--canvas-card-text)]"
          >
            Source
            <ArrowUpRight className="size-3" />
          </button>
        </div>
      </div>
      <div
        ref={terminalHostRef}
        className="min-h-0 flex-1 bg-[var(--canvas-card-bg)]"
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
            onTitleChange={setDynamicTitle}
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
            <SquareTerminal className="size-8 text-[var(--canvas-card-muted)]" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-[var(--canvas-card-text)]">
                {isSelected
                  ? "Activate this card to open the live terminal"
                  : "Select this card to activate the live terminal"}
              </div>
              <div className="text-xs text-[var(--canvas-card-muted)]">
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
 * - Atmos is the source of truth: whenever `theme` changes the tldraw
 *   colorScheme is updated to match.
 * - Users can still pick a different theme from tldraw's own menu; that
 *   choice persists (tldraw writes it to localStorage) until Atmos theme
 *   changes again.
 */
function CanvasThemeBridge() {
  const editor = useEditor();
  const { theme } = useTheme();

  React.useEffect(() => {
    if (!editor || !theme) return;
    const colorScheme: "light" | "dark" | "system" =
      theme === "dark" ? "dark" : theme === "light" ? "light" : "system";
    const current = editor.user.getUserPreferences().colorScheme;
    if (current === colorScheme) return;
    editor.user.updateUserPreferences({ colorScheme });
  }, [editor, theme]);

  return null;
}

export const CanvasView: React.FC<CanvasViewProps> = ({ trailingActions }) => {
  const { board, document, isLoading, isSaving, error, loadBoard } = useCanvasBoard();
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [isManualSaving, setIsManualSaving] = React.useState(false);
  const projects = useProjectStore((state) => state.projects);
  const isProjectsLoading = useProjectStore((state) => state.isLoading);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
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
  const { resolvedTheme } = useTheme();
  const needsTrafficLightsPadding = useDesktopTrafficLightsPadding();
  const [overview, setOverview] = React.useState<TerminalOverviewResponse | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = React.useState(false);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const editorRef = React.useRef<Editor | null>(null);
  const [editorReady, setEditorReady] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [selectedContextKey, setSelectedContextKey] = React.useState<string | null>(null);
  const [contextPaneState, setContextPaneState] = React.useState<Record<string, ContextPaneState>>({});
  const [agentCustomSettings, setAgentCustomSettings] = React.useState<Record<string, { cmd?: string; flags?: string; enabled?: boolean }>>({});
  const [customAgents, setCustomAgents] = React.useState<CodeAgentCustomEntry[]>([]);
  const [agentSettingsLoading, setAgentSettingsLoading] = React.useState(false);
  const documentSaveInFlightRef = React.useRef(false);
  const sessionSaveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSessionRef = React.useRef<CanvasTldrawSession | null>(null);
  const sessionDirtyRef = React.useRef(false);
  const autoSaveIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const hydratedRenderedBoardKeyRef = React.useRef<string | null>(null);
  const spawnIndexRef = React.useRef(0);
  const sharePanelRef = React.useRef<React.ReactNode>(null);
  const shapeUtils = React.useMemo(() => [CanvasTerminalShapeUtil], []);
  const tldrawThemes = React.useMemo(() => createAtmosTldrawThemes(), [resolvedTheme]);
  const tldrawComponents = React.useMemo<TLComponents>(
    () => ({
      SharePanel: () => <>{sharePanelRef.current}</>,
    }),
    [],
  );

  const workspaceItems = React.useMemo(() => getWorkspaceImportItems(projects), [projects]);
  const initialSnapshot = React.useMemo(
    () => createCanvasSnapshot(document?.tldrawDocument ?? null, readStoredCanvasSession(board?.guid)),
    [board?.guid, document?.tldrawDocument],
  );
  const attachableSessions = React.useMemo(
    () =>
      (overview?.active_sessions ?? []).filter(
        (session) =>
          session.session_type === "tmux" && (session.terminal_name || session.tmux_window_index != null),
      ),
    [overview],
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

  const loadOverview = React.useCallback(async () => {
    setIsOverviewLoading(true);
    setOverviewError(null);
    try {
      const nextOverview = await systemApi.getTerminalOverview();
      setOverview(nextOverview);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : "Failed to load active terminal sessions");
    } finally {
      setIsOverviewLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!projects.length && !isProjectsLoading) {
      void fetchProjects();
    }
  }, [fetchProjects, isProjectsLoading, projects.length]);

  React.useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

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
    pendingSessionRef.current = readStoredCanvasSession(board?.guid);
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
    setSelectedContextKey(null);
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
          writeStoredCanvasSession(pendingSessionRef.current, board?.guid);
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

  const placeTerminalShape = React.useCallback(
    (props: CanvasTerminalShape["props"]) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      spawnIndexRef.current += 1;
      const offset = (spawnIndexRef.current - 1) % 8;
      const viewportCenter = editor.getViewportPageBounds().center;
      const attachedAt = Date.now();
      const shapeProps: CanvasTerminalShape["props"] = {
        ...props,
        lastAttachedAt: attachedAt,
      };

      const shapeId = `shape:${crypto.randomUUID()}` as TLShapeId;

      editor.createShape({
        id: shapeId,
        type: CANVAS_TERMINAL_SHAPE_TYPE,
        x: viewportCenter.x - props.w / 2 + offset * 44,
        y: viewportCenter.y - props.h / 2 + offset * 44,
        props: shapeProps,
      });
      editor.select(shapeId);
      setActiveShapeId(shapeId);
      setRenderedShapeIds(
        promoteRenderedShapeId(
          getCanvasTerminalShapes(editor),
          useCanvasRuntime.getState().renderedShapeIds,
          shapeId,
          attachedAt,
          maxRenderedTerminals,
        ),
      );

      const snapshot = getSnapshot(editor.store) as TLEditorSnapshot;
      scheduleSessionSave(snapshot.session);
    },
    [maxRenderedTerminals, scheduleSessionSave, setActiveShapeId, setRenderedShapeIds],
  );

  const loadContextPanes = React.useCallback(async (item: WorkspaceImportItem) => {
    setContextPaneState((current) => ({
      ...current,
      [item.key]: {
        status: "loading",
        panes: current[item.key]?.panes ?? [],
        error: null,
      },
    }));

    try {
      const layoutApi = item.scope === "project" ? projectLayoutApi : workspaceLayoutApi;
      const [layoutResponse, tmuxResponse] = await Promise.all([
        layoutApi.getLayout(item.contextId),
        systemApi.listTmuxWindows(item.contextId),
      ]);
      const panes = getImportablePaneItems(item, layoutResponse.layout, tmuxResponse.windows);
      setContextPaneState((current) => ({
        ...current,
        [item.key]: {
          status: "loaded",
          panes,
          error: null,
        },
      }));
    } catch (err) {
      setContextPaneState((current) => ({
        ...current,
        [item.key]: {
          status: "error",
          panes: [],
          error: err instanceof Error ? err.message : "Failed to load saved panes",
        },
      }));
    }
  }, []);

  const handleToggleContext = React.useCallback(
    (item: WorkspaceImportItem) => {
      setSelectedContextKey((current) => (current === item.key ? null : item.key));
      const currentState = contextPaneState[item.key];
      if (!currentState || currentState.status === "idle") {
        void loadContextPanes(item);
      }
    },
    [contextPaneState, loadContextPanes],
  );

  const handleImportSavedPane = React.useCallback(
    (item: ImportablePaneItem) => {
      placeTerminalShape(createImportedPaneProps(item));
    },
    [placeTerminalShape],
  );

  const handleImportSession = React.useCallback(
    (session: ActiveSessionInfo) => {
      const props = createSessionTerminalProps(session);
      if (!props) {
        toastManager.add({
          title: "Canvas",
          description: "This session cannot be attached to the canvas yet",
          type: "error",
        });
        return;
      }

      placeTerminalShape(props);
    },
    [placeTerminalShape],
  );

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
  const sharePanelContent = (
    <div className="pointer-events-auto flex items-center gap-2 p-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCreateFrame}
        className="rounded-xl bg-background/95 shadow-sm"
        title="Create an empty frame"
      >
        <Frame className="mr-1 size-4" />
        Create Frame
      </Button>
      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-xl bg-background/95 shadow-sm"
            title="Import terminal — Click to import from saved layouts or active tmux sessions"
          >
            <Plus className="size-4" />
          </Button>
        </DialogTrigger>
            <DialogContent className="w-full sm:max-w-3xl max-h-[90vh] z-[2147483647] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Import Terminal</DialogTitle>
                <DialogDescription>
                  Import terminals from saved project/workspace layouts or attach active tmux sessions to the
                  canvas.
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[calc(90vh-10rem)]">
                <div className="space-y-6 p-6">
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <SquareTerminal className="size-4" />
                      Import saved terminal panes
                    </div>
                    {selectedContextKey ? (
                      <div className="space-y-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedContextKey(null)}
                          className="mb-2"
                        >
                          ← Back to projects/workspaces
                        </Button>
                        {contextPaneState[selectedContextKey]?.status === "loading" ? (
                          <div className="flex items-center justify-center rounded-lg border border-dashed border-border px-3 py-4">
                            <DefaultSpinner />
                          </div>
                        ) : contextPaneState[selectedContextKey]?.status === "error" ? (
                          <div className="rounded-lg border border-dashed border-warning/30 bg-warning/5 px-3 py-3 text-sm text-warning">
                            {contextPaneState[selectedContextKey]?.error}
                          </div>
                        ) : contextPaneState[selectedContextKey]?.panes.length ? (
                          contextPaneState[selectedContextKey]?.panes.map((pane) => (
                            <button
                              key={pane.key}
                              type="button"
                              onClick={() => {
                                handleImportSavedPane(pane);
                                setIsImportModalOpen(false);
                              }}
                              className="w-full rounded-lg border border-border bg-background px-3 py-3 text-left transition-colors hover:bg-accent"
                            >
                              <div className="truncate text-sm font-medium text-foreground">{pane.terminalName}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {pane.tmuxWindowName}
                                {pane.terminalTabTitle && pane.terminalTabTitle !== "Term"
                                  ? ` · ${pane.terminalTabTitle}`
                                  : ""}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                            No saved attachable panes in this context yet.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(() => {
                          const groupedByProject: Record<string, WorkspaceImportItem[]> = {};
                          workspaceItems.forEach((item) => {
                            if (!groupedByProject[item.projectName]) {
                              groupedByProject[item.projectName] = [];
                            }
                            groupedByProject[item.projectName].push(item);
                          });

                          return Object.entries(groupedByProject).map(([projectName, items]) => (
                            <div key={projectName} className="space-y-2">
                              <div className="flex items-center gap-2 px-2">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-xs font-semibold text-muted-foreground">{projectName}</span>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                              <div className="grid gap-2 pl-2">
                                {items.map((item) => (
                                  <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => handleToggleContext(item)}
                                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-accent"
                                  >
                                    <div className="truncate text-sm font-medium text-foreground">
                                      {item.workspaceName}
                                    </div>
                                    {item.localPath && (
                                      <div className="truncate text-xs text-muted-foreground">{item.localPath}</div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ));
                        })()}
                        {!workspaceItems.length && (
                          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                            No projects or workspaces loaded yet.
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <RotateCw className="size-4" />
                      Attach active tmux sessions
                    </div>
                    {overviewError ? (
                      <div className="rounded-xl border border-dashed border-warning/30 bg-warning/5 px-3 py-4 text-sm text-warning">
                        {overviewError}
                      </div>
                    ) : isOverviewLoading && !overview ? (
                      <div className="flex items-center justify-center rounded-xl border border-dashed border-border px-3 py-6">
                        <DefaultSpinner />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {attachableSessions.map((session) => (
                          <button
                            key={session.session_id}
                            type="button"
                            onClick={() => {
                              handleImportSession(session);
                              setIsImportModalOpen(false);
                            }}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-accent"
                          >
                            <div className="truncate text-sm font-medium text-foreground">
                              {session.terminal_name || `Window ${session.tmux_window_index}`}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {(session.project_name || "Workspace") + " · " + (session.workspace_name || "Main")}
                            </div>
                            {session.cwd && (
                              <div className="truncate pt-1 text-[11px] text-muted-foreground">{session.cwd}</div>
                            )}
                          </button>
                        ))}
                        {!attachableSessions.length && (
                          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                            No attachable tmux sessions are active right now.
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
      <Button
        variant="outline"
        size="icon"
        onClick={() => void loadOverview()}
        disabled={isOverviewLoading}
        className="size-9 rounded-xl bg-background/95 shadow-sm"
        title="Refresh active sessions"
      >
        {isOverviewLoading ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
      </Button>
      <Button
        variant="outline"
        onClick={() => void handleManualSave()}
        disabled={isManualSaving || documentSaveInFlightRef.current}
        className="group rounded-xl bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground w-[140px]"
      >
        {isManualSaving || isSaving ? (
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-3 animate-spin" />
            Saving…
          </span>
        ) : error ? (
          "Save failed"
        ) : (
          <>
            <span className="group-hover:hidden">
              Saved{lastSavedAt ? ` · ${lastSavedAt.toLocaleTimeString()}` : board?.updated_at ? ` · ${new Date(board.updated_at).toLocaleTimeString()}` : ""}
            </span>
            <span className="hidden group-hover:block">Save</span>
          </>
        )}
      </Button>
      {trailingActions}
    </div>
  );

  sharePanelRef.current = sharePanelContent;

  return (
    <div className={cn(
      "tldraw-wrapper relative h-full w-full overflow-hidden bg-background",
      needsTrafficLightsPadding && "pt-[52px]"
    )}>
      <CanvasAgentContext.Provider value={configuredAgents}>
        <Tldraw
          key={board?.guid || "canvas"}
          licenseKey={TLDRAW_LICENSE_KEY}
          snapshot={initialSnapshot ?? undefined}
          themes={tldrawThemes}
          shapeUtils={shapeUtils}
          components={tldrawComponents}
          onMount={(nextEditor) => {
            editorRef.current = nextEditor;
            setEditorReady(true);
          }}
        >
          <CanvasThemeBridge />
        </Tldraw>
      </CanvasAgentContext.Provider>
    </div>
  );
};

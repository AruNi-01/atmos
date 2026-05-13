"use client";

import React from "react";
import { useTheme } from "next-themes";
import {
  DefaultSpinner,
  HTMLContainer,
  BaseBoxShapeUtil,
  T,
  Tldraw,
  getSnapshot,
  useEditor,
  useValue,
  type Editor,
  type TLComponents,
  type TLEditorSnapshot,
  type TLBaseShape,
  type TLShapeId,
} from "tldraw";
import "tldraw/tldraw.css";
import "./tldraw-theme.css";
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
} from "@workspace/ui";
import {
  AlertTriangle,
  Loader2,
  LoaderCircle,
  RotateCw,
  SquareTerminal,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import {
  projectLayoutApi,
  systemApi,
  workspaceLayoutApi,
  type ActiveSessionInfo,
  type TerminalContextScope,
  type TerminalOverviewResponse,
  type TmuxWindow,
} from "@/api/rest-api";
import { useAppRouter } from "@/hooks/use-app-router";
import { useProjectStore } from "@/hooks/use-project-store";
import type { Project } from "@/types/types";
import { parseTerminalLayoutDocument } from "@/lib/terminal-layout-document";
import { Terminal } from "@/components/terminal/Terminal";
import { useCanvasRuntime } from "./use-canvas-runtime";
import { useCanvasBoard, type CanvasBoardDocument } from "./use-canvas-board";

const CANVAS_TERMINAL_SHAPE_TYPE = "canvas-terminal" as const;
const SAVE_DEBOUNCE_MS = 800;

type CanvasTerminalShape = TLBaseShape<
  typeof CANVAS_TERMINAL_SHAPE_TYPE,
  {
    w: number;
    h: number;
    contextScope: TerminalContextScope;
    workspaceId: string;
    projectName: string;
    workspaceName: string;
    localPath: string;
    terminalName: string;
    tmuxWindowName: string;
    isNewTerminal: boolean;
  }
>;

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

class CanvasTerminalShapeUtil extends BaseBoxShapeUtil<CanvasTerminalShape> {
  static override type = CANVAS_TERMINAL_SHAPE_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    contextScope: T.string,
    workspaceId: T.string,
    projectName: T.string,
    workspaceName: T.string,
    localPath: T.string,
    terminalName: T.string,
    tmuxWindowName: T.string,
    isNewTerminal: T.boolean,
  };

  override canEdit() {
    return false;
  }

  getDefaultProps(): CanvasTerminalShape["props"] {
    return {
      w: 720,
      h: 420,
      contextScope: "workspace",
      workspaceId: "",
      projectName: "",
      workspaceName: "",
      localPath: "",
      terminalName: "Canvas Terminal",
      tmuxWindowName: "Canvas Terminal",
      isNewTerminal: true,
    };
  }

  component(shape: CanvasTerminalShape) {
    return <CanvasTerminalCard shape={shape} />;
  }

  getIndicatorPath(shape: CanvasTerminalShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
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

function createCanvasDocument(snapshot: TLEditorSnapshot | null): CanvasBoardDocument {
  return {
    schema: "canvas.v1",
    boardSlug: "default",
    tldrawSnapshot: snapshot,
  };
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
  return {
    w: 720,
    h: 420,
    contextScope: item.scope,
    workspaceId: item.contextId,
    projectName: item.projectName,
    workspaceName: item.workspaceName,
    localPath: item.localPath,
    terminalName: item.terminalName,
    tmuxWindowName: item.tmuxWindowName,
    isNewTerminal: false,
  };
}

function createSessionTerminalProps(session: ActiveSessionInfo): CanvasTerminalShape["props"] | null {
  const tmuxWindowName = session.tmux_window_name || session.terminal_name || "";
  if (!tmuxWindowName) {
    return null;
  }

  return {
    w: 720,
    h: 420,
    contextScope: session.context_scope,
    workspaceId: session.workspace_id,
    projectName: session.project_name || "Workspace",
    workspaceName: session.workspace_name || "Main",
    localPath: session.cwd || "",
    terminalName: tmuxWindowName,
    tmuxWindowName,
    isNewTerminal: false,
  };
}

function CanvasTerminalCard({ shape }: { shape: CanvasTerminalShape }) {
  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: shape.props.w,
        height: shape.props.h,
      }}
    >
      <CanvasTerminalCardInner shape={shape} />
    </HTMLContainer>
  );
}

function CanvasTerminalCardInner({ shape }: { shape: CanvasTerminalShape }) {
  const [sessionId] = React.useState(() => crypto.randomUUID());
  const editor = useEditor();
  const router = useAppRouter();
  const activeShapeId = useCanvasRuntime((state) => state.activeShapeId);
  const setActiveShapeId = useCanvasRuntime((state) => state.setActiveShapeId);
  const isSelected = useValue(
    "canvas-card-selected",
    () => editor.getSelectedShapeIds().includes(shape.id as TLShapeId),
    [editor, shape.id],
  );
  const isActive = activeShapeId === shape.id;

  const markAttached = React.useCallback(() => {
    if (!shape.props.isNewTerminal) {
      return;
    }

    editor.updateShape({
      id: shape.id,
      type: CANVAS_TERMINAL_SHAPE_TYPE,
      props: {
        ...shape.props,
        isNewTerminal: false,
      },
    });
  }, [editor, shape]);

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

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-border bg-background shadow-lg">
      <div
        className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"
        onPointerDown={(event) => {
          setActiveShapeId(shape.id);
          event.stopPropagation();
        }}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{shape.props.terminalName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {shape.props.projectName} · {shape.props.workspaceName}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleRevealSource}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Source
            <ArrowUpRight className="size-3" />
          </button>
          <div className="truncate text-[11px] text-muted-foreground">{shape.props.tmuxWindowName}</div>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 bg-background"
        onPointerDown={(event) => {
          if (isActive) {
            event.stopPropagation();
          }
        }}
        onWheel={(event) => {
          event.stopPropagation();
        }}
      >
        {isActive ? (
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
            <SquareTerminal className="size-8 text-muted-foreground/60" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                {isSelected
                  ? "Activate this card to open the live terminal"
                  : "Select this card to activate the live terminal"}
              </div>
              <div className="text-xs text-muted-foreground">{shape.props.localPath || "Attached tmux window"}</div>
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
  const { board, document, isLoading, isSaving, error, loadBoard, saveDocument } = useCanvasBoard();
  const projects = useProjectStore((state) => state.projects);
  const isProjectsLoading = useProjectStore((state) => state.isLoading);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const setActiveShapeId = useCanvasRuntime((state) => state.setActiveShapeId);
  const resetRuntime = useCanvasRuntime((state) => state.reset);
  const [overview, setOverview] = React.useState<TerminalOverviewResponse | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = React.useState(false);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const editorRef = React.useRef<Editor | null>(null);
  const [editorReady, setEditorReady] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [selectedContextKey, setSelectedContextKey] = React.useState<string | null>(null);
  const [contextPaneState, setContextPaneState] = React.useState<Record<string, ContextPaneState>>({});
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = React.useRef(false);
  const needsResaveRef = React.useRef(false);
  const pendingSnapshotRef = React.useRef<TLEditorSnapshot | null>(document?.tldrawSnapshot ?? null);
  const spawnIndexRef = React.useRef(0);
  const sharePanelRef = React.useRef<React.ReactNode>(null);
  const shapeUtils = React.useMemo(() => [CanvasTerminalShapeUtil], []);
  const tldrawComponents = React.useMemo<TLComponents>(
    () => ({
      SharePanel: () => <>{sharePanelRef.current}</>,
    }),
    [],
  );

  const workspaceItems = React.useMemo(() => getWorkspaceImportItems(projects), [projects]);
  const attachableSessions = React.useMemo(
    () =>
      (overview?.active_sessions ?? []).filter(
        (session) =>
          session.session_type === "tmux" && (session.terminal_name || session.tmux_window_index != null),
      ),
    [overview],
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

  React.useEffect(() => {
    pendingSnapshotRef.current = document?.tldrawSnapshot ?? null;
  }, [document]);

  React.useEffect(() => {
    resetRuntime();
    setSelectedContextKey(null);
  }, [board?.guid, resetRuntime]);

  const flushSnapshotSave = React.useCallback(async () => {
    if (saveInFlightRef.current) {
      needsResaveRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    try {
      await saveDocument(createCanvasDocument(pendingSnapshotRef.current));
    } catch {
      toastManager.add({
        title: "Canvas",
        description: "Failed to save canvas changes",
        type: "error",
      });
    } finally {
      saveInFlightRef.current = false;
      if (needsResaveRef.current) {
        needsResaveRef.current = false;
        void flushSnapshotSave();
      }
    }
  }, [saveDocument]);

  const flushSnapshotSaveRef = React.useRef(flushSnapshotSave);
  flushSnapshotSaveRef.current = flushSnapshotSave;

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      void flushSnapshotSaveRef.current();
    };
  }, []);

  const scheduleSnapshotSave = React.useCallback(
    (snapshot: TLEditorSnapshot) => {
      pendingSnapshotRef.current = snapshot;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        void flushSnapshotSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSnapshotSave],
  );

  React.useEffect(() => {
    if (!editorReady) return;
    const editor = editorRef.current;
    if (!editor) return;

    const cleanup = editor.store.listen(() => {
      const selectedShapeIds = editor.getSelectedShapeIds();
      if (
        selectedShapeIds.length === 1 &&
        selectedShapeIds[0] !== useCanvasRuntime.getState().activeShapeId
      ) {
        setActiveShapeId(selectedShapeIds[0] as string);
      }
      scheduleSnapshotSave(getSnapshot(editor.store) as TLEditorSnapshot);
    });

    return cleanup;
  }, [editorReady, scheduleSnapshotSave, setActiveShapeId]);

  const placeTerminalShape = React.useCallback(
    (props: CanvasTerminalShape["props"]) => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      spawnIndexRef.current += 1;
      const offset = (spawnIndexRef.current - 1) % 8;
      const viewportCenter = editor.getViewportPageBounds().center;

      const shapeId = `shape:${crypto.randomUUID()}` as TLShapeId;

      editor.createShape({
        id: shapeId,
        type: CANVAS_TERMINAL_SHAPE_TYPE,
        x: viewportCenter.x - props.w / 2 + offset * 44,
        y: viewportCenter.y - props.h / 2 + offset * 44,
        props,
      });
      editor.select(shapeId);
      setActiveShapeId(shapeId);

      scheduleSnapshotSave(getSnapshot(editor.store) as TLEditorSnapshot);
    },
    [scheduleSnapshotSave, setActiveShapeId],
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
      <div className="rounded-xl border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
        {isSaving
          ? "Saving…"
          : error
            ? "Save failed"
            : `Saved${board?.updated_at ? ` · ${new Date(board.updated_at).toLocaleTimeString()}` : ""}`}
      </div>
      {trailingActions}
    </div>
  );

  sharePanelRef.current = sharePanelContent;

  return (
    <div className="tldraw-wrapper relative h-full w-full overflow-hidden bg-background">
      <Tldraw
        key={board?.guid || "canvas"}
        snapshot={document.tldrawSnapshot ?? undefined}
        shapeUtils={shapeUtils}
        components={tldrawComponents}
        onMount={(nextEditor) => {
          editorRef.current = nextEditor;
          setEditorReady(true);
        }}
      >
        <CanvasThemeBridge />
      </Tldraw>
    </div>
  );
};

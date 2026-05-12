"use client";

import React from "react";
import {
  DefaultSpinner,
  HTMLContainer,
  BaseBoxShapeUtil,
  T,
  Tldraw,
  getSnapshot,
  useEditor,
  useValue,
  type TLComponents,
  type TLUiOverrides,
  type Editor,
  type TLEditorSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";
import { Button, ScrollArea, toastManager } from "@workspace/ui";
import {
  AlertTriangle,
  Loader2,
  LoaderCircle,
  Map,
  NotebookText,
  RefreshCcw,
  SquareTerminal,
  ArrowUpRight,
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
import { Terminal } from "./Terminal";
import { useTerminalCanvasRuntime } from "./use-terminal-canvas-runtime";
import { useTerminalCanvasBoard, type TerminalCanvasBoardDocument } from "./use-terminal-canvas-board";

const TERMINAL_CARD_SHAPE_TYPE = "terminal-canvas-terminal" as const;
const SAVE_DEBOUNCE_MS = 800;
const TERMINAL_CANVAS_ALLOWED_TOOL_IDS = new Set(["select", "hand", "zoom", "text", "frame"]);
const TERMINAL_CANVAS_BLOCKED_ACTION_IDS = new Set([
  "change-page-next",
  "change-page-prev",
  "convert-to-bookmark",
  "copy-as-json",
  "copy-as-png",
  "copy-as-svg",
  "export-as-png",
  "export-as-svg",
  "insert-embed",
  "insert-media",
  "move-to-new-page",
]);
const TERMINAL_CANVAS_EXTERNAL_CONTENT_TYPES = ["embed", "excalidraw", "file-replace", "files", "svg-text", "tldraw", "url"] as const;

type TerminalCanvasTerminalShape = {
  id: string;
  type: typeof TERMINAL_CARD_SHAPE_TYPE;
  props: {
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
  };
};

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

class TerminalCanvasTerminalShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = TERMINAL_CARD_SHAPE_TYPE;

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

  getDefaultProps(): TerminalCanvasTerminalShape["props"] {
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

  component(shape: TerminalCanvasTerminalShape) {
    return <TerminalCanvasTerminalCard shape={shape} />;
  }

  getIndicatorPath(shape: TerminalCanvasTerminalShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}

const TERMINAL_CANVAS_UI_COMPONENTS: TLComponents = {
  ActionsMenu: null,
  ContextMenu: null,
  DebugMenu: null,
  DebugPanel: null,
  HelpMenu: null,
  KeyboardShortcutsDialog: null,
  MainMenu: null,
  Minimap: null,
  PageMenu: null,
  PeopleMenu: null,
  SharePanel: null,
  StylePanel: null,
};

const TERMINAL_CANVAS_UI_OVERRIDES: TLUiOverrides = {
  actions(_editor, actions) {
    return Object.fromEntries(
      Object.entries(actions).filter(([actionId]) => !TERMINAL_CANVAS_BLOCKED_ACTION_IDS.has(actionId)),
    );
  },
  tools(_editor, tools) {
    return Object.fromEntries(
      Object.entries(tools).filter(([toolId]) => TERMINAL_CANVAS_ALLOWED_TOOL_IDS.has(toolId)),
    );
  },
};

function disableUnsupportedExternalContent(editor: Editor) {
  for (const contentType of TERMINAL_CANVAS_EXTERNAL_CONTENT_TYPES) {
    editor.registerExternalContentHandler(contentType, async () => {});
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

function createCanvasDocument(snapshot: TLEditorSnapshot | null): TerminalCanvasBoardDocument {
  return {
    schema: "terminal-canvas.v1",
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

function createImportedPaneProps(item: ImportablePaneItem): TerminalCanvasTerminalShape["props"] {
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

function createSessionTerminalProps(session: ActiveSessionInfo): TerminalCanvasTerminalShape["props"] | null {
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

function TerminalCanvasTerminalCard({ shape }: { shape: TerminalCanvasTerminalShape }) {
  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: shape.props.w,
        height: shape.props.h,
      }}
    >
      <TerminalCanvasTerminalCardInner shape={shape} />
    </HTMLContainer>
  );
}

function TerminalCanvasTerminalCardInner({ shape }: { shape: TerminalCanvasTerminalShape }) {
  const [sessionId] = React.useState(() => crypto.randomUUID());
  const editor = useEditor();
  const router = useAppRouter();
  const activeShapeId = useTerminalCanvasRuntime((state) => state.activeShapeId);
  const setActiveShapeId = useTerminalCanvasRuntime((state) => state.setActiveShapeId);
  const isSelected = useValue("terminal-canvas-card-selected", () => editor.getSelectedShapeIds().includes(shape.id as any), [
    editor,
    shape.id,
  ]);
  const isActive = activeShapeId === shape.id;

  const markAttached = React.useCallback(() => {
    if (!shape.props.isNewTerminal) {
      return;
    }

    editor.updateShape({
      id: shape.id,
      type: TERMINAL_CARD_SHAPE_TYPE,
      props: {
        ...shape.props,
        isNewTerminal: false,
      },
    } as any);
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
          // Activate shape when clicking on the header
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
          // When card is inactive, clicking activates it
          // When card is active, clicking doesn't re-activate (to avoid focus loss)
          if (!isActive) {
            setActiveShapeId(shape.id);
          }
          // Always prevent propagation to tldraw
          event.stopPropagation();
        }}
        onWheel={(event) => {
          // Prevent scroll propagation to tldraw when scrolling inside the terminal
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
                title: "Terminal Canvas",
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
                {isSelected ? "Activate this card to open the live terminal" : "Select this card to activate the live terminal"}
              </div>
              <div className="text-xs text-muted-foreground">{shape.props.localPath || "Attached tmux window"}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const TerminalCanvasView: React.FC = () => {
  const { board, document, isLoading, isSaving, error, loadBoard, saveDocument } = useTerminalCanvasBoard();
  const projects = useProjectStore((state) => state.projects);
  const isProjectsLoading = useProjectStore((state) => state.isLoading);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const setActiveShapeId = useTerminalCanvasRuntime((state) => state.setActiveShapeId);
  const resetRuntime = useTerminalCanvasRuntime((state) => state.reset);
  const [overview, setOverview] = React.useState<TerminalOverviewResponse | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = React.useState(false);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<Editor | null>(null);
  const [expandedContextKey, setExpandedContextKey] = React.useState<string | null>(null);
  const [contextPaneState, setContextPaneState] = React.useState<Record<string, ContextPaneState>>({});
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = React.useRef(false);
  const needsResaveRef = React.useRef(false);
  const pendingSnapshotRef = React.useRef<TLEditorSnapshot | null>(document?.tldrawSnapshot ?? null);
  const spawnIndexRef = React.useRef(0);
  const tldrawComponents = React.useMemo<TLComponents>(
    () => ({
      ...TERMINAL_CANVAS_UI_COMPONENTS,
      LoadingScreen: () => (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ),
    }),
    [],
  );
  const shapeUtils = React.useMemo(() => [TerminalCanvasTerminalShapeUtil], []);

  const workspaceItems = React.useMemo(() => getWorkspaceImportItems(projects), [projects]);
  const attachableSessions = React.useMemo(
    () =>
      (overview?.active_sessions ?? []).filter(
        (session) => session.session_type === "tmux" && (session.terminal_name || session.tmux_window_index != null),
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
    setExpandedContextKey(null);
  }, [board?.guid, resetRuntime]);

  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

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
        title: "Terminal Canvas",
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
    if (!editor) {
      return;
    }

    const cleanup = editor.store.listen(() => {
      const selectedShapeIds = editor.getSelectedShapeIds();
      if (selectedShapeIds.length === 1 && selectedShapeIds[0] !== useTerminalCanvasRuntime.getState().activeShapeId) {
        setActiveShapeId(selectedShapeIds[0] as string);
      }
      scheduleSnapshotSave(getSnapshot(editor.store) as TLEditorSnapshot);
    });

    return cleanup;
  }, [editor, scheduleSnapshotSave, setActiveShapeId]);

  const placeTerminalShape = React.useCallback(
    (props: TerminalCanvasTerminalShape["props"]) => {
      if (!editor) {
        return;
      }

      spawnIndexRef.current += 1;
      const offset = (spawnIndexRef.current - 1) % 8;

      const shapeId = `shape:${crypto.randomUUID()}`;

      editor.createShape({
        id: shapeId,
        type: TERMINAL_CARD_SHAPE_TYPE,
        x: 120 + offset * 44,
        y: 120 + offset * 44,
        props,
      } as any);
      editor.select(shapeId as any);
      setActiveShapeId(shapeId);

      scheduleSnapshotSave(getSnapshot(editor.store) as TLEditorSnapshot);
    },
    [editor, scheduleSnapshotSave, setActiveShapeId],
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
      setExpandedContextKey((current) => (current === item.key ? null : item.key));
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
          title: "Terminal Canvas",
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
        <AlertTriangle className="size-12 text-amber-500" />
        <div>
          <div className="text-base font-semibold text-foreground">Failed to load Terminal Canvas</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </div>
        <Button variant="outline" onClick={() => void loadBoard()} className="cursor-pointer">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/50 px-8 py-6 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20">
              <Map className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">Terminal Canvas</h2>
              <p className="max-w-xl text-sm text-muted-foreground">
                Place cross-workspace terminals on an infinite canvas, add notes with tldraw tools, and organize them with frames.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => void loadOverview()}
              disabled={isOverviewLoading}
              className="h-10 w-10 rounded-xl bg-muted/20 shadow-sm"
              title="Refresh active sessions"
            >
              {isOverviewLoading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            </Button>
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
              {isSaving ? "Saving…" : error ? "Save failed" : `Saved${board?.updated_at ? ` · ${new Date(board.updated_at).toLocaleTimeString()}` : ""}`}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[320px] shrink-0 border-r border-border bg-muted/15">
          <ScrollArea className="h-full">
            <div className="space-y-6 p-5">
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <SquareTerminal className="size-4" />
                  Import saved terminal panes
                </div>
                <div className="space-y-2">
                  {workspaceItems.map((item) => (
                    <div key={item.key} className="rounded-xl border border-border bg-background">
                      <button
                        type="button"
                        onClick={() => handleToggleContext(item)}
                        className="w-full px-3 py-3 text-left transition-colors hover:bg-accent"
                      >
                        <div className="truncate text-sm font-medium text-foreground">{item.projectName}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.workspaceName}</div>
                        <div className="truncate pt-1 text-[11px] text-muted-foreground">{item.localPath}</div>
                      </button>
                      {expandedContextKey === item.key && (
                        <div className="space-y-2 border-t border-border px-3 py-3">
                          {contextPaneState[item.key]?.status === "loading" ? (
                            <div className="flex items-center justify-center rounded-lg border border-dashed border-border px-3 py-4">
                              <DefaultSpinner />
                            </div>
                          ) : contextPaneState[item.key]?.status === "error" ? (
                            <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm text-amber-700 dark:text-amber-300">
                              {contextPaneState[item.key]?.error}
                            </div>
                          ) : contextPaneState[item.key]?.panes.length ? (
                            contextPaneState[item.key]?.panes.map((pane) => (
                              <button
                                key={pane.key}
                                type="button"
                                onClick={() => handleImportSavedPane(pane)}
                                className="w-full rounded-lg border border-border bg-background px-3 py-3 text-left transition-colors hover:bg-accent"
                              >
                                <div className="truncate text-sm font-medium text-foreground">{pane.terminalName}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {pane.tmuxWindowName}
                                  {pane.terminalTabTitle && pane.terminalTabTitle !== "Term" ? ` · ${pane.terminalTabTitle}` : ""}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                              No saved attachable panes in this context yet.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {!workspaceItems.length && (
                    <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                      No projects or workspaces loaded yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <RefreshCcw className="size-4" />
                  Attach active tmux sessions
                </div>
                {overviewError ? (
                  <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-4 text-sm text-amber-700 dark:text-amber-300">
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
                        onClick={() => handleImportSession(session)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-3 text-left transition-colors hover:bg-accent"
                      >
                        <div className="truncate text-sm font-medium text-foreground">
                          {session.terminal_name || `Window ${session.tmux_window_index}`}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {(session.project_name || "Workspace") + " · " + (session.workspace_name || "Main")}
                        </div>
                        {session.cwd && <div className="truncate pt-1 text-[11px] text-muted-foreground">{session.cwd}</div>}
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

              <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <NotebookText className="size-4" />
                  Quick tips
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Use the text tool for plain-text notes and the frame tool for lightweight grouping.</li>
                  <li>Select a terminal card to resize it with the standard canvas handles.</li>
                  <li>Import from saved project or workspace layouts to attach existing panes without creating new ownership.</li>
                </ul>
              </section>
            </div>
          </ScrollArea>
        </aside>

        <div className="min-h-0 min-w-0 flex-1 bg-muted/10 p-4">
          <div className="h-full overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            <Tldraw
              key={board?.guid || "terminal-canvas"}
              snapshot={document.tldrawSnapshot ?? undefined}
              overrides={TERMINAL_CANVAS_UI_OVERRIDES}
              shapeUtils={shapeUtils}
              onMount={(nextEditor) => {
                disableUnsupportedExternalContent(nextEditor);
                setEditor(nextEditor);
              }}
              components={tldrawComponents}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

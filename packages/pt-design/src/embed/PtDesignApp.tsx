"use client";

import React from "react";
import { defaultNodeFor } from "../components/registry";
import { createId } from "../core/ids";
import {
  localStoragePersistence,
  type DesignLibrary,
  type DesignLibraryItem,
  type HandoffSink,
  type PersistenceAdapter,
  type PtPersistV2,
  type PtTheme,
} from "../host/adapters";
import { catalogListFromRegistry } from "../agent/session-tools";
import { allToolDefs, liveBoardToolNames, unknownToolMessage, type ToolName } from "../agent/tool-defs";
import { PtDesignError, type HandleElement, type PtDocument } from "../protocol";
import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "../catalog/shadcn-list";
import { chromeTokens, resolveBoardTheme } from "./chrome";
import { agentInvokeUrl, normalizeAgentApiBase } from "./agent-prompt";
import { createLiveBoard, type LiveBoard } from "./live-board";
import { OverlayHost } from "./overlay";
import { SelectionPropsRail } from "./SelectionPropsRail";
import {
  applySelectionNodePatch,
  selectedNodeIdFromBoardSelection,
  selectionPropGroups,
  selectionPropPatch,
  type SelectionPropGroup,
} from "./selection-props";
import { ModeToggle, Palette, type DesignMode } from "../editor";
import { catalogPlaceAt, PLACE_VIEWPORT_CHROME, sceneViewportRect } from "../editor/place-clear";
import {
  excalidrawElementsToScene,
  keepOverlayThroughEmptyLoad,
  sameOverlayDocument,
  sameOverlayViewport,
  sceneToExcalidrawElements,
  type ExcalidrawCompatElement,
} from "./scene-bridge";
import { captureLiveScreenshot } from "./screenshot";
import { useExcalidrawCollab } from "./use-collab";
import { resolveShareCopy, type ShareCopy } from "./SharePopover";
import { defaultDesignName, LibraryOverlay } from "./LibraryOverlay";
import type { ExcalidrawHostApi } from "./ExcalidrawBoard";

export type { ShareCopy };

export type AgentBridgeDispatch = {
  request_id: string;
  tool: string;
  args?: Record<string, unknown>;
  client_id?: string;
};

export type AgentBridge = {
  register: (payload: { client_id: string; label?: string }) => Promise<void> | void;
  unregister: (clientId: string) => Promise<void> | void;
  subscribe: (handler: (dispatch: AgentBridgeDispatch) => void) => () => void;
  reply: (result: {
    request_id: string;
    success: boolean;
    error_code?: string;
    error_message?: string;
    recoverable?: boolean;
    data?: unknown;
  }) => Promise<void> | void;
};

export type PtDesignHostAction = {
  nodeId: string;
  event: "click" | "change";
  action: { type: "agent"; name: string };
};

export type PtDesignAppProps = {
  persistence?: PersistenceAdapter;
  handoff?: HandoffSink;
  theme?: PtTheme;
  className?: string;
  storageKey?: string;
  username?: string;
  shareCopy?: Partial<ShareCopy>;
  collabServerUrl?: string;
  library?: DesignLibrary;
  agentBridge?: AgentBridge;
  clientId?: string;
  modeLabels?: { edit: string; interact: string };
  onAction?: (payload: PtDesignHostAction) => void;
};

const ExcalidrawBoard = React.lazy(() => import("./ExcalidrawBoard"));

const EMPTY_DOC: PtDocument = { version: "ptx/1", pages: [{ id: "page", nodes: [] }] };

function emptyOverlayState() {
  return { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewModeEnabled: false };
}

function canvasDump(api: ExcalidrawHostApi): { elements: readonly unknown[]; appState: Record<string, unknown> } {
  const app = api.getAppState();
  return {
    elements: api.getSceneElementsIncludingDeleted(),
    appState: {
      scrollX: app.scrollX,
      scrollY: app.scrollY,
      zoom: app.zoom,
      viewBackgroundColor: app.viewBackgroundColor,
      selectedElementIds: app.selectedElementIds,
      viewModeEnabled: app.viewModeEnabled,
    },
  };
}

function asHandles(elements: readonly unknown[]): HandleElement[] {
  return elements as HandleElement[];
}

function createPersistDebouncer(save: (doc: PtPersistV2) => void | Promise<void>, delay = 250) {
  let cancel: ReturnType<typeof setTimeout> | null = null;
  let latest: PtPersistV2 | null = null;
  return {
    schedule(doc: PtPersistV2) {
      latest = doc;
      if (cancel) clearTimeout(cancel);
      cancel = setTimeout(() => {
        cancel = null;
        if (!latest) return;
        const next = latest;
        latest = null;
        void save(next);
      }, delay);
    },
    flush() {
      if (cancel) clearTimeout(cancel);
      cancel = null;
      if (!latest) return;
      const next = latest;
      latest = null;
      void save(next);
    },
  };
}

function errorCodeOf(error: unknown): string {
  if (error instanceof PtDesignError) return error.code;
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return "unknown_tool";
}

export function PtDesignApp({
  persistence,
  handoff,
  theme,
  className,
  storageKey = "pt-design/v2/default",
  username,
  shareCopy,
  collabServerUrl,
  library,
  agentBridge,
  clientId = "default",
  modeLabels,
  onAction,
}: PtDesignAppProps) {
  const persist = React.useMemo(
    () => persistence ?? localStoragePersistence(storageKey),
    [persistence, storageKey],
  );
  const apiRef = React.useRef<ExcalidrawHostApi | null>(null);
  const liveBoardRef = React.useRef<LiveBoard | null>(null);
  const loadingRef = React.useRef(false);
  const loadSettledRef = React.useRef(false);
  const persistRef = React.useRef(persist);
  persistRef.current = persist;
  const [boardReady, setBoardReady] = React.useState(false);
  const [mode, setMode] = React.useState<DesignMode>("edit");
  const [overlayDoc, setOverlayDoc] = React.useState<PtDocument>(EMPTY_DOC);
  const [overlayState, setOverlayState] = React.useState(emptyOverlayState);
  const overlayDocRef = React.useRef(overlayDoc);
  const overlayStateRef = React.useRef(overlayState);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [libraryMode, setLibraryMode] = React.useState<"save" | "open" | null>(null);
  const [libraryItems, setLibraryItems] = React.useState<DesignLibraryItem[]>([]);
  const [libraryError, setLibraryError] = React.useState<string | null>(null);
  const [libraryFile, setLibraryFile] = React.useState<string | null>(() => {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(`${storageKey}:file`);
  });
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const selectedNodeIdRef = React.useRef<string | null>(null);
  selectedNodeIdRef.current = selectedNodeId;
  const boardTheme = resolveBoardTheme(theme);
  const chrome = chromeTokens(boardTheme);
  const shareLabels = resolveShareCopy(shareCopy);

  const syncOverlay = React.useCallback((document: PtDocument, nextState: ReturnType<typeof emptyOverlayState>) => {
    if (!sameOverlayDocument(overlayDocRef.current, document)) {
      overlayDocRef.current = document;
      setOverlayDoc(document);
    }
    if (!sameOverlayViewport(overlayStateRef.current, nextState)) {
      overlayStateRef.current = nextState;
      setOverlayState(nextState);
    }
  }, []);

  const attachHost = React.useCallback((api: ExcalidrawHostApi) => {
    apiRef.current = api;
    loadingRef.current = true;
    loadSettledRef.current = false;
    liveBoardRef.current = createLiveBoard({
      getSceneElements: () => asHandles(api.getSceneElementsIncludingDeleted()),
      getAppState: () => api.getAppState(),
      updateScene: (opts) => {
        api.updateScene({
          ...(opts.elements ? { elements: opts.elements } : {}),
          ...(opts.appState ? { appState: opts.appState } : {}),
          captureUpdate: opts.captureUpdate,
        });
      },
      history: { clear: () => api.history.clear() },
      addFiles: (files) => {
        api.addFiles?.(files);
      },
    });
    setBoardReady(true);
  }, []);

  React.useEffect(() => {
    if (!boardReady) return;
    const api = apiRef.current;
    const board = liveBoardRef.current;
    if (!api || !board) return;
    let cancelled = false;
    void persist.load().then((loaded) => {
      if (cancelled || !apiRef.current || !liveBoardRef.current) return;
      loadingRef.current = true;
      loadSettledRef.current = false;
      try {
        liveBoardRef.current.loadPersist(loaded);
        const app = api.getAppState();
        syncOverlay(liveBoardRef.current.extract(), {
          scrollX: app.scrollX,
          scrollY: app.scrollY,
          zoom: app.zoom,
          viewModeEnabled: app.viewModeEnabled ?? false,
        });
      } finally {
        loadSettledRef.current = true;
        if (!loaded?.ptx) {
          loadingRef.current = false;
          liveBoardRef.current?.disarmLoadRecover();
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [boardReady, persist, syncOverlay]);

  const persistDebouncer = React.useMemo(
    () => createPersistDebouncer((doc) => persistRef.current.save(doc)),
    [],
  );

  React.useEffect(() => () => persistDebouncer.flush(), [persistDebouncer]);

  const applyRemoteElements = React.useCallback((elements: readonly unknown[]) => {
    const board = liveBoardRef.current;
    const api = apiRef.current;
    if (!board || !api) return;
    loadingRef.current = true;
    try {
      const app = api.getAppState();
      syncOverlay(board.extract(), {
        scrollX: app.scrollX,
        scrollY: app.scrollY,
        zoom: app.zoom,
        viewModeEnabled: app.viewModeEnabled ?? false,
      });
    } finally {
      loadingRef.current = false;
    }
    void elements;
  }, [syncOverlay]);

  const collab = useExcalidrawCollab({
    api: apiRef.current,
    username,
    serverUrl: collabServerUrl,
    getElements: () => apiRef.current?.getSceneElementsIncludingDeleted() ?? [],
    applyRemoteElements,
  });
  const agentApiBase = normalizeAgentApiBase(collabServerUrl);

  const handleBoardChange = React.useCallback(
    (
      elements: readonly ExcalidrawCompatElement[],
      appState: {
        viewBackgroundColor: string;
        selectedElementIds: Record<string, boolean>;
        scrollX: number;
        scrollY: number;
        zoom: { value: number };
        width: number;
        height: number;
        viewModeEnabled?: boolean;
      },
    ) => {
      const board = liveBoardRef.current;
      const api = apiRef.current;
      if (!board) return;
      const selectedIds = Object.entries(appState.selectedElementIds)
        .filter(([, on]) => on)
        .map(([id]) => id);
      const nodeId = selectedNodeIdFromBoardSelection({
        elements: asHandles(elements),
        selectedIds,
        previousNodeId: selectedNodeIdRef.current,
      });
      if (selectedNodeIdRef.current !== nodeId) {
        selectedNodeIdRef.current = nodeId;
        setSelectedNodeId(nodeId);
      }
      const { echo, document } = board.onHostChange();
      if (!keepOverlayThroughEmptyLoad(overlayDocRef.current, document, loadingRef.current)) {
        syncOverlay(document, {
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom,
          viewModeEnabled: appState.viewModeEnabled ?? false,
        });
      }
      if (echo || loadingRef.current) {
        if (!echo && loadSettledRef.current) {
          loadingRef.current = false;
          board.disarmLoadRecover();
        }
        if (echo || loadingRef.current) return;
      }
      collab.broadcastScene(elements);
      if (api) {
        persistDebouncer.schedule({
          ptx: board.extractPtx(),
          canvas: canvasDump(api),
          files: api.getFiles?.(),
        });
      }
    },
    [collab.broadcastScene, persistDebouncer, syncOverlay],
  );

  const onModeChange = React.useCallback((next: DesignMode) => {
    setMode(next);
    liveBoardRef.current?.setMode(next);
    const nextState = { ...overlayStateRef.current, viewModeEnabled: next === "interact" };
    overlayStateRef.current = nextState;
    setOverlayState(nextState);
  }, []);

  const onPaletteInsert = React.useCallback((
    type: Parameters<typeof defaultNodeFor>[0],
    variant?: string,
  ) => {
    const api = apiRef.current;
    const board = liveBoardRef.current;
    if (!api || !board) return;
    const id = createId("pt");
    const node = defaultNodeFor(type, id);
    if (variant) node.props = { ...node.props, variant };
    const current = board.extract();
    const page = current.pages[0] ?? { id: "page", nodes: [] };
    const at = catalogPlaceAt(
      page.nodes,
      { w: node.width, h: node.height },
      sceneViewportRect(api.getAppState(), PLACE_VIEWPORT_CHROME),
    );
    node.x = at.x;
    node.y = at.y;
    board.applyDocument(
      {
        version: current.version,
        pages: [{ id: page.id, nodes: [...page.nodes, node] }],
      },
      "IMMEDIATELY",
    );
  }, []);

  const onOverlayCommit = React.useCallback((doc: PtDocument) => {
    liveBoardRef.current?.applyDocument(doc, "NEVER");
  }, []);

  const onOverlayAction = React.useCallback(
    (payload: PtDesignHostAction) => {
      onAction?.(payload);
    },
    [onAction],
  );

  const applySelectionPatch = React.useCallback((group: SelectionPropGroup, optionId: string) => {
    const board = liveBoardRef.current;
    const nodeId = selectedNodeIdRef.current;
    if (!board || !nodeId) return;
    const patch = selectionPropPatch(group, optionId);
    if (!patch) return;
    const current = board.extract();
    const page = current.pages[0];
    if (!page) return;
    board.applyDocument(
      {
        version: current.version,
        pages: [
          {
            id: page.id,
            nodes: page.nodes.map((item) => (item.id === nodeId ? applySelectionNodePatch(item, patch) : item)),
          },
        ],
      },
      "IMMEDIATELY",
    );
  }, []);

  React.useEffect(() => {
    if (!agentBridge) return;
    void Promise.resolve(
      agentBridge.register({ client_id: clientId, label: "Prototype Design" }),
    ).catch(() => undefined);
    const ptxApplyRequests = new Set<string>();
    const unsubscribe = agentBridge.subscribe((dispatch) => {
      if (dispatch.client_id && dispatch.client_id !== clientId) return;
      const tool = dispatch.tool.trim() as ToolName | string;
      if (tool === "pt_ptx_apply") {
        if (ptxApplyRequests.has(dispatch.request_id)) return;
        ptxApplyRequests.add(dispatch.request_id);
      }
      void (async () => {
        try {
          const board = liveBoardRef.current;
          const api = apiRef.current;
          let data: unknown;
          if (tool === "pt_ptx_get") {
            if (!board) throw new PtDesignError("unknown_tool", "Board is not ready.");
            data = { ptx: board.extractPtx() };
          } else if (tool === "pt_ptx_apply") {
            if (!board) throw new PtDesignError("unknown_tool", "Board is not ready.");
            const ptx = typeof dispatch.args?.ptx === "string" ? dispatch.args.ptx : undefined;
            if (ptx === undefined) throw new PtDesignError("invalid_ptx", "ptx is required");
            board.applyPtx(ptx, "IMMEDIATELY");
            data = { ok: true };
          } else if (tool === "pt_catalog_list") {
            data = catalogListFromRegistry();
          } else if (tool === "pt_tools_list") {
            data = {
              tools: allToolDefs().map((def) => ({
                name: def.name,
                title: def.title,
                description: def.description,
                args: def.args,
                live: def.live !== false,
                readOnly: Boolean(def.readOnly),
              })),
              live: liveBoardToolNames(),
            };
          } else if (tool === "pt_screenshot") {
            if (!api) throw new PtDesignError("path_denied", "Board is not ready for screenshot.");
            data = await captureLiveScreenshot(api, dispatch.args ?? {});
          } else if (tool === "pt_doc_init" || tool === "pt_doc_open" || tool === "pt_doc_save") {
            throw new PtDesignError(
              "path_denied",
              "Live board tools do not use .ptd files. Use Save/Open in the board, or pt_ptx_get / pt_ptx_apply.",
            );
          } else {
            throw new PtDesignError("unknown_tool", unknownToolMessage(tool));
          }
          await Promise.resolve(
            agentBridge.reply({
              request_id: dispatch.request_id,
              success: true,
              data,
            }),
          );
        } catch (error) {
          await Promise.resolve(
            agentBridge.reply({
              request_id: dispatch.request_id,
              success: false,
              error_code: errorCodeOf(error),
              error_message: error instanceof Error ? error.message : String(error),
              recoverable: true,
            }),
          );
        } finally {
          if (tool === "pt_ptx_apply") ptxApplyRequests.delete(dispatch.request_id);
        }
      })();
    });
    return () => {
      unsubscribe();
      void Promise.resolve(agentBridge.unregister(clientId)).catch(() => undefined);
    };
  }, [agentBridge, clientId]);

  const openShare = React.useCallback(() => {
    setShareOpen(true);
  }, []);

  const refreshLibrary = React.useCallback(async () => {
    if (!library) return;
    try {
      setLibraryItems(await library.list());
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Could not list saved designs");
    }
  }, [library]);

  const openLibrary = React.useCallback(
    (next: "save" | "open") => {
      if (!library) return;
      setLibraryError(null);
      setLibraryMode(next);
      setShareOpen(false);
      void refreshLibrary();
    },
    [library, refreshLibrary],
  );

  const saveLibrary = React.useCallback(
    async (rawName: string) => {
      if (!library) return;
      const api = apiRef.current;
      if (!api) return;
      try {
        const scene = excalidrawElementsToScene(
          api.getSceneElementsIncludingDeleted() as readonly ExcalidrawCompatElement[],
          api.getAppState(),
          boardTheme,
        );
        const saved = await library.save(rawName, scene);
        setLibraryFile(saved.name);
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(`${storageKey}:file`, saved.name);
        }
        setLibraryMode(null);
        setLibraryError(null);
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : "Could not save");
      }
    },
    [library, storageKey, boardTheme],
  );

  const loadLibrary = React.useCallback(
    async (name: string) => {
      if (!library) return;
      const api = apiRef.current;
      const board = liveBoardRef.current;
      if (!api || !board) return;
      try {
        const loaded = await library.load(name);
        loadingRef.current = true;
        api.updateScene({
          elements: sceneToExcalidrawElements(loaded.scene, boardTheme),
          captureUpdate: "NEVER",
        });
        board.clearHistoryOnLoad();
        loadingRef.current = false;
        const app = api.getAppState();
        syncOverlay(board.extract(), {
          scrollX: app.scrollX,
          scrollY: app.scrollY,
          zoom: app.zoom,
          viewModeEnabled: app.viewModeEnabled ?? false,
        });
        setLibraryFile(loaded.name);
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(`${storageKey}:file`, loaded.name);
        }
        setLibraryMode(null);
        setLibraryError(null);
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : "Could not open");
      }
    },
    [library, storageKey, boardTheme, syncOverlay],
  );

  const menuItems = [
    {
      id: "give-to-agent" as const,
      label: "Give to Agent",
      onSelect: () => {
        const ptx = liveBoardRef.current?.extractPtx() ?? "";
        const invokeUrl = agentInvokeUrl(agentApiBase);
        const payload = { ptx, clientId, invokeUrl };
        if (handoff) void navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
        else void navigator.clipboard?.writeText(ptx);
      },
    },
    ...(library
      ? [
          {
            id: "save" as const,
            label: libraryFile ? `Save (${libraryFile.replace(/\.ptdesign\.json$/i, "")})` : "Save",
            onSelect: () => openLibrary("save"),
          },
          {
            id: "open" as const,
            label: "Open",
            onSelect: () => openLibrary("open"),
          },
        ]
      : []),
  ];

  const selectedNode =
    mode === "edit" && selectedNodeId
      ? overlayDoc.pages[0]?.nodes.find((item) => item.id === selectedNodeId)
      : undefined;
  const selectionGroups = selectedNode ? selectionPropGroups(selectedNode) : [];

  const overlay = React.useMemo(
    () => (
      <>
        <OverlayHost
          document={overlayDoc}
          mode={mode}
          appState={overlayState}
          onCommit={onOverlayCommit}
          onAction={onOverlayAction}
        />
        {selectionGroups.length > 0 && selectedNodeId ? (
          <SelectionPropsRail
            nodeId={selectedNodeId}
            chrome={chrome}
            groups={selectionGroups}
            onSelect={applySelectionPatch}
          />
        ) : null}
        {library && libraryMode ? (
          <LibraryOverlay
            theme={boardTheme}
            mode={libraryMode}
            items={libraryItems}
            error={libraryError}
            defaultName={libraryFile?.replace(/\.ptdesign\.json$/i, "") ?? defaultDesignName()}
            onSave={(name) => {
              void saveLibrary(name);
            }}
            onOpen={(name) => {
              void loadLibrary(name);
            }}
            onClose={() => setLibraryMode(null)}
          />
        ) : null}
      </>
    ),
    [
      overlayDoc,
      mode,
      overlayState,
      onOverlayCommit,
      onOverlayAction,
      selectionGroups,
      selectedNodeId,
      chrome,
      applySelectionPatch,
      library,
      libraryMode,
      boardTheme,
      libraryItems,
      libraryError,
      libraryFile,
      saveLibrary,
      loadLibrary,
    ],
  );

  return (
    <div
      className={className}
      data-testid="pt-design-app"
      data-theme={boardTheme}
      style={{
        display: "flex",
        height: "100%",
        minHeight: 360,
        background: chrome.bg,
        color: chrome.fg,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: chrome.canvas }}>
        <div style={{ flex: 1, minHeight: 0, background: chrome.canvas }}>
          <React.Suspense fallback={<div style={{ padding: 16, fontSize: 13, color: chrome.mutedFg }}>Loading board…</div>}>
            <ExcalidrawBoard
              initialElements={[]}
              viewBackgroundColor={chrome.canvas}
              theme={boardTheme}
              viewModeEnabled={mode === "interact"}
              onApi={attachHost}
              onChange={handleBoardChange}
              topLeftChrome={<ModeToggle mode={mode} onModeChange={onModeChange} labels={modeLabels} />}
              catalog={<Palette types={SHADCN_BASIC_IDS} onInsert={onPaletteInsert} />}
              blockCatalog={<Palette types={REQUIRED_BLOCKS} onInsert={onPaletteInsert} />}
              menuItems={menuItems}
              isCollaborating={collab.isCollaborating}
              collaborators={collab.users}
              onShare={() => {
                if (shareOpen) {
                  setShareOpen(false);
                  return;
                }
                openShare();
              }}
              sharePanel={{
                open: shareOpen,
                url: collab.shareUrl,
                room: collab.room,
                username: collab.username,
                clientId,
                apiBase: agentApiBase,
                copy: shareLabels,
                onStart: () => {
                  collab.setMode("invite");
                  void collab.start();
                },
                onUsernameChange: collab.setUsername,
                onJoin: collab.join,
                onStop: () => {
                  collab.stop();
                },
                onClose: () => setShareOpen(false),
              }}
              onPointerUpdate={collab.broadcastPointer}
              overlay={overlay}
            />
          </React.Suspense>
        </div>
      </div>
    </div>
  );
}

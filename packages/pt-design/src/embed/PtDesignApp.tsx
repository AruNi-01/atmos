"use client";

import React from "react";
import { defaultNodeFor } from "../components/registry";
import { createId } from "../core/ids";
import {
  localStoragePersistence,
  type DesignLibrary,
  type HandoffSink,
  type PersistenceAdapter,
  type PtDesignMeta,
  type PtPersistV2,
  type PtTheme,
} from "../host/adapters";
import { mergePtDesignMeta, ptDesignIdFromKey } from "../host/catalog";
import { libraryFileStem, namedPersistForLibrarySave, shouldPromptLibraryName } from "../host/library-file";
import { isLiveRasterPreview, contentBoundsFromPersist, previewNeedsRegen } from "../host/preview";
import { persistPreviewImage } from "../host/preview-blob";
import { parseRadiusToken, PT_RADIUS_DEFAULT, type PtRadiusToken } from "../components/radius";
import { catalogListFromRegistry } from "../agent/session-tools";
import { allToolDefs, liveBoardToolNames, unknownToolMessage, type ToolName } from "../agent/tool-defs";
import { PtDesignError, type HandleElement, type PtDocument } from "../protocol";
import { REQUIRED_BLOCKS, COMPONENT_PALETTE_IDS } from "../catalog/shadcn-list";
import { ModeToggle, Palette, buildChartPaletteGroups, type DesignMode } from "../editor";
import { chromeTokens, resolveBoardTheme } from "./chrome";
import { agentInvokeUrl, normalizeAgentApiBase } from "./agent-prompt";
import { createLiveBoard, applySceneCameraNever, type LiveBoard } from "./live-board";
import { OverlayHost } from "./overlay";
import {
  AGENT_REVEAL_MS,
  PLACE_REVEAL_MS,
  cameraToShowRect,
  elementsForPtIds,
  sceneRectToBoardBox,
  selectedIdsForElements,
  unionElementBounds,
  type RevealBox,
} from "./place-reveal";
import { SelectionPropsRail } from "./SelectionPropsRail";
import {
  applySelectionNodePatch,
  selectedNodeIdFromBoardSelection,
  selectionPropGroups,
  selectionPropPatch,
  type SelectionPropGroup,
} from "./selection-props";
import { catalogPlaceAt, PLACE_VIEWPORT_CHROME, sceneViewportRect } from "../editor/place-clear";
import {
  keepOverlayThroughEmptyLoad,
  sameOverlayDocument,
  sameOverlayViewport,
  type ExcalidrawCompatElement,
} from "./scene-bridge";
import { createPersistDebouncer } from "./persist-debounce";
import { captureLiveScreenshot, PREVIEW_CAPTURE_MAX_EDGE } from "./screenshot";
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
  documentMeta?: Partial<PtDesignMeta>;
  onBack?: () => void;
  backLabel?: string;
};

const ExcalidrawBoard = React.lazy(() => import("./ExcalidrawBoard"));

const EMPTY_DOC: PtDocument = { version: "ptx/1", pages: [{ id: "page", nodes: [] }] };

function emptyOverlayState() {
  return { scrollX: 0, scrollY: 0, zoom: { value: 1 }, viewModeEnabled: false };
}

function persistIdFromKey(storageKey: string): string {
  return ptDesignIdFromKey(storageKey) ?? storageKey;
}

function decoratePersistMeta(doc: Omit<PtPersistV2, "meta">, meta: PtDesignMeta): PtPersistV2 {
  const nextMeta = { ...meta, updatedAt: Date.now() };
  if (isLiveRasterPreview(nextMeta.preview)) {
    nextMeta.previewFit = "content";
  } else {
    delete nextMeta.preview;
    delete nextMeta.previewFit;
  }
  return { ...doc, meta: nextMeta };
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
  documentMeta,
  onBack,
  backLabel,
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
  const documentMetaRef = React.useRef(documentMeta);
  documentMetaRef.current = documentMeta;
  const metaRef = React.useRef<PtDesignMeta | null>(null);
  const previewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePreviewCaptureRef = React.useRef<() => void>(() => {});
  const [boardReady, setBoardReady] = React.useState(false);
  const [mode, setMode] = React.useState<DesignMode>("edit");
  const [overlayDoc, setOverlayDoc] = React.useState<PtDocument>(EMPTY_DOC);
  const [overlayState, setOverlayState] = React.useState(emptyOverlayState);
  const overlayDocRef = React.useRef(overlayDoc);
  const overlayStateRef = React.useRef(overlayState);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [libraryMode, setLibraryMode] = React.useState<"save" | null>(null);
  const [libraryError, setLibraryError] = React.useState<string | null>(null);
  const [libraryFile, setLibraryFile] = React.useState<string | null>(() => {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(`${storageKey}:file`);
  });
  const libraryRef = React.useRef(library);
  libraryRef.current = library;
  const libraryFileRef = React.useRef(libraryFile);
  libraryFileRef.current = libraryFile;
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const selectedNodeIdRef = React.useRef<string | null>(null);
  selectedNodeIdRef.current = selectedNodeId;
  const [revealIds, setRevealIds] = React.useState<string[] | null>(null);
  const [revealKind, setRevealKind] = React.useState<"catalog" | "agent">("catalog");
  const [revealBox, setRevealBox] = React.useState<RevealBox | null>(null);
  const [globalRadius, setGlobalRadius] = React.useState<PtRadiusToken>(PT_RADIUS_DEFAULT);
  const globalRadiusRef = React.useRef(globalRadius);
  globalRadiusRef.current = globalRadius;
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
        const radius = parseRadiusToken(loaded?.settings?.radius);
        globalRadiusRef.current = radius;
        setGlobalRadius(radius);
        const persistId = persistIdFromKey(storageKey);
        const mergedMeta = mergePtDesignMeta(
          loaded?.meta,
          documentMetaRef.current,
          persistId,
          loaded,
        );
        metaRef.current = mergedMeta;
        if (loaded && !loaded.meta) {
          void persistRef.current.save({ ...loaded, meta: mergedMeta });
        }
        liveBoardRef.current.loadPersist(loaded);
        const app = api.getAppState();
        syncOverlay(liveBoardRef.current.extract(), {
          scrollX: app.scrollX,
          scrollY: app.scrollY,
          zoom: app.zoom,
          viewModeEnabled: app.viewModeEnabled ?? false,
        });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled) return;
            const loadedDoc = loaded ?? { ptx: "" };
            if (previewNeedsRegen(mergedMeta.preview, contentBoundsFromPersist(loadedDoc), mergedMeta.previewFit)) {
              schedulePreviewCaptureRef.current();
            }
          });
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

  const bindLibraryFile = React.useCallback(
    (name: string) => {
      libraryFileRef.current = name;
      setLibraryFile(name);
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`${storageKey}:file`, name);
      }
    },
    [storageKey],
  );

  React.useEffect(() => {
    if (typeof localStorage === "undefined") return;
    setLibraryFile(localStorage.getItem(`${storageKey}:file`));
  }, [storageKey]);

  const snapshotCurrentPersist = React.useCallback((): PtPersistV2 | null => {
    const api = apiRef.current;
    const board = liveBoardRef.current;
    if (!api || !board) return null;
    const persistId = persistIdFromKey(storageKey);
    const baseMeta = mergePtDesignMeta(
      metaRef.current ?? undefined,
      documentMetaRef.current,
      persistId,
      null,
    );
    const payload = decoratePersistMeta(
      {
        ptx: board.extractPtx(),
        canvas: canvasDump(api),
        files: api.getFiles?.(),
        settings: { radius: globalRadiusRef.current },
      },
      baseMeta,
    );
    metaRef.current = payload.meta ?? baseMeta;
    return payload;
  }, [storageKey]);

  const fileSyncDebouncer = React.useMemo(
    () =>
      createPersistDebouncer<PtPersistV2>((doc) => {
        const bound = libraryFileRef.current;
        const lib = libraryRef.current;
        if (!bound || !lib) return;
        void lib.save(bound, doc).catch(() => undefined);
      }, { delay: 800 }),
    [],
  );

  const persistDebouncer = React.useMemo(
    () =>
      createPersistDebouncer<PtPersistV2>((doc) => {
        void persistRef.current.save(doc);
        if (libraryFileRef.current && libraryRef.current) {
          fileSyncDebouncer.schedule(doc);
        }
      }),
    [fileSyncDebouncer],
  );

  const capturePreviewNow = React.useCallback(async () => {
    const live = apiRef.current;
    const board = liveBoardRef.current;
    const latestMeta = metaRef.current;
    if (!live || !board || !latestMeta) return;
    try {
      const shot = await captureLiveScreenshot(live, { maxEdge: PREVIEW_CAPTURE_MAX_EDGE, preview: true });
      if (!isLiveRasterPreview(shot.dataUrl) && !shot.blob) return;
      const stored = await persistPreviewImage(latestMeta.id, shot.dataUrl, shot.blob);
      if (!stored) return;
      const nextMeta = {
        ...latestMeta,
        preview: stored,
        previewFit: "content" as const,
        updatedAt: Date.now(),
      };
      metaRef.current = nextMeta;
      persistDebouncer.schedule({
        ptx: board.extractPtx(),
        canvas: canvasDump(live),
        files: live.getFiles?.(),
        settings: { radius: globalRadiusRef.current },
        meta: nextMeta,
      });
    } catch {
      /* keep last live raster; never write bbox-rect SVG */
    }
  }, [persistDebouncer]);

  const schedulePreviewCapture = React.useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      void capturePreviewNow();
    }, 800);
  }, [capturePreviewNow]);
  schedulePreviewCaptureRef.current = schedulePreviewCapture;

  const handleBack = React.useCallback(() => {
    if (!onBack) return;
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    const shot = capturePreviewNow();
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, 800);
    });
    void Promise.race([shot, timeout]).finally(() => {
      persistDebouncer.flush();
      fileSyncDebouncer.flush();
      onBack();
    });
  }, [capturePreviewNow, fileSyncDebouncer, onBack, persistDebouncer]);

  React.useEffect(
    () => () => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      persistDebouncer.flush();
      fileSyncDebouncer.flush();
      void capturePreviewNow().then(() => {
        persistDebouncer.flush();
        fileSyncDebouncer.flush();
      });
    },
    [capturePreviewNow, fileSyncDebouncer, persistDebouncer],
  );

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
        const payload = snapshotCurrentPersist();
        if (payload) persistDebouncer.schedule(payload);
        schedulePreviewCapture();
      }
    },
    [collab.broadcastScene, persistDebouncer, schedulePreviewCapture, snapshotCurrentPersist, syncOverlay],
  );

  const onModeChange = React.useCallback((next: DesignMode) => {
    setMode(next);
    liveBoardRef.current?.setMode(next);
    const nextState = { ...overlayStateRef.current, viewModeEnabled: next === "interact" };
    overlayStateRef.current = nextState;
    setOverlayState(nextState);
  }, []);

  const revealOnBoard = React.useCallback((ptIds: string[], kind: "catalog" | "agent" = "catalog") => {
    const api = apiRef.current;
    const board = liveBoardRef.current;
    if (!api || ptIds.length === 0) return;
    const fromScene = () => elementsForPtIds(api.getSceneElements(), ptIds);
    const fromDoc = () => {
      const nodes = board?.extract().pages[0]?.nodes ?? [];
      return nodes
        .filter((node) => ptIds.includes(node.id))
        .map((node) => ({ x: node.x, y: node.y, width: node.width, height: node.height }));
    };
    const selectAndPan = (attempt = 0) => {
      const targets = fromScene();
      if (targets.length === 0 && attempt < 8) {
        requestAnimationFrame(() => selectAndPan(attempt + 1));
        return;
      }
      if (targets.length > 0) {
        api.updateScene({
          appState: { selectedElementIds: selectedIdsForElements(targets) },
          captureUpdate: "NEVER",
        });
      }
      const bounds = unionElementBounds(targets.length ? targets : fromDoc());
      if (!bounds) return;
      applySceneCameraNever(
        {
          getAppState: () => api.getAppState(),
          updateScene: (opts) => {
            api.updateScene({
              ...(opts.appState ? { appState: opts.appState } : {}),
              captureUpdate: opts.captureUpdate,
            });
          },
        },
        cameraToShowRect(bounds, api.getAppState()),
      );
      selectedNodeIdRef.current = ptIds[0] ?? null;
      setSelectedNodeId(ptIds[0] ?? null);
      setRevealKind(kind);
      setRevealIds(ptIds);
    };
    selectAndPan();
  }, []);

  React.useEffect(() => {
    if (!revealIds) {
      setRevealBox(null);
      return;
    }
    const until = performance.now() + (revealKind === "agent" ? AGENT_REVEAL_MS : PLACE_REVEAL_MS);
    let frame = 0;
    const tick = () => {
      const api = apiRef.current;
      const board = liveBoardRef.current;
      const sceneBounds = api ? unionElementBounds(elementsForPtIds(api.getSceneElements(), revealIds)) : null;
      const docBounds =
        board &&
        unionElementBounds(
          (board.extract().pages[0]?.nodes ?? [])
            .filter((node) => revealIds.includes(node.id))
            .map((node) => ({ x: node.x, y: node.y, width: node.width, height: node.height })),
        );
      const bounds = sceneBounds ?? docBounds;
      if (api && bounds) setRevealBox(sceneRectToBoardBox(bounds, api.getAppState()));
      if (performance.now() < until) frame = requestAnimationFrame(tick);
      else setRevealIds(null);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [revealIds, revealKind]);

  const onPaletteInsert = React.useCallback((
    type: Parameters<typeof defaultNodeFor>[0],
    variant?: string,
  ) => {
    const api = apiRef.current;
    const board = liveBoardRef.current;
    if (!api || !board) return;
    const id = createId("pt");
    const node = defaultNodeFor(type, id);
    node.props = { ...node.props, ...(variant ? { variant } : {}), radius: "default" };
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
    revealOnBoard([id], "catalog");
  }, [revealOnBoard]);

  const onOverlayCommit = React.useCallback((doc: PtDocument, capture: "IMMEDIATELY" | "NEVER" = "NEVER") => {
    if (capture === "IMMEDIATELY") {
      liveBoardRef.current?.applyDocument(doc, "IMMEDIATELY");
      return;
    }
    liveBoardRef.current?.applyDocument(doc, "NEVER");
  }, []);

  const onOverlayAction = React.useCallback(
    (payload: PtDesignHostAction) => {
      onAction?.(payload);
    },
    [onAction],
  );

  const persistCurrent = React.useCallback((radius: PtRadiusToken) => {
    const api = apiRef.current;
    const board = liveBoardRef.current;
    if (!api || !board) return;
    persistDebouncer.schedule(
      decoratePersistMeta(
        {
          ptx: board.extractPtx(),
          canvas: canvasDump(api),
          files: api.getFiles?.(),
          settings: { radius },
        },
        metaRef.current ??
          mergePtDesignMeta(undefined, documentMetaRef.current, persistIdFromKey(storageKey), null),
      ),
    );
    persistDebouncer.flush();
  }, [persistDebouncer, storageKey]);

  const onGlobalRadiusChange = React.useCallback((radius: PtRadiusToken) => {
    globalRadiusRef.current = radius;
    setGlobalRadius(radius);
    persistCurrent(radius);
  }, [persistCurrent]);

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
            const ids = board.extract().pages[0]?.nodes.map((node) => node.id) ?? [];
            revealOnBoard(ids, "agent");
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
              "Live board tools do not use .ptd files. Use Save in the board, or pt_ptx_get / pt_ptx_apply.",
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
  }, [agentBridge, clientId, revealOnBoard]);

  const openShare = React.useCallback(() => {
    setShareOpen(true);
  }, []);

  const saveBoundLibrary = React.useCallback(async () => {
    const bound = libraryFileRef.current;
    if (!bound || !library) return;
    const doc = snapshotCurrentPersist();
    if (!doc) return;
    try {
      persistDebouncer.drop();
      fileSyncDebouncer.drop();
      void persistRef.current.save(doc);
      await library.save(bound, doc);
      setLibraryError(null);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Could not save");
      setLibraryMode("save");
    }
  }, [fileSyncDebouncer, library, persistDebouncer, snapshotCurrentPersist]);

  const openLibrary = React.useCallback(() => {
    if (!library) return;
    if (!shouldPromptLibraryName(libraryFileRef.current)) {
      void saveBoundLibrary();
      return;
    }
    setLibraryError(null);
    setLibraryMode("save");
    setShareOpen(false);
  }, [library, saveBoundLibrary]);

  const saveLibrary = React.useCallback(
    async (rawName: string) => {
      if (!library) return;
      const doc = snapshotCurrentPersist();
      if (!doc) return;
      const named = namedPersistForLibrarySave(doc, rawName);
      if (named.meta) metaRef.current = named.meta;
      try {
        persistDebouncer.drop();
        fileSyncDebouncer.drop();
        void persistRef.current.save(named);
        const saved = await library.save(rawName, named);
        bindLibraryFile(saved.name);
        setLibraryMode(null);
        setLibraryError(null);
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : "Could not save");
      }
    },
    [bindLibraryFile, fileSyncDebouncer, library, persistDebouncer, snapshotCurrentPersist],
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
            label: libraryFile ? `Save (${libraryFileStem(libraryFile)})` : "Save",
            onSelect: () => openLibrary(),
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
          globalRadius={globalRadius}
        >
          {revealBox ? (
            <div
              data-testid="pt-design-place-reveal"
              className={revealKind === "agent" ? "pt-design-agent-highlight" : "pt-design-place-reveal"}
              style={{
                left: revealBox.left,
                top: revealBox.top,
                width: revealBox.width,
                height: revealBox.height,
                color: chrome.fg,
              }}
            />
          ) : null}
        </OverlayHost>
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
            error={libraryError}
            defaultName={
              metaRef.current?.name?.trim()
              || (libraryFile ? libraryFileStem(libraryFile) : defaultDesignName())
            }
            onSave={(name) => {
              void saveLibrary(name);
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
      revealBox,
      revealKind,
      library,
      libraryMode,
      boardTheme,
      libraryError,
      libraryFile,
      saveLibrary,
      globalRadius,
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
              onBack={onBack ? handleBack : undefined}
              backLabel={backLabel}
              topLeftChrome={<ModeToggle mode={mode} onModeChange={onModeChange} labels={modeLabels} />}
              catalog={<Palette types={COMPONENT_PALETTE_IDS} onInsert={onPaletteInsert} />}
              blockCatalog={<Palette types={REQUIRED_BLOCKS} onInsert={onPaletteInsert} />}
              chartCatalog={<Palette groups={buildChartPaletteGroups()} rootLabel="Charts" onInsert={onPaletteInsert} />}
              catalogStyle={{ radius: globalRadius, onRadiusChange: onGlobalRadiusChange }}
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

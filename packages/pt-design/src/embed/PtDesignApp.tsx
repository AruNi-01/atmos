"use client";

import React from "react";
import { createPtDesignSession, type PtDesignSession } from "../core/session";
import { listComponentTypes } from "../catalog/registry";
import { catalogPlaceAt, sceneViewportRect } from "../catalog/place-clear";
import {
  localStoragePersistence,
  type DesignLibrary,
  type DesignLibraryItem,
  type HandoffSink,
  type PersistenceAdapter,
  type PtTheme,
} from "../host/adapters";
import { FONT_HELVETICA } from "../catalog/primitives";
import { isPtDesignError } from "../agent/errors";
import { runSessionTool } from "../agent/session-tools";
import type { ToolName } from "../agent/tool-defs";
import { PT_DESIGN_TOOL_DEFS } from "../agent/tool-defs";
import { chromeTokens, resolveBoardTheme } from "./chrome";
import { agentInvokeUrl, normalizeAgentApiBase } from "./agent-prompt";
import { drawingAppState } from "./theme-palette";
import { ComponentCatalog } from "./ComponentCatalog";
import { createApplyGate } from "./apply-gate";
import { createPersistDebouncer } from "./persist-debounce";
import {
  excalidrawElementsToScene,
  sceneFingerprint,
  sceneToExcalidrawElements,
  type ExcalidrawCompatElement,
  type ExcalidrawHostApi,
} from "./scene-bridge";
import { useExcalidrawCollab } from "./use-collab";
import { resolveShareCopy, type ShareCopy } from "./SharePopover";
import { defaultDesignName, LibraryOverlay } from "./LibraryOverlay";
import {
  PLACE_REVEAL_MS,
  PLACE_SCROLL_OFFSETS,
  elementsForInstances,
  prefersReducedMotion,
  sceneRectToBoardBox,
  selectedIdsForElements,
  unionElementBounds,
  type RevealBox,
} from "./place-reveal";

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

export type PtDesignAppProps = {
  session?: PtDesignSession;
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
};

const ExcalidrawBoard = React.lazy(() => import("./ExcalidrawBoard"));

export function PtDesignApp({
  session: external,
  persistence,
  handoff,
  theme,
  className,
  storageKey = "pt-design:scene:v1",
  username,
  shareCopy,
  collabServerUrl,
  library,
  agentBridge,
  clientId = "default",
}: PtDesignAppProps) {
  const persist = React.useMemo(
    () => persistence ?? localStoragePersistence(storageKey),
    [persistence, storageKey],
  );
  const [session] = React.useState(() => external ?? createPtDesignSession());
  const [, setTick] = React.useState(0);
  const [catalogType, setCatalogType] = React.useState("button");
  const [selectedInstanceId, setSelectedInstanceId] = React.useState<string | null>(null);
  const [revealIds, setRevealIds] = React.useState<string[] | null>(null);
  const [revealBox, setRevealBox] = React.useState<RevealBox | null>(null);
  const apiRef = React.useRef<ExcalidrawHostApi | null>(null);
  const applyGateRef = React.useRef(createApplyGate());
  const loadingRef = React.useRef(false);
  const echoFromBoardRef = React.useRef(false);
  const [boardReady, setBoardReady] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [libraryMode, setLibraryMode] = React.useState<"save" | "open" | null>(null);
  const [libraryItems, setLibraryItems] = React.useState<DesignLibraryItem[]>([]);
  const [libraryError, setLibraryError] = React.useState<string | null>(null);
  const [libraryFile, setLibraryFile] = React.useState<string | null>(() => {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(`${storageKey}:file`);
  });
  const boardTheme = resolveBoardTheme(theme);
  const chrome = chromeTokens(boardTheme);
  const shareLabels = resolveShareCopy(shareCopy);

  const beginApply = React.useCallback(() => {
    applyGateRef.current.begin();
  }, []);

  const pushScene = React.useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const scene = session.getScene();
    const current = excalidrawElementsToScene(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      boardTheme,
    );
    if (sceneFingerprint(current) === sceneFingerprint(scene)) return;
    beginApply();
    api.updateScene({ elements: sceneToExcalidrawElements(scene, boardTheme) });
  }, [session, boardTheme, beginApply]);

  const pushSceneRef = React.useRef(pushScene);
  pushSceneRef.current = pushScene;
  const broadcastRef = React.useRef<(elements: readonly unknown[]) => void>(() => undefined);

  const handleApi = React.useCallback((api: ExcalidrawHostApi) => {
    apiRef.current = api;
    setBoardReady(true);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void persist.load().then((loaded) => {
      if (cancelled || !loaded) return;
      loadingRef.current = true;
      session.dispatch({ type: "replaceScene", scene: loaded.scene });
      loadingRef.current = false;
      setTick((n) => n + 1);
      pushSceneRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [persist, session]);

  React.useEffect(() => {
    if (!boardReady) return;
    const api = apiRef.current;
    if (!api) return;
    beginApply();
    api.updateScene({
      elements: sceneToExcalidrawElements(session.getScene(), boardTheme),
      appState: {
        theme: boardTheme,
        viewBackgroundColor: chrome.canvas,
        currentItemRoughness: 1,
        currentItemFontFamily: FONT_HELVETICA,
        // Partial appState is restored against Excalidraw defaults — omit
        // the stroke and new shapes are born `#1e1e1e` on a dark canvas.
        ...drawingAppState(boardTheme),
      },
    });
  }, [boardReady, boardTheme, chrome.canvas, session, beginApply]);

  React.useEffect(() => {
    const debouncer = createPersistDebouncer((scene) => persist.save({ scene }));
    const unsubscribe = session.subscribe(() => {
      setTick((n) => n + 1);
      if (!loadingRef.current) debouncer.schedule(session.getScene());
      if (echoFromBoardRef.current) return;
      if (!loadingRef.current && !applyGateRef.current.isPending()) {
        pushSceneRef.current();
        const api = apiRef.current;
        if (api) broadcastRef.current(api.getSceneElementsIncludingDeleted());
      }
    });
    return () => {
      unsubscribe();
      debouncer.flush();
    };
  }, [persist, session]);

  const applyRemoteElements = React.useCallback(
    (elements: readonly unknown[]) => {
      const next = excalidrawElementsToScene(
        elements as readonly ExcalidrawCompatElement[],
        undefined,
        boardTheme,
      );
      if (sceneFingerprint(next) === sceneFingerprint(session.getScene())) return;
      loadingRef.current = true;
      session.dispatch({ type: "replaceScene", scene: next });
      loadingRef.current = false;
      beginApply();
      apiRef.current?.updateScene({ elements: sceneToExcalidrawElements(next, boardTheme) });
      setTick((n) => n + 1);
    },
    [beginApply, boardTheme, session],
  );

  const collab = useExcalidrawCollab({
    api: apiRef.current,
    username,
    serverUrl: collabServerUrl,
    getElements: () => apiRef.current?.getSceneElementsIncludingDeleted() ?? sceneToExcalidrawElements(session.getScene(), boardTheme),
    applyRemoteElements,
  });
  broadcastRef.current = collab.broadcastScene;
  const agentApiBase = normalizeAgentApiBase(collabServerUrl);

  React.useEffect(() => {
    if (!agentBridge) return;
    const tools = new Set(PT_DESIGN_TOOL_DEFS.map((def) => def.name));
    void Promise.resolve(
      agentBridge.register({ client_id: clientId, label: "Prototype Design" }),
    ).catch(() => undefined);
    const unsubscribe = agentBridge.subscribe((dispatch) => {
      if (dispatch.client_id && dispatch.client_id !== clientId) return;
      const tool = dispatch.tool.trim() as ToolName;
      try {
        if (!tools.has(tool)) {
          throw new Error(`Unknown tool: ${dispatch.tool}`);
        }
        const data = runSessionTool(session, { name: tool, args: dispatch.args ?? {} });
        void Promise.resolve(
          agentBridge.reply({
            request_id: dispatch.request_id,
            success: true,
            data,
          }),
        );
      } catch (error) {
        void Promise.resolve(
          agentBridge.reply({
            request_id: dispatch.request_id,
            success: false,
            error_code: isPtDesignError(error) ? error.code : "INTERNAL",
            error_message: error instanceof Error ? error.message : String(error),
            recoverable: true,
          }),
        );
      }
    });
    return () => {
      unsubscribe();
      void Promise.resolve(agentBridge.unregister(clientId)).catch(() => undefined);
    };
  }, [agentBridge, clientId, session]);

  const scene = session.getScene();
  const catalog = listComponentTypes();
  const selected = selectedInstanceId
    ? scene.elements.find(
        (el) => el.customData?.pt?.instanceId === selectedInstanceId && el.customData.pt.componentType,
      )
    : undefined;
  const selectedType = selected?.customData?.pt?.componentType;
  const selectedEntry = catalog.find((item) => item.componentType === selectedType);

  const placeFromCatalog = (componentType: string, variant?: string) => {
    setCatalogType(componentType);
    const api = apiRef.current;
    const appState = api?.getAppState();
    const viewport = appState
      ? sceneViewportRect(appState, { left: 24, top: 72, right: 376, bottom: 64 })
      : undefined;
    const placed = session.dispatch({
      type: "place",
      componentType,
      variant,
      at: catalogPlaceAt(session.getScene().elements, componentType, variant, viewport),
    });
    const instanceIds = placed.instanceIds ?? (placed.instanceId ? [placed.instanceId] : []);
    if (instanceIds[0]) {
      setSelectedInstanceId(instanceIds[0]);
      session.setSelection(instanceIds);
    }
    if (!api || instanceIds.length === 0) return;
    const targets = elementsForInstances(session.getScene().elements, instanceIds);
    if (targets.length === 0) return;
    api.updateScene({ appState: { selectedElementIds: selectedIdsForElements(targets) } });
    const zoom = api.getAppState().zoom.value || 1;
    const reduceMotion = prefersReducedMotion();
    api.scrollToContent(targets, {
      animate: !reduceMotion,
      duration: reduceMotion ? 0 : 420,
      fitToContent: true,
      minZoom: zoom,
      maxZoom: zoom,
      canvasOffsets: PLACE_SCROLL_OFFSETS,
    });
    setRevealIds(instanceIds);
  };

  React.useEffect(() => {
    if (!revealIds) {
      setRevealBox(null);
      return;
    }
    const until = performance.now() + PLACE_REVEAL_MS;
    let frame = 0;
    const tick = () => {
      const api = apiRef.current;
      const bounds = unionElementBounds(elementsForInstances(session.getScene().elements, revealIds));
      if (api && bounds) setRevealBox(sceneRectToBoardBox(bounds, api.getAppState()));
      if (performance.now() < until) frame = requestAnimationFrame(tick);
      else setRevealIds(null);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [revealIds, session]);

  const handleBoardChange = React.useCallback(
    (
      elements: readonly ExcalidrawCompatElement[],
      appState: { viewBackgroundColor: string; selectedElementIds: Record<string, boolean> },
    ) => {
      const selectedIds = Object.keys(appState.selectedElementIds ?? {}).filter(
        (id) => appState.selectedElementIds[id],
      );
      const instanceId =
        elements.find((el) => selectedIds.includes(el.id) && el.customData?.pt?.instanceId)?.customData?.pt
          ?.instanceId ?? null;
      setSelectedInstanceId((prev) => (prev === instanceId ? prev : instanceId));
      if (instanceId) session.setSelection([instanceId]);

      if (applyGateRef.current.consume()) return;
      const next = excalidrawElementsToScene(elements, appState, boardTheme);
      if (sceneFingerprint(next) === sceneFingerprint(session.getScene())) return;
      echoFromBoardRef.current = true;
      session.dispatch({ type: "replaceScene", scene: next });
      echoFromBoardRef.current = false;
      collab.broadcastScene(elements);
    },
    [boardTheme, collab, session],
  );

  const toolButton: React.CSSProperties = {
    fontSize: 12,
    color: chrome.fg,
    background: chrome.muted,
    border: `1px solid ${chrome.border}`,
    borderRadius: 8,
    padding: "4px 8px",
    cursor: "pointer",
  };

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
    (mode: "save" | "open") => {
      if (!library) return;
      setLibraryError(null);
      setLibraryMode(mode);
      setShareOpen(false);
      void refreshLibrary();
    },
    [library, refreshLibrary],
  );

  const saveLibrary = React.useCallback(
    async (rawName: string) => {
      if (!library) return;
      try {
        const saved = await library.save(rawName, session.getScene());
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
    [library, session, storageKey],
  );

  const loadLibrary = React.useCallback(
    async (name: string) => {
      if (!library) return;
      try {
        const loaded = await library.load(name);
        loadingRef.current = true;
        session.dispatch({ type: "replaceScene", scene: loaded.scene });
        loadingRef.current = false;
        beginApply();
        apiRef.current?.updateScene({
          elements: sceneToExcalidrawElements(loaded.scene, boardTheme),
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
    [beginApply, boardTheme, library, session, storageKey],
  );

  const menuItems = [
    {
      id: "add-frame" as const,
      label: "Add frame",
      onSelect: () => {
        session.dispatch({
          type: "createFrame",
          name: "Frame",
          bbox: { x: 40, y: 40, w: 480, h: 320 },
        });
      },
    },
    {
      id: "give-to-agent" as const,
      label: "Give to Agent",
      onSelect: () => {
        const payload = session.buildHandoff({
          scope: "document",
          clientId,
          invokeUrl: agentInvokeUrl(agentApiBase),
        });
        if (handoff) void handoff.accept(payload);
        else void navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
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
    {
      id: "copy-ir" as const,
      label: "Copy IR",
      onSelect: () => {
        void navigator.clipboard?.writeText(JSON.stringify(session.getIR(), null, 2));
      },
    },
    {
      id: "share" as const,
      label: collab.isCollaborating ? shareLabels.openMenu : shareLabels.startMenu,
      onSelect: openShare,
    },
  ];

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
              initialElements={sceneToExcalidrawElements(scene, boardTheme)}
              viewBackgroundColor={chrome.canvas}
              theme={boardTheme}
              onApi={handleApi}
              onChange={handleBoardChange}
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
              overlay={
                <>
                  {revealBox ? (
                    <div
                      data-testid="pt-design-place-reveal"
                      className="pt-design-place-reveal"
                      style={{
                        left: revealBox.left,
                        top: revealBox.top,
                        width: revealBox.width,
                        height: revealBox.height,
                        color: chrome.fg,
                      }}
                    />
                  ) : null}
                  {library && libraryMode ? (
                    <LibraryOverlay
                      theme={boardTheme}
                      mode={libraryMode}
                      items={libraryItems}
                      error={libraryError}
                      defaultName={
                        libraryFile?.replace(/\.ptdesign\.json$/i, "") ?? defaultDesignName()
                      }
                      onSave={(name) => {
                        void saveLibrary(name);
                      }}
                      onOpen={(name) => {
                        void loadLibrary(name);
                      }}
                      onClose={() => setLibraryMode(null)}
                    />
                  ) : null}
                  {selectedEntry && selectedInstanceId && selectedEntry.variants.length > 1 ? (
                    <span
                      style={{
                        position: "absolute",
                        top: 12,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 4,
                        display: "inline-flex",
                        gap: 4,
                        alignItems: "center",
                        fontSize: 12,
                        color: chrome.mutedFg,
                      }}
                    >
                      Variant
                      {selectedEntry.variants.map((variant) => (
                        <button
                          key={variant}
                          type="button"
                          onClick={() => {
                            session.dispatch({ type: "update", instanceId: selectedInstanceId, variant });
                          }}
                          style={{
                            ...toolButton,
                            fontWeight: selected?.customData?.pt?.variant === variant ? 600 : 400,
                          }}
                        >
                          {variant}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </>
              }
              catalog={
                <ComponentCatalog
                  items={catalog}
                  kind="basic"
                  activeType={catalogType}
                  onPlace={placeFromCatalog}
                />
              }
              blockCatalog={
                <ComponentCatalog
                  items={catalog}
                  kind="block"
                  activeType={catalogType}
                  onPlace={placeFromCatalog}
                />
              }
            />
          </React.Suspense>
        </div>
      </div>
    </div>
  );
}

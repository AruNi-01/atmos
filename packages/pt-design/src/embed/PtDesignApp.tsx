"use client";

import React from "react";
import { createPtDesignSession, type PtDesignSession } from "../core/session";
import { listComponentTypes } from "../catalog/registry";
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
import { normalizeAgentApiBase } from "./agent-prompt";
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
import { parseRoomFromString } from "../collab/room";
import { resolveShareCopy, type ShareCopy } from "./SharePopover";
import { defaultDesignName, LibraryOverlay } from "./LibraryOverlay";

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
}: PtDesignAppProps) {
  const persist = React.useMemo(
    () => persistence ?? localStoragePersistence(storageKey),
    [persistence, storageKey],
  );
  const [session] = React.useState(() => external ?? createPtDesignSession());
  const [, setTick] = React.useState(0);
  const [catalogType, setCatalogType] = React.useState("button");
  const [selectedInstanceId, setSelectedInstanceId] = React.useState<string | null>(null);
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
    if (!agentBridge || !collab.room) return;
    const clientId = collab.room.roomId;
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
  }, [agentBridge, collab.room, session]);

  const scene = session.getScene();
  const catalog = listComponentTypes();
  const selected = selectedInstanceId
    ? scene.elements.find(
        (el) => el.customData?.pt?.instanceId === selectedInstanceId && el.customData.pt.componentType,
      )
    : undefined;
  const selectedType = selected?.customData?.pt?.componentType;
  const selectedEntry = catalog.find((item) => item.componentType === selectedType);

  const placeAt = () => {
    const count = scene.elements.filter((el) => el.customData?.pt?.componentType).length;
    return { x: 80 + (count % 6) * 24, y: 80 + Math.floor(count / 6) * 24 };
  };

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
    void collab.start();
  }, [collab]);

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
        void (async () => {
          collab.setMode("local");
          if (!collab.isCollaborating) {
            setShareOpen(true);
            await collab.start();
          }
          const url = (await collab.start()) ?? collab.shareUrl;
          const parsed = parseRoomFromString(url);
          const payload = session.buildHandoff({
            scope: "document",
            collab: parsed && url ? { ...parsed, shareUrl: url } : undefined,
          });
          if (handoff) void handoff.accept(payload);
          else void navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
        })();
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
                mode: collab.mode,
                username: collab.username,
                apiBase: agentApiBase,
                copy: shareLabels,
                onModeChange: collab.setMode,
                onUsernameChange: collab.setUsername,
                onJoin: collab.join,
                onStop: () => {
                  collab.stop();
                  setShareOpen(false);
                },
                onClose: () => setShareOpen(false),
              }}
              onPointerUpdate={collab.broadcastPointer}
              overlay={
                <>
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
                  activeType={catalogType}
                  onPlace={(componentType, variant) => {
                    setCatalogType(componentType);
                    session.dispatch({
                      type: "place",
                      componentType,
                      variant,
                      at: placeAt(),
                    });
                  }}
                />
              }
            />
          </React.Suspense>
        </div>
      </div>
    </div>
  );
}

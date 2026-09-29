"use client";

import "./excalidraw-assets";
import React from "react";
import { DefaultSidebar, Excalidraw, MainMenu, Sidebar, convertToExcalidrawElements, useHandleLibrary } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ArrowLeft, FolderOpen, Library, Save, Sparkles, Users } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { SharePopover, type ShareCopy } from "./SharePopover";
import type { CollabRoom } from "../collab/constants";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-theme.css";
import { prepareLiveHandle } from "../excalidraw-bridge";
import {
  applySceneCameraNever,
  armSkipInkAfterImmediate,
  editBoardCapturesUndoHotkey,
  editModeHandlesKeyboardGlobally,
  followUpImmediateCapture,
  isSkipInkAfterImmediate,
  scheduleClearSkipInkAfterImmediate,
  sceneExtractPtx,
  undoThroughSelectionDecoy,
} from "./live-board";
import {
  FONT_EXCALIFONT,
  cloneScenePtCustomData,
  createPtRestampState,
  stampPtCustomData,
  toExcalidrawCompatElements,
} from "./scene-bridge";
import {
  bindExcalidrawLibraryWindowName,
  localStorageLibraryAdapter,
} from "./excalidraw-library";
import { observeShortcutDecorations } from "./shortcut-keys";
import { observeSidebarExit, wrapToggleSidebar } from "./sidebar-motion";
import {
  applyThemeInkToElements,
  drawingAppState,
  isDefaultStrokeColor,
  resolveDrawingStrokeColor,
} from "./theme-palette";
import { BlockSidebarIcon, ChartSidebarIcon, ComponentSidebarIcon } from "./catalog-icons";
import { CatalogStyleMenu } from "./CatalogStyleMenu";
import type { ExcalidrawCompatElement } from "./scene-bridge";
import type { PtRadiusToken } from "../components/radius";
import { PT_RADIUS_DEFAULT } from "../components/radius";

export type CaptureUpdate = "IMMEDIATELY" | "EVENTUALLY" | "NEVER";

const catalogRadiusRef = { current: PT_RADIUS_DEFAULT as PtRadiusToken };

export type ExcalidrawHostApi = {
  updateScene: (input: {
    elements?: readonly unknown[];
    appState?: Record<string, unknown>;
    collaborators?: unknown;
    captureUpdate?: CaptureUpdate;
  }) => void;
  scrollToContent: (
    target?: unknown,
    opts?: {
      animate?: boolean;
      duration?: number;
      fitToContent?: boolean;
      minZoom?: number;
      maxZoom?: number;
      canvasOffsets?: { top?: number; right?: number; bottom?: number; left?: number };
    },
  ) => void;
  getSceneElements: () => readonly ExcalidrawCompatElement[];
  getSceneElementsIncludingDeleted: () => readonly ExcalidrawCompatElement[];
  getFiles?: () => Record<string, unknown>;
  addFiles?: (files: unknown[]) => void;
  getAppState: () => {
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    width: number;
    height: number;
    viewBackgroundColor: string;
    selectedElementIds: Record<string, boolean>;
    viewModeEnabled?: boolean;
  };
  history: { clear: () => void };
};

function hydrateHandleElements(elements: readonly unknown[]): unknown[] {
  const source = elements.map((raw) => {
    const el = raw as { id?: string; customData?: { pt?: { id?: string } } };
    return { id: el.id ?? "", customData: el.customData };
  });
  const asLive = elements as { id: string; seed?: number; versionNonce?: number }[];
  // Live-board already ran convert + the single IMMEDIATELY identity bump.
  // Re-converting would reset versionNonce; a second identity bump here would
  // add another History entry.
  const alreadyLive = asLive.every(
    (el) => typeof el.seed === "number" && typeof el.versionNonce === "number",
  );
  const converted = alreadyLive
    ? asLive
    : convertToExcalidrawElements(toExcalidrawCompatElements(elements) as never, { regenerateIds: false });
  const globalRadius = catalogRadiusRef.current;
  return stampPtCustomData(converted as { id: string; customData?: { pt?: { id?: string } } }[], source).map(
    (el) => cloneScenePtCustomData(prepareLiveHandle(el, globalRadius)),
  );
}

function excalidrawHistoryButton(
  root: ParentNode | null | undefined,
  testId: "button-undo" | "button-redo",
): HTMLButtonElement | null {
  if (testId === "button-undo") {
    return root?.querySelector('[data-testid="button-undo"]') ?? null;
  }
  return root?.querySelector('[data-testid="button-redo"]') ?? null;
}

type ExcalidrawApi = ExcalidrawImperativeAPI;

export type BoardMenuItem = {
  id: "give-to-agent" | "save" | "open";
  label: string;
  onSelect: () => void;
};

export type BoardCollaborator = {
  socketId: string;
  username: string;
  pointer?: { x: number; y: number; tool: "pointer" | "laser" };
  button?: "up" | "down";
  selectedElementIds?: Record<string, boolean>;
  color: { background: string; stroke: string };
};

export type ExcalidrawBoardProps = {
  initialElements: ExcalidrawCompatElement[];
  viewBackgroundColor: string;
  theme?: "light" | "dark";
  viewModeEnabled?: boolean;
  onApi: (api: ExcalidrawHostApi) => void;
  onChange: (
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
  ) => void;
  catalog?: React.ReactNode;
  blockCatalog?: React.ReactNode;
  chartCatalog?: React.ReactNode;
  overlay?: React.ReactNode;
  topLeftChrome?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  menuItems?: BoardMenuItem[];
  isCollaborating?: boolean;
  collaborators?: BoardCollaborator[];
  onShare?: () => void;
  sharePanel?: {
    open: boolean;
    url: string | null;
    room: CollabRoom | null;
    username: string;
    clientId?: string;
    apiBase?: string | null;
    copy: ShareCopy;
    onStart: () => void;
    onUsernameChange: (name: string) => void;
    onJoin: (raw: string) => boolean;
    onStop: () => void;
    onClose: () => void;
  };
  catalogStyle?: {
    radius: PtRadiusToken;
    onRadiusChange: (radius: PtRadiusToken) => void;
  };
  onPointerUpdate?: (payload: {
    pointer: { x: number; y: number; tool: "pointer" | "laser" };
    button: "up" | "down";
  }) => void;
};

function menuIcon(id: BoardMenuItem["id"]): React.JSX.Element {
  if (id === "give-to-agent") return <Sparkles size={16} strokeWidth={2} />;
  if (id === "save") return <Save size={16} strokeWidth={2} />;
  return <FolderOpen size={16} strokeWidth={2} />;
}

const PRESS_TAP = { scale: 0.96 };
const PRESS_TRANSITION = { duration: 0.12, ease: [0.16, 1, 0.3, 1] as const };

function ShareTrigger({
  active,
  collaborating,
  title,
  onClick,
}: {
  active: boolean;
  collaborating: boolean;
  title: string;
  onClick: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      className="pt-design-share-trigger sidebar-trigger"
      data-testid="pt-design-share-trigger"
      data-active={active ? "true" : "false"}
      data-collaborating={collaborating ? "true" : "false"}
      title={title}
      aria-label={title}
      aria-expanded={active}
      aria-haspopup="dialog"
      whileTap={reduceMotion ? undefined : PRESS_TAP}
      transition={PRESS_TRANSITION}
      onClick={onClick}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Users size={16} strokeWidth={2} />
      {collaborating ? <span className="pt-design-share-dot" aria-hidden="true" /> : null}
    </motion.button>
  );
}

function CatalogTabPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 280,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}

function IslandTrigger({
  active,
  title,
  testId,
  iconOnly = false,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  testId: string;
  iconOnly?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      className="pt-design-island-trigger sidebar-trigger"
      data-testid={testId}
      data-active={active ? "true" : "false"}
      data-icon-only={iconOnly ? "true" : "false"}
      title={title}
      aria-label={title}
      aria-pressed={active}
      whileTap={reduceMotion ? undefined : PRESS_TAP}
      transition={PRESS_TRANSITION}
      onClick={onClick}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </motion.button>
  );
}

const DISABLE_CANVAS_INVERT = `
.excalidraw.theme--dark canvas {
  filter: none !important;
}
`;

function bindHostApi(api: ExcalidrawApi): ExcalidrawHostApi {
  const restampState = createPtRestampState();
  let recentlyImmediate = false;
  return {
    updateScene: (input) => {
      const captureUpdate =
        input.captureUpdate === undefined
          ? undefined
          : followUpImmediateCapture(input.captureUpdate, recentlyImmediate);
      let hydrated: unknown[] | undefined;
      if (input.elements) {
        hydrated = hydrateHandleElements(input.elements);
        restampState.ingest(hydrated as { id: string; versionNonce?: number; customData?: { pt?: { id?: string } } }[]);
      }
      if (captureUpdate === "IMMEDIATELY") {
        armSkipInkAfterImmediate(api); // skipInkAfterImmediate: no theme ink this frame
        // Nested onChange must not push a second bindHost IMMEDIATELY.
        recentlyImmediate = true;
      }
      api.updateScene({
        ...(hydrated ? { elements: hydrated as never } : {}),
        ...(input.appState ? { appState: input.appState as never } : {}),
        ...(input.collaborators ? { collaborators: input.collaborators as never } : {}),
        ...(captureUpdate ? { captureUpdate } : {}),
      });
      if (captureUpdate === "IMMEDIATELY") {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => {
            recentlyImmediate = false;
          });
        } else {
          queueMicrotask(() => {
            recentlyImmediate = false;
          });
        }
      }
    },
    scrollToContent: () => {
      applySceneCameraNever({
        getAppState: () => api.getAppState(),
        updateScene: (opts) => {
          api.updateScene({
            ...(opts.appState ? { appState: opts.appState as never } : {}),
            captureUpdate: opts.captureUpdate,
          });
        },
      });
    },
    getSceneElements: () => restampState.restamp(api.getSceneElements() as unknown as ExcalidrawCompatElement[]),
    getSceneElementsIncludingDeleted: () =>
      restampState.restamp(api.getSceneElementsIncludingDeleted() as unknown as ExcalidrawCompatElement[]),
    getFiles: () =>
      typeof api.getFiles === "function" ? api.getFiles() : {},
    addFiles: (files) => {
      api.addFiles(files as never);
    },
    getAppState: () => {
      const state = api.getAppState();
      return {
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        zoom: { value: state.zoom.value },
        width: state.width,
        height: state.height,
        viewBackgroundColor: state.viewBackgroundColor,
        selectedElementIds: state.selectedElementIds as Record<string, boolean>,
        viewModeEnabled: state.viewModeEnabled,
      };
    },
    history: {
      clear: () => {
        restampState.clearWitnesses();
        api.history?.clear();
      },
    },
  };
}

export default function ExcalidrawBoard({
  initialElements,
  viewBackgroundColor,
  theme = "light",
  viewModeEnabled = false,
  onApi,
  onChange,
  catalog,
  blockCatalog,
  chartCatalog,
  overlay,
  topLeftChrome,
  onBack,
  backLabel,
  menuItems,
  isCollaborating = false,
  collaborators = [],
  onShare,
  sharePanel,
  catalogStyle,
  onPointerUpdate,
}: ExcalidrawBoardProps) {
  const boardRef = React.useRef<HTMLDivElement>(null);
  const apiRef = React.useRef<ExcalidrawApi | null>(null);
  const onApiRef = React.useRef(onApi);
  const onChangeRef = React.useRef(onChange);
  const themeRef = React.useRef(theme);
  const sharePanelRef = React.useRef(sharePanel);
  const handedOffRef = React.useRef(false);
  const inkFixRef = React.useRef(false);
  const inkEpochRef = React.useRef(0);
  const viewBackgroundColorRef = React.useRef(viewBackgroundColor);
  const viewModeRef = React.useRef(viewModeEnabled);
  const [libraryHost, setLibraryHost] = React.useState<ExcalidrawApi | null>(null);
  const libraryAdapter = React.useMemo(() => localStorageLibraryAdapter(), []);
  onApiRef.current = onApi;
  onChangeRef.current = onChange;
  themeRef.current = theme;
  sharePanelRef.current = sharePanel;
  viewBackgroundColorRef.current = viewBackgroundColor;
  viewModeRef.current = viewModeEnabled;
  catalogRadiusRef.current = catalogStyle?.radius ?? PT_RADIUS_DEFAULT;
  const prevCatalogRadiusRef = React.useRef(catalogRadiusRef.current);

  React.useEffect(() => {
    const next = catalogStyle?.radius ?? PT_RADIUS_DEFAULT;
    if (prevCatalogRadiusRef.current === next) return;
    prevCatalogRadiusRef.current = next;
    const api = apiRef.current;
    if (!api || !handedOffRef.current) return;
    api.updateScene({
      elements: hydrateHandleElements(api.getSceneElementsIncludingDeleted()) as never,
      captureUpdate: "NEVER",
    });
  }, [catalogStyle?.radius]);

  const uiOptions = React.useMemo(
    () => ({
      canvasActions: {
        changeViewBackgroundColor: false,
        clearCanvas: false,
        export: false as const,
        loadScene: false,
        saveAsImage: false,
        saveToActiveFile: false,
        toggleTheme: false,
      },
    }),
    [],
  );

  const bindExcalidrawApi = React.useCallback((api: ExcalidrawApi | null) => {
    if (!api) {
      apiRef.current = null;
      return;
    }
    apiRef.current = api;
    wrapToggleSidebar(api, () => boardRef.current);
  }, []);

  const focusEditBoard = React.useCallback(() => {
    if (viewModeRef.current) return;
    boardRef.current?.querySelector<HTMLElement>(".excalidraw")?.focus({ preventScroll: true });
  }, []);

  const stealEditFocusFromOverlay = React.useCallback((event: { target: EventTarget | null }) => {
    if (viewModeRef.current) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-pt-overlay-id]")) return;
    if (target.closest("[data-pt-text-editing]")) return;
    focusEditBoard();
  }, [focusEditBoard]);

  const captureEditUndoHotkey = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editBoardCapturesUndoHotkey(viewModeRef.current, event.nativeEvent)) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    undoThroughSelectionDecoy({
      extractPtx: () => {
        const api = apiRef.current;
        if (!api) return "";
        return sceneExtractPtx(api.getSceneElements() as never);
      },
      queryUndoControl: () => excalidrawHistoryButton(boardRef.current, "button-undo"),
      afterPaint: (cb) => {
        requestAnimationFrame(cb);
      },
    });
  }, []);

  // `onExcalidrawAPI` fires before the editor is mounted (and again with null
  // on unmount). `restore(initialData)` can still publish an empty scene first.
  // Hand the host API over on the first `onChange` after that restore so
  // loadPersist cannot be wiped by the empty initialData restore.

  const handleSceneChange = React.useCallback(
    (elements: readonly unknown[], appState: {
      cursorButton?: string;
      newElement?: unknown;
      currentItemStrokeColor?: string;
      viewBackgroundColor: string;
      selectedElementIds: Record<string, boolean>;
      scrollX: number;
      scrollY: number;
      zoom: { value: number };
      width: number;
      height: number;
      viewModeEnabled?: boolean;
    }) => {
      const api = apiRef.current;
      if (api && !handedOffRef.current) {
        handedOffRef.current = true;
        wrapToggleSidebar(api, () => boardRef.current);
        setLibraryHost(api);
        onApiRef.current(bindHostApi(api));
        api.updateScene({
          appState: {
            viewBackgroundColor: viewBackgroundColorRef.current,
            theme: themeRef.current,
            currentItemRoughness: 1,
            currentItemFontFamily: FONT_EXCALIFONT,
            viewModeEnabled: viewModeRef.current,
            ...drawingAppState(themeRef.current),
          },
          captureUpdate: "NEVER",
        });
      }
      const typed = elements as unknown as readonly ExcalidrawCompatElement[];
      const drawing = appState.cursorButton === "down" || Boolean(appState.newElement);
      const desiredStroke = resolveDrawingStrokeColor(themeRef.current, appState.currentItemStrokeColor);
      const inked = drawing ? typed : applyThemeInkToElements(typed, themeRef.current);
      const elementsChanged = inked !== typed;
      // Raw updateScene bypasses hydrate. Never write [] (would replaceAllElements
      // empty) and always NEVER so an IMMEDIATELY apply stays on the undo stack.
      // Re-read the live scene in the microtask so a stale applied array cannot
      // overwrite History after undo.
      const shouldWriteElements = elementsChanged && inked.length > 0;
      inkEpochRef.current += 1;
      const inkEpoch = inkEpochRef.current;
      if (isSkipInkAfterImmediate(api)) {
        scheduleClearSkipInkAfterImmediate(api);
      }
      if ((desiredStroke || shouldWriteElements) && !inkFixRef.current) {
        inkFixRef.current = true;
        queueMicrotask(() => {
          try {
            if (inkEpochRef.current !== inkEpoch) return;
            const liveApi = apiRef.current;
            if (!liveApi) return;
            if (isSkipInkAfterImmediate(liveApi)) return;
            const live = liveApi.getSceneElements() as unknown as ExcalidrawCompatElement[];
            if (live.length === 0) return;
            const inkedNow = drawing ? live : applyThemeInkToElements(live, themeRef.current);
            const writeEls = inkedNow !== live && inkedNow.length > 0;
            const stroke = resolveDrawingStrokeColor(
              themeRef.current,
              liveApi.getAppState().currentItemStrokeColor,
            );
            if (!writeEls && !stroke) return;
            liveApi.updateScene({
              ...(writeEls ? { elements: inkedNow as never } : {}),
              ...(stroke ? { appState: { currentItemStrokeColor: stroke } } : {}),
              captureUpdate: "NEVER",
            });
          } finally {
            inkFixRef.current = false;
          }
        });
      }
      onChangeRef.current(inked, {
        viewBackgroundColor: appState.viewBackgroundColor,
        selectedElementIds: appState.selectedElementIds,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: { value: appState.zoom.value },
        width: appState.width,
        height: appState.height,
        viewModeEnabled: appState.viewModeEnabled,
      });
    },
    [],
  );

  React.useEffect(() => {
    const id = "pt-design-excalidraw-theme";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = DISABLE_CANVAS_INVERT;
    document.head.appendChild(style);
  }, []);

  React.useEffect(() => {
    const root = boardRef.current;
    if (!root) return;
    const stopShortcuts = observeShortcutDecorations(root);
    const stopSidebarExit = observeSidebarExit(root, () => apiRef.current);
    return () => {
      stopShortcuts();
      stopSidebarExit();
    };
  }, []);

  React.useEffect(() => {
    bindExcalidrawLibraryWindowName();
  }, []);

  useHandleLibrary({
    excalidrawAPI: libraryHost,
    adapter: libraryAdapter,
  });

  React.useEffect(() => {
    if (!handedOffRef.current) return;
    const ink = drawingAppState(theme);
    const currentStroke = apiRef.current?.getAppState().currentItemStrokeColor;
    apiRef.current?.updateScene({
      appState: {
        viewBackgroundColor,
        theme,
        currentItemRoughness: 1,
        currentItemFontFamily: FONT_EXCALIFONT,
        ...ink,
        ...(isDefaultStrokeColor(currentStroke)
          ? {}
          : { currentItemStrokeColor: currentStroke }),
      },
      captureUpdate: "NEVER",
    });
  }, [theme, viewBackgroundColor]);

  React.useEffect(() => {
    if (!sharePanel?.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") sharePanelRef.current?.onClose();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-testid='pt-design-share-popover']")) return;
      if (target.closest("[data-testid='pt-design-share-trigger']")) return;
      sharePanelRef.current?.onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [sharePanel?.open]);

  React.useEffect(() => {
    const api = apiRef.current;
    if (!api || !handedOffRef.current) return;
    const next = new Map();
    for (const user of collaborators) {
      next.set(user.socketId, {
        username: user.username,
        pointer: user.pointer,
        button: user.button ?? "up",
        selectedElementIds: user.selectedElementIds,
        color: user.color,
        avatarUrl: undefined,
        id: user.socketId,
        socketId: user.socketId,
      });
    }
    api.updateScene({ collaborators: next, captureUpdate: "NEVER" } as never);
  }, [collaborators]);

  return (
    <div
      ref={boardRef}
      data-testid="pt-design-board"
      data-theme={theme}
      data-has-back={onBack ? "true" : undefined}
      onKeyDownCapture={viewModeEnabled ? undefined : captureEditUndoHotkey}
      style={{
        height: "100%",
        width: "100%",
        minHeight: 320,
        background: viewBackgroundColor,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Excalidraw
        theme={theme}
        viewModeEnabled={viewModeEnabled}
        handleKeyboardGlobally={editModeHandlesKeyboardGlobally(viewModeEnabled)}
        UIOptions={uiOptions}
        initialData={{
          elements: initialElements as never,
          appState: {
            viewBackgroundColor,
            theme,
            currentItemRoughness: 1,
            currentItemFontFamily: FONT_EXCALIFONT,
            viewModeEnabled,
            ...drawingAppState(theme),
          },
        }}
        isCollaborating={isCollaborating}
        onPointerUpdate={onPointerUpdate}
        renderTopRightUI={(isMobile, appState) => (
          <div className="pt-design-top-right">
            <div className="pt-design-top-right__actions">
              {onShare ? (
                <ShareTrigger
                  active={Boolean(sharePanel?.open)}
                  collaborating={isCollaborating}
                  title={isCollaborating ? (sharePanel?.copy.openMenu ?? "Collaborate") : (sharePanel?.copy.startMenu ?? "Collaborate")}
                  onClick={onShare}
                />
              ) : null}
              <IslandTrigger
                active={appState.openSidebar?.name === "default"}
                title="Library"
                testId="pt-design-library-trigger"
                iconOnly
                onClick={() => {
                  apiRef.current?.toggleSidebar({ name: "default", tab: "library" });
                }}
              >
                <Library size={16} strokeWidth={2} />
              </IslandTrigger>
              {catalog ? (
                <IslandTrigger
                  active={appState.openSidebar?.name === "components"}
                  title="Component"
                  testId="pt-design-component-trigger"
                  iconOnly={isMobile}
                  onClick={() => {
                    const open = appState.openSidebar;
                    if (open?.name === "components") {
                      apiRef.current?.toggleSidebar({
                        name: "components",
                        tab: open.tab ?? "component",
                      });
                      return;
                    }
                    apiRef.current?.toggleSidebar({ name: "components", tab: "component" });
                  }}
                >
                  <ComponentSidebarIcon size={16} strokeWidth={2} />
                  {isMobile ? null : "Component"}
                </IslandTrigger>
              ) : null}
            </div>
          </div>
        )}
        onExcalidrawAPI={bindExcalidrawApi}
        onChange={handleSceneChange}
      >
        {menuItems && menuItems.length > 0 ? (
          <MainMenu>
            {menuItems.map((item) => (
              <MainMenu.Item
                key={item.id}
                icon={menuIcon(item.id)}
                onSelect={item.onSelect}
              >
                {item.label}
              </MainMenu.Item>
            ))}
          </MainMenu>
        ) : null}
        <DefaultSidebar className="pt-design-library-sidebar" docked={false} onDock={false} />
        {catalog ? (
          <Sidebar name="components" className="pt-design-catalog-sidebar" docked={false}>
            <Sidebar.Tabs>
              <Sidebar.Header>
                <Sidebar.TabTriggers>
                  <Sidebar.TabTrigger tab="component" data-testid="pt-design-catalog-tab-component">
                    <ComponentSidebarIcon size={16} strokeWidth={2} />
                    Component
                  </Sidebar.TabTrigger>
                  <Sidebar.TabTrigger tab="block" data-testid="pt-design-catalog-tab-block">
                    <BlockSidebarIcon size={16} strokeWidth={2} />
                    Block
                  </Sidebar.TabTrigger>
                  {chartCatalog ? (
                    <Sidebar.TabTrigger tab="charts" data-testid="pt-design-catalog-tab-charts">
                      <ChartSidebarIcon size={16} strokeWidth={2} />
                      Charts
                    </Sidebar.TabTrigger>
                  ) : null}
                </Sidebar.TabTriggers>
                {catalogStyle ? (
                  <CatalogStyleMenu radius={catalogStyle.radius} onRadiusChange={catalogStyle.onRadiusChange} />
                ) : null}
              </Sidebar.Header>
              <Sidebar.Tab tab="component">
                <CatalogTabPanel>{catalog}</CatalogTabPanel>
              </Sidebar.Tab>
              <Sidebar.Tab tab="block">
                <CatalogTabPanel>{blockCatalog}</CatalogTabPanel>
              </Sidebar.Tab>
              {chartCatalog ? (
                <Sidebar.Tab tab="charts">
                  <CatalogTabPanel>{chartCatalog}</CatalogTabPanel>
                </Sidebar.Tab>
              ) : null}
            </Sidebar.Tabs>
          </Sidebar>
        ) : null}
      </Excalidraw>
      {onBack ? (
        <button
          type="button"
          className="pt-design-back"
          data-testid="pt-design-back"
          aria-label={backLabel ?? "Back"}
          title={backLabel ?? "Back"}
          onClick={onBack}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        </button>
      ) : null}
      {topLeftChrome}
      {sharePanel?.open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(var(--editor-container-padding, 1rem) + var(--pt-island-pad, 0.25rem) + var(--pt-chrome-size, 2.25rem) + 8px)",
            right: 12,
            zIndex: 20,
          }}
        >
          <SharePopover
            theme={theme}
            username={sharePanel.username}
            clientId={sharePanel.clientId}
            room={sharePanel.room}
            inviteUrl={sharePanel.url}
            apiBase={sharePanel.apiBase}
            copy={sharePanel.copy}
            onStart={sharePanel.onStart}
            onUsernameChange={sharePanel.onUsernameChange}
            onJoin={sharePanel.onJoin}
            onStop={sharePanel.onStop}
          />
        </div>
      ) : null}
      {overlay ? (
        <div
          onPointerDownCapture={viewModeEnabled ? undefined : stealEditFocusFromOverlay}
          onFocusCapture={viewModeEnabled ? undefined : stealEditFocusFromOverlay}
        >
          {overlay}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import "./excalidraw-assets";
import React from "react";
import { Excalidraw, MainMenu, Sidebar } from "@excalidraw/excalidraw";
import { ClipboardCopy, FolderOpen, Frame, Link, Save, Sparkles, Users } from "lucide-react";
import { SharePopover, type CollabMode, type ShareCopy } from "./SharePopover";
import type { CollabRoom } from "../collab/constants";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-theme.css";
import { FONT_HELVETICA } from "../catalog/primitives";
import {
  applyThemeInkToElements,
  drawingAppState,
  isDefaultStrokeColor,
  resolveDrawingStrokeColor,
} from "./theme-palette";
import { ComponentSidebarIcon } from "./catalog-icons";
import type { ExcalidrawCompatElement, ExcalidrawHostApi } from "./scene-bridge";

export type { ExcalidrawHostApi };

type ExcalidrawApi = {
  updateScene: (next: Record<string, unknown>) => void;
  scrollToContent: (target?: unknown, opts?: { animate?: boolean; fitToContent?: boolean }) => void;
  toggleSidebar: (next: { name: string }) => unknown;
  getSceneElements: () => readonly ExcalidrawCompatElement[];
  getSceneElementsIncludingDeleted: () => readonly ExcalidrawCompatElement[];
  getAppState: () => {
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
    width: number;
    height: number;
    viewBackgroundColor: string;
    selectedElementIds: Record<string, boolean>;
    currentItemStrokeColor?: string;
    openSidebar?: { name: string } | null;
  };
};

export type BoardMenuItem = {
  id: "add-frame" | "give-to-agent" | "copy-ir" | "share" | "save" | "open";
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
  onApi: (api: ExcalidrawHostApi) => void;
  onChange: (
    elements: readonly ExcalidrawCompatElement[],
    appState: {
      viewBackgroundColor: string;
      selectedElementIds: Record<string, boolean>;
    },
  ) => void;
  catalog?: React.ReactNode;
  overlay?: React.ReactNode;
  menuItems?: BoardMenuItem[];
  isCollaborating?: boolean;
  collaborators?: BoardCollaborator[];
  onShare?: () => void;
  sharePanel?: {
    open: boolean;
    url: string | null;
    room: CollabRoom | null;
    mode: CollabMode;
    username: string;
    apiBase?: string | null;
    copy: ShareCopy;
    onModeChange: (mode: CollabMode) => void;
    onUsernameChange: (name: string) => void;
    onJoin: (raw: string) => boolean;
    onStop: () => void;
    onClose: () => void;
  };
  onPointerUpdate?: (payload: {
    pointer: { x: number; y: number; tool: "pointer" | "laser" };
    button: "up" | "down";
  }) => void;
};

function menuIcon(id: BoardMenuItem["id"]): React.JSX.Element {
  if (id === "add-frame") return <Frame size={16} strokeWidth={2} />;
  if (id === "give-to-agent") return <Sparkles size={16} strokeWidth={2} />;
  if (id === "share") return <Link size={16} strokeWidth={2} />;
  if (id === "save") return <Save size={16} strokeWidth={2} />;
  if (id === "open") return <FolderOpen size={16} strokeWidth={2} />;
  return <ClipboardCopy size={16} strokeWidth={2} />;
}

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
  return (
    <button
      type="button"
      className="pt-design-share-trigger"
      data-testid="pt-design-share-trigger"
      data-active={active ? "true" : "false"}
      data-collaborating={collaborating ? "true" : "false"}
      title={title}
      aria-label={title}
      aria-expanded={active}
      aria-haspopup="dialog"
      onClick={onClick}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <Users size={16} strokeWidth={2} />
      {collaborating ? <span className="pt-design-share-dot" aria-hidden="true" /> : null}
    </button>
  );
}

function ComponentTrigger({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="sidebar-trigger"
      data-testid="pt-design-component-trigger"
      title="Component"
      aria-pressed={active}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 36,
        padding: "0 10px",
        marginLeft: 8,
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        background: active
          ? "var(--muted, var(--color-surface-high))"
          : "var(--island-bg-color, var(--card))",
        color: "var(--icon-fill-color, var(--foreground, inherit))",
        boxShadow: "0 0 0 1px var(--border, rgba(0,0,0,0.10))",
      }}
    >
      <ComponentSidebarIcon size={16} strokeWidth={2} />
      Component
    </button>
  );
}

const DISABLE_CANVAS_INVERT = `
.excalidraw.theme--dark canvas {
  filter: none !important;
}
`;

function bindHostApi(api: ExcalidrawApi): ExcalidrawHostApi {
  return {
    updateScene: (input) => {
      api.updateScene({
        ...(input.elements ? { elements: input.elements as never } : {}),
        ...(input.appState ? { appState: input.appState as never } : {}),
      });
    },
    scrollToContent: (target, opts) => {
      api.scrollToContent(target as never, opts);
    },
    getSceneElements: () =>
      api.getSceneElements() as unknown as readonly ExcalidrawCompatElement[],
    getSceneElementsIncludingDeleted: () =>
      api.getSceneElementsIncludingDeleted() as unknown as readonly ExcalidrawCompatElement[],
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
      };
    },
  };
}

export default function ExcalidrawBoard({
  initialElements,
  viewBackgroundColor,
  theme = "light",
  onApi,
  onChange,
  catalog,
  overlay,
  menuItems,
  isCollaborating = false,
  collaborators = [],
  onShare,
  sharePanel,
  onPointerUpdate,
}: ExcalidrawBoardProps) {
  const apiRef = React.useRef<ExcalidrawApi | null>(null);
  const onApiRef = React.useRef(onApi);
  const sharePanelRef = React.useRef(sharePanel);
  const handedOffRef = React.useRef(false);
  const inkFixRef = React.useRef(false);
  onApiRef.current = onApi;
  sharePanelRef.current = sharePanel;

  React.useEffect(() => {
    const id = "pt-design-excalidraw-theme";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = DISABLE_CANVAS_INVERT;
    document.head.appendChild(style);
  }, []);

  // Excalidraw calls `excalidrawAPI` from `_App`'s constructor — before mount.
  // Hand the host API over only after this board (and `_App`) have committed.
  React.useEffect(() => {
    const api = apiRef.current;
    if (!api || handedOffRef.current) return;
    handedOffRef.current = true;
    onApiRef.current(bindHostApi(api));
    api.updateScene({
      appState: {
        viewBackgroundColor,
        theme,
        currentItemRoughness: 1,
        currentItemFontFamily: FONT_HELVETICA,
        ...drawingAppState(theme),
      },
    });
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
        currentItemFontFamily: FONT_HELVETICA,
        ...ink,
        ...(isDefaultStrokeColor(currentStroke)
          ? {}
          : { currentItemStrokeColor: currentStroke }),
      },
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
    api.updateScene({ collaborators: next } as never);
  }, [collaborators]);

  return (
    <div
      data-testid="pt-design-board"
      data-theme={theme}
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
        handleKeyboardGlobally={false}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveAsImage: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
        initialData={{
          elements: initialElements as never,
          appState: {
            viewBackgroundColor,
            theme,
            currentItemRoughness: 1,
            currentItemFontFamily: FONT_HELVETICA,
            ...drawingAppState(theme),
          },
        }}
        isCollaborating={isCollaborating}
        onPointerUpdate={onPointerUpdate}
        renderTopRightUI={(_mobile, appState) => (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onShare ? (
              <ShareTrigger
                active={Boolean(sharePanel?.open)}
                collaborating={isCollaborating}
                title={isCollaborating ? (sharePanel?.copy.openMenu ?? "Live share") : (sharePanel?.copy.startMenu ?? "Start live share")}
                onClick={onShare}
              />
            ) : null}
            {catalog ? (
              <ComponentTrigger
                active={appState.openSidebar?.name === "components"}
                onClick={() => {
                  apiRef.current?.toggleSidebar({ name: "components" });
                }}
              />
            ) : null}
          </div>
        )}
        excalidrawAPI={(api) => {
          apiRef.current = api as unknown as ExcalidrawApi;
        }}
        onChange={(elements, appState) => {
          const typed = elements as unknown as readonly ExcalidrawCompatElement[];
          const drawing = appState.cursorButton === "down" || Boolean(appState.newElement);
          const desiredStroke = resolveDrawingStrokeColor(theme, appState.currentItemStrokeColor);
          const inked = drawing ? typed : applyThemeInkToElements(typed, theme);
          const elementsChanged = inked !== typed;
          if ((desiredStroke || elementsChanged) && !inkFixRef.current) {
            inkFixRef.current = true;
            queueMicrotask(() => {
              try {
                apiRef.current?.updateScene({
                  ...(elementsChanged ? { elements: inked } : {}),
                  ...(desiredStroke ? { appState: { currentItemStrokeColor: desiredStroke } } : {}),
                  captureUpdate: "NEVER",
                });
              } finally {
                inkFixRef.current = false;
              }
            });
          }
          onChange(inked, {
            viewBackgroundColor: appState.viewBackgroundColor,
            selectedElementIds: appState.selectedElementIds as Record<string, boolean>,
          });
        }}
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
        {catalog ? (
          <Sidebar name="components">
            <Sidebar.Header />
            <div
              style={{
                flex: 1,
                minHeight: 280,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {catalog}
            </div>
          </Sidebar>
        ) : null}
      </Excalidraw>
      {sharePanel?.open ? (
        <div
          style={{
            position: "absolute",
            top: 56,
            right: 12,
            zIndex: 20,
          }}
        >
          <SharePopover
            theme={theme}
            username={sharePanel.username}
            room={sharePanel.room}
            inviteUrl={sharePanel.url}
            mode={sharePanel.mode}
            apiBase={sharePanel.apiBase}
            copy={sharePanel.copy}
            onModeChange={sharePanel.onModeChange}
            onUsernameChange={sharePanel.onUsernameChange}
            onJoin={sharePanel.onJoin}
            onStop={sharePanel.onStop}
          />
        </div>
      ) : null}
      {overlay}
    </div>
  );
}

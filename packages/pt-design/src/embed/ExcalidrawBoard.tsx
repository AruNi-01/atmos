"use client";

import "./excalidraw-assets";
import React from "react";
import { Excalidraw, Sidebar } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-theme.css";
import { FONT_HELVETICA } from "../catalog/primitives";
import { ComponentSidebarIcon } from "./catalog-icons";
import type { ExcalidrawCompatElement, ExcalidrawHostApi } from "./scene-bridge";

export type { ExcalidrawHostApi };

type ExcalidrawApi = {
  updateScene: (next: Record<string, unknown>) => void;
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
    openSidebar?: { name: string } | null;
  };
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
};

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
          ? "var(--color-surface-high, rgba(127,127,127,0.22))"
          : "var(--island-bg-color, var(--button-gray-1, #232329))",
        color: "var(--icon-fill-color, var(--color-on-surface, inherit))",
        boxShadow: "0 0 0 1px var(--color-surface-lowest, rgba(0,0,0,0.08))",
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

export default function ExcalidrawBoard({
  initialElements,
  viewBackgroundColor,
  theme = "light",
  onApi,
  onChange,
  catalog,
}: ExcalidrawBoardProps) {
  const apiRef = React.useRef<ExcalidrawApi | null>(null);

  React.useEffect(() => {
    const id = "pt-design-excalidraw-theme";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = DISABLE_CANVAS_INVERT;
    document.head.appendChild(style);
  }, []);

  React.useEffect(() => {
    apiRef.current?.updateScene({
      appState: {
        viewBackgroundColor,
        theme,
        currentItemRoughness: 1,
        currentItemFontFamily: FONT_HELVETICA,
      },
    });
  }, [theme, viewBackgroundColor]);

  return (
    <div
      data-testid="pt-design-board"
      data-theme={theme}
      style={{ height: "100%", width: "100%", minHeight: 320, background: viewBackgroundColor }}
    >
      <Excalidraw
        theme={theme}
        handleKeyboardGlobally={false}
        UIOptions={{
          canvasActions: {
            loadScene: false,
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
          },
        }}
        renderTopRightUI={(_mobile, appState) =>
          catalog ? (
            <ComponentTrigger
              active={appState.openSidebar?.name === "components"}
              onClick={() => {
                apiRef.current?.toggleSidebar({ name: "components" });
              }}
            />
          ) : null
        }
        excalidrawAPI={(api) => {
          apiRef.current = api as unknown as ExcalidrawApi;
          onApi({
            updateScene: (input) => {
              api.updateScene({
                ...(input.elements ? { elements: input.elements as never } : {}),
                ...(input.appState ? { appState: input.appState as never } : {}),
              });
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
          });
        }}
        onChange={(elements, appState) => {
          onChange(elements as unknown as readonly ExcalidrawCompatElement[], {
            viewBackgroundColor: appState.viewBackgroundColor,
            selectedElementIds: appState.selectedElementIds as Record<string, boolean>,
          });
        }}
      >
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
    </div>
  );
}

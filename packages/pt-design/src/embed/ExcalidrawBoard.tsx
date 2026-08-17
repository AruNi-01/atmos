"use client";

import React from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawCompatElement, ExcalidrawHostApi } from "./scene-bridge";

export type { ExcalidrawHostApi };

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
};

export default function ExcalidrawBoard({
  initialElements,
  viewBackgroundColor,
  theme = "light",
  onApi,
  onChange,
}: ExcalidrawBoardProps) {
  const apiRef = React.useRef<{
    updateScene: (next: Record<string, unknown>) => void;
  } | null>(null);

  React.useEffect(() => {
    apiRef.current?.updateScene({
      appState: { viewBackgroundColor, theme },
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
          },
        }}
        excalidrawAPI={(api) => {
          apiRef.current = api;
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
      />
    </div>
  );
}

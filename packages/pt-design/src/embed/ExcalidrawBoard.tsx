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
  theme,
  onApi,
  onChange,
}: ExcalidrawBoardProps) {
  return (
    <div data-testid="pt-design-board" style={{ height: "100%", width: "100%", minHeight: 320 }}>
      <Excalidraw
        theme={theme === "dark" ? "dark" : "light"}
        handleKeyboardGlobally={false}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
          },
        }}
        initialData={{
          elements: initialElements as never,
          appState: {
            viewBackgroundColor,
          },
        }}
        excalidrawAPI={(api) => {
          onApi({
            updateScene: (input) => {
              api.updateScene({ elements: input.elements as never });
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

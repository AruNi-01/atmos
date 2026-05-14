"use client";

import type { TLShapeId } from "tldraw";
import { create } from "zustand";

interface CanvasRuntimeState {
  activeShapeId: TLShapeId | null;
  renderedShapeIds: TLShapeId[];
  setActiveShapeId: (shapeId: TLShapeId | null) => void;
  setRenderedShapeIds: (shapeIds: TLShapeId[]) => void;
  removeRenderedShapeId: (shapeId: TLShapeId) => void;
  reset: () => void;
}

export const useCanvasRuntime = create<CanvasRuntimeState>((set) => ({
  activeShapeId: null,
  renderedShapeIds: [],
  setActiveShapeId: (shapeId) => set({ activeShapeId: shapeId }),
  setRenderedShapeIds: (shapeIds) => set({ renderedShapeIds: shapeIds }),
  removeRenderedShapeId: (shapeId) =>
    set((state) => ({
      renderedShapeIds: state.renderedShapeIds.filter((currentShapeId) => currentShapeId !== shapeId),
    })),
  reset: () => set({ activeShapeId: null, renderedShapeIds: [] }),
}));

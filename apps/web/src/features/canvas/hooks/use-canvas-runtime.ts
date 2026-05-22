"use client";

import type { TLShapeId } from "tldraw";
import { create } from "zustand";

interface CanvasRuntimeState {
  activeShapeId: TLShapeId | null;
  renderedShapeIds: TLShapeId[];
  focusPulseShapeId: TLShapeId | null;
  setActiveShapeId: (shapeId: TLShapeId | null) => void;
  setRenderedShapeIds: (shapeIds: TLShapeId[]) => void;
  setFocusPulseShapeId: (shapeId: TLShapeId | null) => void;
  removeRenderedShapeId: (shapeId: TLShapeId) => void;
  reset: () => void;
}

export const useCanvasRuntime = create<CanvasRuntimeState>((set) => ({
  activeShapeId: null,
  renderedShapeIds: [],
  focusPulseShapeId: null,
  setActiveShapeId: (shapeId) => set({ activeShapeId: shapeId }),
  setRenderedShapeIds: (shapeIds) => set({ renderedShapeIds: shapeIds }),
  setFocusPulseShapeId: (shapeId) => set({ focusPulseShapeId: shapeId }),
  removeRenderedShapeId: (shapeId) =>
    set((state) => ({
      renderedShapeIds: state.renderedShapeIds.filter((currentShapeId) => currentShapeId !== shapeId),
    })),
  reset: () => set({ activeShapeId: null, renderedShapeIds: [], focusPulseShapeId: null }),
}));

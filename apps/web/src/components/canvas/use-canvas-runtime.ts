"use client";

import { create } from "zustand";

interface CanvasRuntimeState {
  activeShapeId: string | null;
  setActiveShapeId: (shapeId: string | null) => void;
  reset: () => void;
}

export const useCanvasRuntime = create<CanvasRuntimeState>((set) => ({
  activeShapeId: null,
  setActiveShapeId: (shapeId) => set({ activeShapeId: shapeId }),
  reset: () => set({ activeShapeId: null }),
}));

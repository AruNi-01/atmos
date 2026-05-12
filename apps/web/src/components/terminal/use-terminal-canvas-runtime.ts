"use client";

import { create } from "zustand";

interface TerminalCanvasRuntimeState {
  activeShapeId: string | null;
  setActiveShapeId: (shapeId: string | null) => void;
  reset: () => void;
}

export const useTerminalCanvasRuntime = create<TerminalCanvasRuntimeState>((set) => ({
  activeShapeId: null,
  setActiveShapeId: (shapeId) => set({ activeShapeId: shapeId }),
  reset: () => set({ activeShapeId: null }),
}));

"use client";

import type { TLShapeId } from "tldraw";
import { create } from "zustand";

import type { PendingTerminalRun } from "@/features/terminal/lib/terminal-agent-run-delivery";

export interface CanvasUnsupportedInteractionNotice {
  widgetLabel: string | null;
  targetPath: string | null;
}

interface CanvasRuntimeState {
  activeShapeId: TLShapeId | null;
  renderedShapeIds: TLShapeId[];
  focusPulseShapeIds: TLShapeId[];
  pendingTerminalRuns: Record<string, PendingTerminalRun>;
  unsupportedInteractionNotice: CanvasUnsupportedInteractionNotice | null;
  consumePendingTerminalRun: (shapeId: TLShapeId) => PendingTerminalRun | null;
  queuePendingTerminalRun: (shapeId: TLShapeId, run: PendingTerminalRun) => void;
  setActiveShapeId: (shapeId: TLShapeId | null) => void;
  setRenderedShapeIds: (shapeIds: TLShapeId[]) => void;
  setFocusPulseShapeIds: (shapeIds: TLShapeId[]) => void;
  removeRenderedShapeId: (shapeId: TLShapeId) => void;
  showUnsupportedInteraction: (notice: CanvasUnsupportedInteractionNotice) => void;
  dismissUnsupportedInteraction: () => void;
  reset: () => void;
}

export const useCanvasRuntimeStore = create<CanvasRuntimeState>((set) => ({
  activeShapeId: null,
  renderedShapeIds: [],
  focusPulseShapeIds: [],
  pendingTerminalRuns: {},
  unsupportedInteractionNotice: null,
  consumePendingTerminalRun: (shapeId) => {
    let run: PendingTerminalRun | null = null;
    set((state) => {
      run = state.pendingTerminalRuns[shapeId] ?? null;
      if (!run) {
        return state;
      }
      const next = { ...state.pendingTerminalRuns };
      delete next[shapeId];
      return { pendingTerminalRuns: next };
    });
    return run;
  },
  queuePendingTerminalRun: (shapeId, run) =>
    set((state) => ({
      pendingTerminalRuns: {
        ...state.pendingTerminalRuns,
        [shapeId]: run,
      },
    })),
  setActiveShapeId: (shapeId) => set({ activeShapeId: shapeId }),
  setRenderedShapeIds: (shapeIds) => set({ renderedShapeIds: shapeIds }),
  setFocusPulseShapeIds: (shapeIds) => set({ focusPulseShapeIds: shapeIds }),
  removeRenderedShapeId: (shapeId) =>
    set((state) => ({
      renderedShapeIds: state.renderedShapeIds.filter((currentShapeId) => currentShapeId !== shapeId),
    })),
  showUnsupportedInteraction: (notice) => set({ unsupportedInteractionNotice: notice }),
  dismissUnsupportedInteraction: () => set({ unsupportedInteractionNotice: null }),
  reset: () =>
    set({
      activeShapeId: null,
      renderedShapeIds: [],
      focusPulseShapeIds: [],
      pendingTerminalRuns: {},
      unsupportedInteractionNotice: null,
    }),
}));

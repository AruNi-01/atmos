"use client";

import type { TLShapeId } from "tldraw";
import { create } from "zustand";

export interface CanvasUnsupportedInteractionNotice {
  widgetLabel: string | null;
  targetPath: string | null;
}

interface CanvasRuntimeState {
  activeShapeId: TLShapeId | null;
  renderedShapeIds: TLShapeId[];
  focusPulseShapeId: TLShapeId | null;
  pendingTerminalCommands: Record<string, string>;
  unsupportedInteractionNotice: CanvasUnsupportedInteractionNotice | null;
  consumePendingTerminalCommand: (shapeId: TLShapeId) => string | null;
  queuePendingTerminalCommand: (shapeId: TLShapeId, command: string) => void;
  setActiveShapeId: (shapeId: TLShapeId | null) => void;
  setRenderedShapeIds: (shapeIds: TLShapeId[]) => void;
  setFocusPulseShapeId: (shapeId: TLShapeId | null) => void;
  removeRenderedShapeId: (shapeId: TLShapeId) => void;
  showUnsupportedInteraction: (notice: CanvasUnsupportedInteractionNotice) => void;
  dismissUnsupportedInteraction: () => void;
  reset: () => void;
}

export const useCanvasRuntimeStore = create<CanvasRuntimeState>((set) => ({
  activeShapeId: null,
  renderedShapeIds: [],
  focusPulseShapeId: null,
  pendingTerminalCommands: {},
  unsupportedInteractionNotice: null,
  consumePendingTerminalCommand: (shapeId) => {
    let command: string | null = null;
    set((state) => {
      command = state.pendingTerminalCommands[shapeId] ?? null;
      if (!command) {
        return state;
      }
      const next = { ...state.pendingTerminalCommands };
      delete next[shapeId];
      return { pendingTerminalCommands: next };
    });
    return command;
  },
  queuePendingTerminalCommand: (shapeId, command) =>
    set((state) => ({
      pendingTerminalCommands: {
        ...state.pendingTerminalCommands,
        [shapeId]: command,
      },
    })),
  setActiveShapeId: (shapeId) => set({ activeShapeId: shapeId }),
  setRenderedShapeIds: (shapeIds) => set({ renderedShapeIds: shapeIds }),
  setFocusPulseShapeId: (shapeId) => set({ focusPulseShapeId: shapeId }),
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
      focusPulseShapeId: null,
      pendingTerminalCommands: {},
      unsupportedInteractionNotice: null,
    }),
}));

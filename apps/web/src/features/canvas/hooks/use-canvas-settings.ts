'use client';

import { create } from 'zustand';
import { functionSettingsApi } from '@/api/ws-api';
import { useFunctionSettingsStore } from '@/features/settings/hooks/use-function-settings-store';
import { toastManager } from '@workspace/ui';

interface CanvasSettingsState {
  autoSaveInterval: number; // in seconds
  maxRenderedTerminals: number;
  /** Tmux / xterm lines when copying or `extract-text` on canvas terminals. */
  terminalContextMaxLines: number;
  loaded: boolean;
  loading: boolean;
  loadSettings: () => Promise<void>;
  setAutoSaveInterval: (interval: number) => Promise<void>;
  setMaxRenderedTerminals: (count: number) => Promise<void>;
  setTerminalContextMaxLines: (lines: number) => Promise<void>;
}

export const DEFAULT_CANVAS_AUTO_SAVE_INTERVAL = 1;
export const DEFAULT_CANVAS_MAX_RENDERED_TERMINALS = 10;
export const DEFAULT_CANVAS_TERMINAL_CONTEXT_MAX_LINES = 300;
export const MIN_CANVAS_MAX_RENDERED_TERMINALS = 1;
export const MAX_CANVAS_MAX_RENDERED_TERMINALS = 50;
export const MIN_CANVAS_TERMINAL_CONTEXT_MAX_LINES = 50;
export const MAX_CANVAS_TERMINAL_CONTEXT_MAX_LINES = 2_000;

export function normalizeCanvasMaxRenderedTerminals(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CANVAS_MAX_RENDERED_TERMINALS;
  }

  return Math.min(
    MAX_CANVAS_MAX_RENDERED_TERMINALS,
    Math.max(MIN_CANVAS_MAX_RENDERED_TERMINALS, Math.trunc(value)),
  );
}

export function normalizeCanvasTerminalContextMaxLines(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_CANVAS_TERMINAL_CONTEXT_MAX_LINES;
  }

  return Math.min(
    MAX_CANVAS_TERMINAL_CONTEXT_MAX_LINES,
    Math.max(MIN_CANVAS_TERMINAL_CONTEXT_MAX_LINES, Math.trunc(value)),
  );
}

/** Lines to capture for canvas terminal copy / agent extract-text (reads canvas settings). */
export function resolveCanvasTerminalContextMaxLines(): number {
  const state = useCanvasSettings.getState();
  if (!state.loaded) {
    return DEFAULT_CANVAS_TERMINAL_CONTEXT_MAX_LINES;
  }
  return state.terminalContextMaxLines;
}

let maxRenderedTerminalsRequestId = 0;
let lastPersistedMaxRenderedTerminals = DEFAULT_CANVAS_MAX_RENDERED_TERMINALS;
let terminalContextMaxLinesRequestId = 0;
let lastPersistedTerminalContextMaxLines = DEFAULT_CANVAS_TERMINAL_CONTEXT_MAX_LINES;

export const useCanvasSettings = create<CanvasSettingsState>((set, get) => ({
  autoSaveInterval: DEFAULT_CANVAS_AUTO_SAVE_INTERVAL,
  maxRenderedTerminals: DEFAULT_CANVAS_MAX_RENDERED_TERMINALS,
  terminalContextMaxLines: DEFAULT_CANVAS_TERMINAL_CONTEXT_MAX_LINES,
  loaded: false,
  loading: false,

  loadSettings: async () => {
    if (get().loaded || get().loading) return;

    set({ loading: true });

    try {
      const settings = await useFunctionSettingsStore.getState().load();
      const maxRenderedTerminals = normalizeCanvasMaxRenderedTerminals(
        settings.canvas?.max_rendered_terminals,
      );
      const terminalContextMaxLines = normalizeCanvasTerminalContextMaxLines(
        settings.canvas?.terminal_context_max_lines,
      );
      lastPersistedMaxRenderedTerminals = maxRenderedTerminals;
      lastPersistedTerminalContextMaxLines = terminalContextMaxLines;
      set({
        autoSaveInterval: settings.canvas?.auto_save_interval ?? DEFAULT_CANVAS_AUTO_SAVE_INTERVAL,
        maxRenderedTerminals,
        terminalContextMaxLines,
        loaded: true,
        loading: false,
      });
    } catch {
      set({ loading: false });
      toastManager.add({
        title: 'Settings Load Failed',
        description: 'Could not load canvas preferences from the server.',
        type: 'error',
      });
    }
  },

  setAutoSaveInterval: async (autoSaveInterval) => {
    const previous = get().autoSaveInterval;
    set({ autoSaveInterval });

    try {
      await functionSettingsApi.update('canvas', 'auto_save_interval', autoSaveInterval);
    } catch {
      set({ autoSaveInterval: previous });
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the canvas auto-save interval.',
        type: 'error',
      });
    }
  },

  setMaxRenderedTerminals: async (maxRenderedTerminals) => {
    const normalizedMaxRenderedTerminals = normalizeCanvasMaxRenderedTerminals(maxRenderedTerminals);
    const requestId = ++maxRenderedTerminalsRequestId;
    set({ maxRenderedTerminals: normalizedMaxRenderedTerminals });

    try {
      await functionSettingsApi.update(
        'canvas',
        'max_rendered_terminals',
        normalizedMaxRenderedTerminals,
      );
      if (maxRenderedTerminalsRequestId === requestId) {
        lastPersistedMaxRenderedTerminals = normalizedMaxRenderedTerminals;
      }
    } catch {
      if (maxRenderedTerminalsRequestId === requestId) {
        set({ maxRenderedTerminals: lastPersistedMaxRenderedTerminals });
      }
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the canvas rendered terminal limit.',
        type: 'error',
      });
    }
  },

  setTerminalContextMaxLines: async (terminalContextMaxLines) => {
    const normalized = normalizeCanvasTerminalContextMaxLines(terminalContextMaxLines);
    const requestId = ++terminalContextMaxLinesRequestId;
    set({ terminalContextMaxLines: normalized });

    try {
      await functionSettingsApi.update(
        'canvas',
        'terminal_context_max_lines',
        normalized,
      );
      if (terminalContextMaxLinesRequestId === requestId) {
        lastPersistedTerminalContextMaxLines = normalized;
      }
    } catch {
      if (terminalContextMaxLinesRequestId === requestId) {
        set({ terminalContextMaxLines: lastPersistedTerminalContextMaxLines });
      }
      toastManager.add({
        title: 'Settings Sync Failed',
        description: 'Failed to update the canvas terminal context line limit.',
        type: 'error',
      });
    }
  },
}));

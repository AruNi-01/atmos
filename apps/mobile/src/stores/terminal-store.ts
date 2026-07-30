import { create } from "zustand";
import { nextActiveTerminalEntryId } from "@/features/terminal/terminal-selection";

export type MobileTerminalEntry = {
  id: string;
  workspaceId: string;
  label: string;
  tmuxWindowName?: string;
  tmuxWindowIndex?: number;
  sessionId?: string;
  agentLabel?: string;
  dynamicTitle?: string;
  /** Native OSC 0/2 title; transient display-only (APP-047). */
  oscTitle?: string;
  isNew?: boolean;
};

type TerminalState = {
  entriesByWorkspaceId: Record<string, MobileTerminalEntry[]>;
  activeEntryIdByWorkspaceId: Record<string, string | null>;
  setEntries: (workspaceId: string, entries: MobileTerminalEntry[]) => void;
  setActiveEntry: (workspaceId: string, entryId: string | null) => void;
  addEntry: (entry: MobileTerminalEntry) => void;
  updateEntry: (workspaceId: string, entryId: string, patch: Partial<MobileTerminalEntry>) => void;
  clearAll: () => void;
};

export const useTerminalStore = create<TerminalState>((set) => ({
  entriesByWorkspaceId: {},
  activeEntryIdByWorkspaceId: {},
  setEntries: (workspaceId, entries) =>
    set((state) => ({
      entriesByWorkspaceId: {
        ...state.entriesByWorkspaceId,
        [workspaceId]: entries,
      },
      activeEntryIdByWorkspaceId: {
        ...state.activeEntryIdByWorkspaceId,
        [workspaceId]: nextActiveTerminalEntryId(entries, state.activeEntryIdByWorkspaceId[workspaceId]),
      },
    })),
  setActiveEntry: (workspaceId, entryId) =>
    set((state) => ({
      activeEntryIdByWorkspaceId: {
        ...state.activeEntryIdByWorkspaceId,
        [workspaceId]: entryId,
      },
    })),
  addEntry: (entry) =>
    set((state) => {
      const existing = state.entriesByWorkspaceId[entry.workspaceId] ?? [];
      return {
        entriesByWorkspaceId: {
          ...state.entriesByWorkspaceId,
          [entry.workspaceId]: [...existing, entry],
        },
        activeEntryIdByWorkspaceId: {
          ...state.activeEntryIdByWorkspaceId,
          [entry.workspaceId]: entry.id,
        },
      };
    }),
  updateEntry: (workspaceId, entryId, patch) =>
    set((state) => {
      const existing = state.entriesByWorkspaceId[workspaceId] ?? [];
      return {
        entriesByWorkspaceId: {
          ...state.entriesByWorkspaceId,
          [workspaceId]: existing.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
        },
      };
    }),
  clearAll: () =>
    set({
      entriesByWorkspaceId: {},
      activeEntryIdByWorkspaceId: {},
    }),
}));

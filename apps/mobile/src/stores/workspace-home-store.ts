import { create } from "zustand";
import {
  EMPTY_WORKSPACE_HOME_FILTERS,
  type WorkspaceGrouping,
  type WorkspaceHomeFilters,
} from "@/features/workspaces/workspace-home-list";

type WorkspaceHomeState = {
  expanded: Record<string, boolean>;
  filters: WorkspaceHomeFilters;
  grouping: WorkspaceGrouping;
  recentExpanded: boolean;
  toggleRecent: () => void;
  setGrouping: (grouping: WorkspaceGrouping) => void;
  toggleExpanded: (key: string) => void;
  toggleFilter: (key: keyof Omit<WorkspaceHomeFilters, "showAutomation">, id: string) => void;
  toggleAutomation: () => void;
};

export const useWorkspaceHomeStore = create<WorkspaceHomeState>((set) => ({
  expanded: {},
  filters: EMPTY_WORKSPACE_HOME_FILTERS,
  grouping: "project",
  recentExpanded: true,
  toggleRecent: () => set((state) => ({ recentExpanded: !state.recentExpanded })),
  setGrouping: (grouping) => set({ grouping }),
  toggleExpanded: (key) =>
    set((state) => ({
      expanded: { ...state.expanded, [key]: state.expanded[key] === false },
    })),
  toggleFilter: (key, id) =>
    set((state) => {
      const current = state.filters[key];
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      return { filters: { ...state.filters, [key]: next } };
    }),
  toggleAutomation: () =>
    set((state) => ({
      filters: { ...state.filters, showAutomation: !state.filters.showAutomation },
    })),
}));

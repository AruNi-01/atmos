"use client";

import { create } from "zustand";

export const CHANGES_TAB_VALUE = "changes";
export const REVIEW_TAB_VALUE = "review";
export const RUN_TAB_VALUE = "run";
export const GITHUB_HUB_TAB_VALUE = "github";
export const FILES_TAB_VALUE = "files";
export const PT_DESIGN_TAB_VALUE = "pt-design";

export const CENTER_TOOL_TAB_VALUES = [
  CHANGES_TAB_VALUE,
  REVIEW_TAB_VALUE,
  RUN_TAB_VALUE,
  GITHUB_HUB_TAB_VALUE,
  FILES_TAB_VALUE,
  PT_DESIGN_TAB_VALUE,
] as const;

export type CenterToolTabValue = (typeof CENTER_TOOL_TAB_VALUES)[number];

const TOOL_TAB_SET = new Set<string>(CENTER_TOOL_TAB_VALUES);

export function isCenterToolTabValue(
  value: string | null | undefined,
): value is CenterToolTabValue {
  return Boolean(value && TOOL_TAB_SET.has(value));
}

type ToolCenterTabStore = {
  visibleByContext: Record<string, Partial<Record<CenterToolTabValue, boolean>>>;
  open: (contextId: string, tab: CenterToolTabValue) => void;
  close: (contextId: string, tab: CenterToolTabValue) => void;
  isOpen: (contextId: string, tab: CenterToolTabValue) => boolean;
};

export const useToolCenterTabsStore = create<ToolCenterTabStore>((set, get) => ({
  visibleByContext: {},
  open: (contextId, tab) => {
    if (!contextId) return;
    set((state) => {
      const current = state.visibleByContext[contextId];
      if (current?.[tab]) return state;
      return {
        visibleByContext: {
          ...state.visibleByContext,
          [contextId]: { ...current, [tab]: true },
        },
      };
    });
  },
  close: (contextId, tab) => {
    if (!contextId) return;
    set((state) => {
      const current = state.visibleByContext[contextId];
      if (!current?.[tab]) return state;
      return {
        visibleByContext: {
          ...state.visibleByContext,
          [contextId]: { ...current, [tab]: false },
        },
      };
    });
  },
  isOpen: (contextId, tab) =>
    Boolean(get().visibleByContext[contextId]?.[tab]),
}));

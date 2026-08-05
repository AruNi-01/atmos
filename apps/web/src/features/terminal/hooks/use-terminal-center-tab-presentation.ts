"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  FIXED_TERMINAL_TAB_VALUE,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import {
  getScopeKey,
  getWorkspaceTerminalTabs,
} from "@/features/terminal/store/terminal-store-helpers";
import {
  resolveTerminalCenterTabPresentation,
  type TerminalCenterTabPresentation,
} from "@/features/terminal/lib/terminal-center-tab-presentation";
import { useAgentTitleSettingsStore } from "@/features/settings/store/agent-title-settings-store";
import type { TerminalPaneAgent, TerminalPaneProps } from "@/features/terminal/types/index";
import { useContestedCliOwners } from "./use-contested-cli-owners";

const EMPTY_PANES: Record<string, TerminalPaneProps> = {};

/**
 * Live center-stage terminal tab title + agent icon, driven by the representative pane.
 * Custom tab titles short-circuit to the user override (terminal icon kept).
 *
 * When `customTitle` is omitted, the hook reads the tab's stored `customTitle` so
 * tab-group popovers stay correct without re-threading the prop.
 */
export function useTerminalCenterTabPresentation(options: {
  contextId: string;
  tabId: string;
  fallbackTitle: string;
  /** Explicit override; omit to read from the terminal store. */
  customTitle?: string | null;
  configuredAgents?: TerminalPaneAgent[];
}): TerminalCenterTabPresentation {
  const { contextId, tabId, fallbackTitle, customTitle: customTitleProp, configuredAgents = [] } =
    options;
  const contestedOwners = useContestedCliOwners();
  const showAgentName = useAgentTitleSettingsStore((s) => s.showAgentNameInTerminalTitles);
  const terminalTabId = tabId || FIXED_TERMINAL_TAB_VALUE;

  const live = useTerminalStore(
    useShallow((s) => {
      if (!contextId) {
        return {
          panes: EMPTY_PANES,
          layout: null as null,
          lastActivePaneId: null as string | null,
          maximizedPaneId: null as string | null,
          storeCustomTitle: undefined as string | undefined,
          storeFallbackTitle: fallbackTitle,
        };
      }
      const scopeKey = getScopeKey(contextId, terminalTabId);
      const tab = getWorkspaceTerminalTabs(s, contextId).find((entry) => entry.id === terminalTabId);
      return {
        panes: s.workspacePanes[scopeKey] ?? EMPTY_PANES,
        layout: s.workspaceLayouts[scopeKey] ?? null,
        lastActivePaneId: s.workspaceActivePaneIds?.[scopeKey] ?? null,
        maximizedPaneId: s.workspaceMaximizedIds?.[scopeKey] ?? null,
        storeCustomTitle: tab?.customTitle,
        storeFallbackTitle: tab?.title ?? fallbackTitle,
      };
    }),
  );

  const customTitle =
    customTitleProp !== undefined ? customTitleProp : live.storeCustomTitle;
  const resolvedFallback = live.storeFallbackTitle || fallbackTitle;

  return useMemo(
    () =>
      resolveTerminalCenterTabPresentation({
        fallbackTitle: resolvedFallback,
        customTitle,
        panes: live.panes,
        layout: live.layout,
        lastActivePaneId: live.lastActivePaneId,
        maximizedPaneId: live.maximizedPaneId,
        configuredAgents,
        contestedOwners,
        showAgentName,
      }),
    [
      resolvedFallback,
      customTitle,
      live.panes,
      live.layout,
      live.lastActivePaneId,
      live.maximizedPaneId,
      configuredAgents,
      contestedOwners,
      showAgentName,
    ],
  );
}

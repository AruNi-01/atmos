"use client";

import { useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  FIXED_TERMINAL_TAB_VALUE,
  useTerminalStore,
} from "@/features/terminal/store/use-terminal-store";
import {
  getScopeKey,
  getTerminalWorkspaceScopeKey,
  getWorkspaceTerminalTabs,
} from "@/features/terminal/store/terminal-store-helpers";
import {
  resolveTerminalCenterTabPresentation,
  type TerminalCenterTabPresentation,
} from "@/features/terminal/lib/terminal-center-tab-presentation";
import type { TerminalPaneAgent, TerminalPaneProps } from "@/features/terminal/types/index";
import { useContestedCliOwners } from "./use-contested-cli-owners";

const EMPTY_PANES: Record<string, TerminalPaneProps> = {};

/**
 * Live center-stage terminal tab title + agent icon, driven by the representative pane.
 * Custom tab titles short-circuit to the user override (terminal icon kept).
 *
 * OSC titles are **stabilized** for the center tab: Grok-style realtime prefixes
 * (spinner / activity) are stripped to the fixed session name, and once a session
 * topic is known, pure realtime updates no longer change the tab text (pane
 * toolbars still follow live OSC). Agent name is shown only when there is no
 * session/cwd/command title yet (avoids an icon-only tab).
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
  const terminalTabId = tabId || FIXED_TERMINAL_TAB_VALUE;
  /** Sticky session topics per pane so realtime OSC churn does not resize the tab. */
  const stickySessionOscByPaneRef = useRef(new Map<string, string>());

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
      const livePanes = s.workspacePanes[scopeKey];
      const hasLivePanes = Boolean(livePanes && Object.keys(livePanes).length > 0);
      const persisted =
        s.persistedTerminalLayouts[
          getTerminalWorkspaceScopeKey(contextId, s.workspaceContexts[contextId] ?? false)
        ];
      const persistedTab = persisted?.tabs.find((entry) => entry.id === terminalTabId);
      return {
        // Inactive/unmounted tabs may not be live-hydrated yet; the persisted
        // cwd/command title is enough for the tab strip.
        panes: hasLivePanes
          ? livePanes!
          : ((persistedTab?.panes as Record<string, TerminalPaneProps> | undefined) ?? EMPTY_PANES),
        layout: s.workspaceLayouts[scopeKey] ?? persistedTab?.layout ?? null,
        lastActivePaneId: s.workspaceActivePaneIds?.[scopeKey] ?? null,
        maximizedPaneId:
          s.workspaceMaximizedIds?.[scopeKey] ?? persistedTab?.maximizedTerminalId ?? null,
        storeCustomTitle: tab?.customTitle ?? persistedTab?.customTitle,
        storeFallbackTitle: tab?.title ?? persistedTab?.title ?? fallbackTitle,
      };
    }),
  );

  const customTitle =
    customTitleProp !== undefined ? customTitleProp : live.storeCustomTitle;
  const resolvedFallback = live.storeFallbackTitle || fallbackTitle;

  return useMemo(() => {
    const presentation = resolveTerminalCenterTabPresentation({
      fallbackTitle: resolvedFallback,
      customTitle,
      panes: live.panes,
      layout: live.layout,
      lastActivePaneId: live.lastActivePaneId,
      maximizedPaneId: live.maximizedPaneId,
      configuredAgents,
      contestedOwners,
      previousSessionOscByPaneId: stickySessionOscByPaneRef.current,
    });

    // Persist sticky session topic for the representative pane.
    if (presentation.sourcePaneId) {
      if (presentation.sessionOscTitle) {
        stickySessionOscByPaneRef.current.set(
          presentation.sourcePaneId,
          presentation.sessionOscTitle,
        );
      } else {
        stickySessionOscByPaneRef.current.delete(presentation.sourcePaneId);
      }
    }

    return presentation;
  }, [
    resolvedFallback,
    customTitle,
    live.panes,
    live.layout,
    live.lastActivePaneId,
    live.maximizedPaneId,
    configuredAgents,
    contestedOwners,
  ]);
}

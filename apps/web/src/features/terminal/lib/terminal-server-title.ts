import type { TerminalTitleUpdatedNotification } from "@atmos/api-types/ws/dto/events";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  readCachedDynamicTitle,
  readCachedOscTitle,
  writeCachedDynamicTitle,
  writeCachedOscTitle,
} from "@/features/terminal/lib/terminal-dynamic-title-cache";
import { mergeServerTerminalTitle } from "@/features/terminal/store/terminal-store-helpers";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

function windowMatches(paneWindow: string, serverWindow: string): boolean {
  return paneWindow === serverWindow || paneWindow.endsWith(`__${serverWindow}`);
}

function matchingPaneTitles(
  workspacePanes: Record<
    string,
    | Record<
        string,
        {
          workspaceId?: string;
          tmuxWindowName?: string;
          label?: string;
          dynamicTitle?: string;
          oscTitle?: string;
        }
      >
    | undefined
  >,
  update: TerminalTitleUpdatedNotification,
): Array<{ dynamicTitle?: string; oscTitle?: string }> {
  const workspaceId = update.workspace_id?.trim() ?? "";
  const windowName = update.tmux_window_name?.trim() ?? "";
  const found: Array<{ dynamicTitle?: string; oscTitle?: string }> = [];
  for (const panes of Object.values(workspacePanes)) {
    if (!panes) continue;
    for (const pane of Object.values(panes)) {
      if (pane.workspaceId !== workspaceId) continue;
      const paneWindow = pane.tmuxWindowName || pane.label || "";
      if (!windowMatches(paneWindow, windowName)) continue;
      found.push({ dynamicTitle: pane.dynamicTitle, oscTitle: pane.oscTitle });
    }
  }
  return found;
}

/** Apply one computer-owned title snapshot to every matching pane. */
export function applyServerTerminalTitle(update: TerminalTitleUpdatedNotification) {
  const workspaceId = update.workspace_id?.trim() ?? "";
  const windowName = update.tmux_window_name?.trim() ?? "";
  if (!workspaceId || !windowName) return;

  const cachedPrevious = {
    dynamicTitle: readCachedDynamicTitle(workspaceId, windowName),
    oscTitle: readCachedOscTitle(workspaceId, windowName),
  };
  const livePanes = matchingPaneTitles(useTerminalStore.getState().workspacePanes, update);
  // Prefer a pane that still has the previous command. The cache may already
  // show the new path from an earlier partial write, and merging against that
  // would keep the old OSC topic.
  const cacheBase =
    livePanes.find((pane) => {
      const next = mergeServerTerminalTitle(pane, update);
      return Boolean(pane.oscTitle) && !next.oscTitle;
    }) ??
    livePanes[0] ??
    cachedPrevious;
  const cached = mergeServerTerminalTitle(cacheBase, update);
  // A dynamic-title switch with no session topic clears the cached OSC.
  // A replay that does not change the dynamic title must not wipe a topic
  // the PTY still has — that made Observer show "Terminal".
  if (cached.dynamicTitle) writeCachedDynamicTitle(workspaceId, windowName, cached.dynamicTitle);
  writeCachedOscTitle(workspaceId, windowName, cached.oscTitle);

  useTerminalStore.setState((state) => {
    let changed = false;
    const workspacePanes = { ...state.workspacePanes };
    for (const [scopeKey, panes] of Object.entries(workspacePanes)) {
      if (!panes) continue;
      let scopeChanged = false;
      const nextPanes = { ...panes };
      for (const [paneId, pane] of Object.entries(panes)) {
        if (pane.workspaceId !== workspaceId) continue;
        const paneWindow = pane.tmuxWindowName || pane.label || "";
        if (!windowMatches(paneWindow, windowName)) continue;
        const next = mergeServerTerminalTitle(pane, update);
        if (pane.dynamicTitle === next.dynamicTitle && pane.oscTitle === next.oscTitle) continue;
        nextPanes[paneId] = {
          ...pane,
          dynamicTitle: next.dynamicTitle,
          oscTitle: next.oscTitle,
        };
        scopeChanged = true;
      }
      if (!scopeChanged) continue;
      workspacePanes[scopeKey] = nextPanes;
      changed = true;
    }
    return changed ? { workspacePanes } : state;
  });
}

let unsubscribe: (() => void) | null = null;

export function initServerTerminalTitles() {
  if (unsubscribe) return;
  unsubscribe = useWebSocketStore.getState().onEvent("terminal_title_updated", (payload) => {
    applyServerTerminalTitle(payload);
  });
}

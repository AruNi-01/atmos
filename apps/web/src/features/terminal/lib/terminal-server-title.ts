import type { TerminalTitleUpdatedNotification } from "@atmos/api-types/ws/dto/events";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import {
  normalizeStoredDynamicTitle,
  writeCachedDynamicTitle,
  writeCachedOscTitle,
} from "@/features/terminal/lib/terminal-dynamic-title-cache";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";

function presentTitle(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function windowMatches(paneWindow: string, serverWindow: string): boolean {
  return paneWindow === serverWindow || paneWindow.endsWith(`__${serverWindow}`);
}

/** Apply one computer-owned title snapshot to every matching pane. */
export function applyServerTerminalTitle(update: TerminalTitleUpdatedNotification) {
  const workspaceId = update.workspace_id?.trim() ?? "";
  const windowName = update.tmux_window_name?.trim() ?? "";
  if (!workspaceId || !windowName) return;

  const dynamicTitle = normalizeStoredDynamicTitle(presentTitle(update.dynamic_title));
  const oscTitle = presentTitle(update.session_title);
  writeCachedDynamicTitle(workspaceId, windowName, dynamicTitle);
  writeCachedOscTitle(workspaceId, windowName, oscTitle);

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
        if (pane.dynamicTitle === dynamicTitle && pane.oscTitle === oscTitle) continue;
        nextPanes[paneId] = { ...pane, dynamicTitle, oscTitle };
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
